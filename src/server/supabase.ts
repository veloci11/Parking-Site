import { handlePrivacyCommands } from "./privacy-commands";
import { requireModerationMfa } from "./moderation-mfa";
import { PARIS_CENTER, REGION_MESSAGE } from "@/lib/paris-region";
import { handleAuthCommands } from "./auth-commands";
import { assertRemoteUploadQuota } from "./upload-quota";
import { parseHistoryQuery, historyCursor } from "./history-pagination";
import { parseAdminUserQuery, adminUserPage } from "./admin-user-pagination";
import { mediaVariantWidth, resizeAuthorizedMedia } from "./media-variants";
import { createServerClient } from "@supabase/ssr";
import { randomUUID } from "node:crypto";
import sharp from "sharp";
import { boundedFormData } from "./uploads";
import { readApiJson } from "./json-body";
import { diagnosticBackendHeaders } from "./request-context";
import {
  parsePageQuery,
  encodeCursor,
  paginatePublicListings,
} from "./pagination";
import {
  publicShowcaseEnabled,
  publicShowcaseListings,
  getPublicShowcaseListing,
} from "./public-showcase";
import { isPublicShowcase } from "@/lib/public-showcase";
import { listingPhotoUrls, validatePhotoLinks } from "./media-links";
import { z } from "zod";
import type { Listing, User, Visit, Message } from "@/lib/types";
import { draftSchema, password } from "./validation";
import { ApiError, assertSameOrigin, effectiveOrigin } from "./security";
export function supabaseConfigured() {
  return !!(
    process.env.NEXT_PUBLIC_SUPABASE_URL &&
    (process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
  );
}
const text = z.string().trim();
function parse<T>(schema: z.ZodType<T>, input: unknown): T {
  const r = schema.safeParse(input);
  if (!r.success)
    throw new ApiError(
      400,
      r.error.issues
        .map((i) => `${i.path.join(".")}: ${i.message}`)
        .join(" · "),
    );
  return r.data;
}
const json = readApiJson;
function assertRealListing(id: string) {
  if (isPublicShowcase(id))
    throw new ApiError(
      409,
      "Cette annonce de démonstration est consultable uniquement.",
      "SHOWCASE_READ_ONLY",
    );
}
const schemaError = (
  e: { message: string; code?: string; details?: string } | null,
) => {
  if (!e) return;
  if (e.message.includes("RATE_LIMITED"))
    throw new ApiError(
      429,
      "Limite d’usage atteinte. Réessayez après sa remise à zéro.",
      "RATE_LIMITED",
      Number(e.details?.match(/retryAfter=(\d+)/)?.[1]) || 60,
    );
  const known: Record<string, [number, string]> = {
    CONVERSATION_BLOCKED: [
      409,
      "Cette conversation est bloquée. Les nouveaux messages et demandes de visite sont désactivés.",
    ],
    REGISTRY_LINK_REQUIRED: [
      409,
      "Un administrateur doit rattacher chaque place physique avant approbation.",
    ],
    REGISTRY_DUPLICATE_SAME_SELLER: [
      409,
      "Cette place est déjà rattachée à une autre de vos annonces.",
    ],
    LOCATION_CONFIRMATION_REQUIRED: [
      400,
      "Confirmez la localisation publique après sa dernière modification.",
    ],
    COMMERCIAL_INVALID: [
      400,
      "Les détails du bien ou leurs justificatifs sont invalides.",
    ],
    TRANSACTION_TYPE_INVALID: [
      400,
      "Choisissez une vente ou une location mensuelle.",
    ],
    OFFER_INVALID: [
      400,
      "Complétez les offres de chaque place : transaction, prix positif, statut cohérent et au moins une place disponible.",
    ],
    CONDITION_INVALID: [400, "Les observations sont invalides."],
    CONDITION_EVIDENCE_REQUIRED: [
      400,
      "Complétez les preuves des observations avant de soumettre.",
    ],
    LAST_ADMIN: [409, "Le dernier administrateur actif doit être conservé."],
    INVALID_CURSOR: [400, "Curseur d’historique invalide."],
    MFA_OR_PERMISSION_REQUIRED: [
      403,
      "La modération requiert les droits adaptés et la double authentification.",
    ],
    MFA_REQUIRED: [403, "Confirmez votre double authentification."],
    UNAUTHENTICATED: [401, "Connectez-vous pour continuer."],
    EMAIL_UNVERIFIED: [403, "Confirmez votre adresse email."],
    FORBIDDEN: [403, "Action non autorisée."],
    NOT_FOUND: [404, "Ressource introuvable."],
    REGION_OUTSIDE_IDF: [400, REGION_MESSAGE],
    VERSION_CONFLICT: [
      409,
      "La version a changé. Rechargez avant de recommencer.",
    ],
    QUOTA_EXCEEDED: [403, "Limite d’annonces actives atteinte."],
    RATE_LIMITED: [429, "Trop de demandes. Réessayez plus tard."],
    MEDIA_NOT_OWNED: [400, "Une photo n’appartient pas à cette annonce."],
    OWNERSHIP_ATTESTATION_REQUIRED: [
      400,
      "Confirmez votre droit à publier cette annonce.",
    ],
  };
  for (const [key, [status, message]] of Object.entries(known))
    if (e.message.includes(key)) throw new ApiError(status, message, key);
  if (e.code === "23505")
    throw new ApiError(409, "Cette ressource existe déjà.", "VERSION_CONFLICT");
  throw new ApiError(
    400,
    "Cette action ne peut pas être enregistrée. Vérifiez les informations.",
    "DATA_ERROR",
  );
};
export async function handleSupabaseApi(request: Request): Promise<Response> {
  const pendingCookies: string[] = [];
  const headers = () => {
    const h = new Headers({ "Cache-Control": "no-store" });
    pendingCookies.forEach((c) => h.append("Set-Cookie", c));
    return h;
  };
  const respond = (
    data: unknown,
    status = 200,
    extra: Record<string, unknown> = {},
  ) => Response.json({ data, ...extra }, { status, headers: headers() });
  const url = new URL(request.url),
    method = request.method,
    path = url.pathname.replace(/^\/api\//, "").replace(/\/$/, "");
  try {
    assertSameOrigin(request);
    const client = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      (process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY)!,
      {
        global: { headers: diagnosticBackendHeaders() },
        cookies: {
          getAll() {
            return (request.headers.get("cookie") || "")
              .split(";")
              .map((c) => c.trim())
              .filter(Boolean)
              .map((c) => {
                const i = c.indexOf("=");
                return {
                  name: c.slice(0, i),
                  value: decodeURIComponent(c.slice(i + 1)),
                };
              });
          },
          setAll(cookies) {
            for (const { name, value, options } of cookies) {
              pendingCookies.push(
                `${name}=${encodeURIComponent(value)}; Path=${options.path || "/"}; SameSite=Lax; HttpOnly${new URL(effectiveOrigin(request)).protocol === "https:" ? "; Secure" : ""}${options.maxAge !== undefined ? `; Max-Age=${options.maxAge}` : ""}${options.expires ? `; Expires=${new Date(options.expires).toUTCString()}` : ""}`,
              );
            }
          },
        },
      },
    );
    async function user(
      required = false,
      verified = false,
    ): Promise<User | null> {
      const {
        data: { user: u },
        error,
      } = await client.auth.getUser();
      if (error || !u) {
        if (required)
          throw new ApiError(
            401,
            "Connectez-vous pour continuer.",
            "UNAUTHENTICATED",
          );
        return null;
      }
      const [p, r, s] = await Promise.all([
        client
          .from("profiles")
          .select("name,seller_type")
          .eq("user_id", u.id)
          .single(),
        client.from("app_roles").select("role").eq("user_id", u.id).single(),
        client
          .from("account_statuses")
          .select("status")
          .eq("user_id", u.id)
          .single(),
      ]);
      if (s.error || s.data?.status !== "active") {
        if (required)
          throw new ApiError(403, "Ce compte n’est pas actif.", "FORBIDDEN");
        return null;
      }
      if (verified && !u.email_confirmed_at)
        throw new ApiError(403, "Confirmez votre email.", "EMAIL_UNVERIFIED");
      return {
        id: u.id,
        name: p.data?.name || "Membre",
        email: u.email || "",
        role: r.data?.role || "member",
        emailVerified: !!u.email_confirmed_at,
        sellerType: p.data?.seller_type ?? null,
      };
    }
    async function rpc(name: string, args: Record<string, unknown>) {
      const { data, error } = await client.rpc(name, args);
      schemaError(error);
      return data;
    }
    async function moderationUser() {
      const u = (await user(true, true))!;
      if (!["moderator", "admin"].includes(u.role))
        throw new ApiError(403, "Accès réservé à la modération.", "FORBIDDEN");
      await requireModerationMfa(
        client,
        process.env.GP_REQUIRE_ADMIN_MFA === "true",
      );
      return u;
    }
    const visit = (r: any): Visit => ({
      id: r.id,
      conversationId: r.conversation_id,
      status: r.status,
      proposedAt: r.proposed_at,
      confirmedAt: r.confirmed_at,
      version: r.row_version,
    });
    const message = (r: any): Message => ({
      id: r.id,
      conversationId: r.conversation_id,
      senderId: r.sender_id,
      body: r.body,
      createdAt: r.created_at,
    });
    if (path === "session" && method === "GET")
      return respond(await user(), 200, { mode: "supabase" });
    if (path === "health" && method === "GET") {
      const { error } = await client
        .from("published_listings")
        .select("id", { head: true, count: "exact" });
      if (error)
        throw new ApiError(
          503,
          "La base de données doit être initialisée.",
          "MIGRATIONS_REQUIRED",
        );
      return respond({ status: "ok", mode: "supabase", billingEnabled: false });
    }
    if (
      (path === "auth/callback" && method === "GET") ||
      (["auth/register", "auth/forgot", "auth/reset"].includes(path) &&
        method === "POST")
    )
      return handleAuthCommands(request, path.slice("auth/".length));
    if (path === "auth/login" && method === "POST") {
      const input = parse(
        z.object({ email: text.email(), password: z.string().max(128) }),
        await json(request),
      );
      const { error } = await client.auth.signInWithPassword(input);
      if (error)
        throw new ApiError(
          401,
          "Email ou mot de passe incorrect, ou adresse non confirmée.",
          "INVALID_CREDENTIALS",
        );
      return respond(await user(true));
    }
    if (path === "auth/logout" && method === "POST") {
      await client.auth.signOut({ scope: "local" });
      return respond(null);
    }
    if (["auth/demo", "local-mailbox"].includes(path))
      throw new ApiError(
        404,
        "Cette fonctionnalité appartient à la démonstration locale.",
        "NOT_FOUND",
      );
    if (path === "auth/verify" && method === "POST")
      throw new ApiError(
        400,
        "Utilisez le lien de confirmation reçu par email.",
      );
    if (path === "listings" && method === "GET") {
      const { filters, limit, cursor } = parsePageQuery(url);
      const result = await rpc("gp_catalog_page_v2", {
        p_filters: filters,
        p_cursor: cursor,
        p_limit: limit,
      });
      // An empty filtered search must never substitute examples for real offers.
      // Show the explicit preview only while the entire public inventory is empty.
      if (publicShowcaseEnabled() && result.total === 0) {
        const inventory = await client
          .from("published_listings")
          .select("id", { count: "exact", head: true });
        schemaError(inventory.error);
        if (inventory.count === 0) {
          const page = paginatePublicListings(
            publicShowcaseListings(),
            filters,
            limit,
            cursor,
          );
          return respond(page.items, 200, {
            total: page.total,
            nextCursor: page.nextCursor,
            showcase: true,
          });
        }
      }
      return respond(result.items, 200, {
        total: result.total,
        nextCursor: encodeCursor(result.nextPosition, filters),
      });
    }
    if (path === "me/listings" && method === "GET") {
      const u = (await user(true))!;
      const { data, error } = await client
        .from("listings")
        .select("draft,row_version,lifecycle_state")
        .eq("seller_id", u.id)
        .order("updated_at", { ascending: false });
      schemaError(error);
      return respond(
        data?.map((l) => ({
          ...l.draft,
          version: l.row_version,
          status: l.lifecycle_state,
        })) || [],
      );
    }
    if (path === "listings" && method === "POST") {
      const u = (await user(true))!,
        input = parse(draftSchema, await json(request)),
        id = randomUUID(),
        date = new Date().toISOString();
      const value = {
        id,
        slug: "nouvelle-annonce",
        title: "",
        description: "",
        city: "Paris",
        district: "",
        priceCents: 0,
        type: "covered",
        spaces: [
          {
            id: randomUUID(),
            number: "",
            level: 0,
            levelKnown: false,
            areaM2: null,
            lengthM: null,
            widthM: null,
            clearanceM: null,
          },
        ],
        photos: [],
        quality: {
          floor: "Non renseigné",
          lighting: "Non renseigné",
          humidity: "Non renseignée",
          access: "Non renseigné",
          maneuver: "Non renseignée",
          observations: "",
        },
        locationPrecision: "area",
        coordinates: [...PARIS_CENTER],
        sceneAvailable: false,
        isDemo: false,
        status: "draft",
        version: 1,
        sellerName: u.name,
        createdAt: date,
        updatedAt: date,
        ...input,
      };
      value.id = id;
      value.version = 1;
      validatePhotoLinks(value);
      return respond(
        await rpc("gp_listing", {
          p_id: id,
          p_action: "create",
          p_payload: value,
          p_version: null,
        }),
        201,
      );
    }
    const listing = path.match(
      /^listings\/([^/]+)(?:\/(submit|lifecycle|preview))?$/,
    );
    if (listing) {
      const [, id, action] = listing;
      if (method !== "GET") assertRealListing(id);
      if (
        method === "GET" &&
        !action &&
        url.searchParams.get("draft") !== "1"
      ) {
        const showcase = getPublicShowcaseListing(id);
        if (showcase) return respond(showcase);
      }
      if (method === "GET" && action === "preview") {
        await user(true);
        return respond(await rpc("gp_listing_preview", { p_id: id }));
      }
      if (method === "GET") {
        if (url.searchParams.get("draft") === "1") {
          const u = (await user(true))!;
          const { data, error } = await client
            .from("listings")
            .select("draft,row_version,lifecycle_state")
            .eq("id", id)
            .eq("seller_id", u.id)
            .maybeSingle();
          schemaError(error);
          if (!data)
            throw new ApiError(404, "Annonce introuvable.", "NOT_FOUND");
          return respond({
            ...data.draft,
            version: data.row_version,
            status: data.lifecycle_state,
          });
        }
        const { data, error } = await client
          .from("published_listings")
          .select("payload")
          .eq("id", id)
          .maybeSingle();
        schemaError(error);
        if (!data)
          throw new ApiError(
            404,
            "Cette annonce n’est plus disponible.",
            "NOT_FOUND",
          );
        const scene = await rpc("gp_effective_scene_available", {
          p_listing_id: id,
        });
        return respond({ ...data.payload, sceneAvailable: !!scene });
      }
      await user(true, action === "submit");
      const input = await json(request);
      if (!Number.isInteger(input.version))
        throw new ApiError(409, "Version manquante.", "VERSION_CONFLICT");
      if (method === "PATCH" && !action) {
        const patch = parse(draftSchema, input);
        delete patch.version;
        return respond(
          await rpc("gp_listing", {
            p_id: id,
            p_action: "update",
            p_payload: patch,
            p_version: input.version,
          }),
        );
      }
      if (method === "POST" && action === "submit")
        return respond(
          await rpc("gp_listing", {
            p_id: id,
            p_action: "submit",
            p_payload: { ownershipAttested: input.ownershipAttested === true },
            p_version: input.version,
          }),
        );
      if (method === "POST" && action === "lifecycle") {
        parse(z.enum(["pause", "resume", "sold", "withdraw"]), input.action);
        return respond(
          await rpc("gp_listing", {
            p_id: id,
            p_action: input.action,
            p_payload: {},
            p_version: input.version,
          }),
        );
      }
    }
    if (path === "favorites" && method === "GET") {
      const u = (await user(true))!;
      const { data, error } = await client
        .from("favorites")
        .select("listing_id")
        .eq("user_id", u.id);
      schemaError(error);
      return respond(data?.map((f) => f.listing_id) || []);
    }
    const favorite = path.match(/^favorites\/([^/]+)$/);
    if (favorite && ["PUT", "DELETE"].includes(method)) {
      assertRealListing(favorite[1]);
      const u = (await user(true))!;
      const result =
        method === "PUT"
          ? await client
              .from("favorites")
              .upsert(
                { user_id: u.id, listing_id: favorite[1] },
                { ignoreDuplicates: true },
              )
          : await client
              .from("favorites")
              .delete()
              .eq("user_id", u.id)
              .eq("listing_id", favorite[1]);
      schemaError(result.error);
      return respond({ saved: method === "PUT" });
    }
    if (
      path === "admin/users" ||
      path === "admin/audit" ||
      /^admin\/users\/[^/]+\/decision$/.test(path)
    ) {
      const actor = await moderationUser();
      if (actor.role !== "admin")
        throw new ApiError(
          403,
          "Accès réservé aux administrateurs.",
          "FORBIDDEN",
        );
      if (path === "admin/users" && method === "GET") {
        const page = parseAdminUserQuery(url);
        if (!page) return respond(await rpc("gp_admin_users", {}));
        const rows = await rpc("gp_admin_users_page", {
          p_query: page.query,
          p_after: page.after,
          p_limit: page.limit,
        });
        const result = adminUserPage(rows, page);
        return respond(result.items, 200, { nextCursor: result.nextCursor });
      }
      const decision = path.match(/^admin\/users\/([^/]+)\/decision$/);
      if (decision && method === "POST") {
        const input = parse(
          z
            .object({
              version: z.number().int().positive(),
              status: z.enum(["active", "suspended"]).optional(),
              role: z.enum(["member", "moderator", "admin"]).optional(),
              reason: text.min(15).max(2000),
            })
            .strict()
            .refine((x) => x.status !== undefined || x.role !== undefined),
          await json(request),
        );
        return respond(
          await rpc("gp_admin_user_decision", {
            p_id: decision[1],
            p_version: input.version,
            p_status: input.status ?? null,
            p_role: input.role ?? null,
            p_reason: input.reason,
          }),
        );
      }
      if (path === "admin/audit" && method === "GET") {
        const { limit, after } = parseHistoryQuery(url, "admin:audit");
        const result = await rpc("gp_admin_audit_page", {
          p_after: after ? { id: after.id, createdAt: after.createdAt } : null,
          p_limit: limit,
        });
        const rows = result.items;
        return respond(
          rows.slice(0, limit).map((r: any) => ({
            id: r.id,
            actorId: r.actor_id,
            requestId: r.request_id ?? null,
            before: r.state_before ?? null,
            after: r.state_after ?? null,
            action: r.action,
            targetId: r.target_id,
            createdAt: r.created_at,
          })),
          200,
          { nextCursor: historyCursor("admin:audit", rows, limit) },
        );
      }
    }
    if (path === "admin/publications" && method === "GET") {
      await moderationUser();
      const { data, error } = await client
        .from("listings")
        .select("draft,row_version,lifecycle_state")
        .not("last_published", "is", null)
        .not("lifecycle_state", "in", "(sold,withdrawn,suspended)")
        .order("updated_at", { ascending: false });
      schemaError(error);
      return respond(
        (data || []).map((l) => ({
          ...l.draft,
          version: l.row_version,
          status: l.lifecycle_state,
        })),
      );
    }
    const suspension = path.match(/^admin\/listings\/([^/]+)\/suspend$/);
    if (suspension && method === "POST") {
      await moderationUser();
      const input = parse(
        z
          .object({
            version: z.number().int().positive(),
            reason: text.min(15).max(2000),
          })
          .strict(),
        await json(request),
      );
      return respond(
        await rpc("gp_suspend_publication", {
          p_id: suspension[1],
          p_version: input.version,
          p_reason: input.reason,
        }),
      );
    }
    if (path === "admin/revisions" && method === "GET") {
      await moderationUser();
      const { data, error } = await client
        .from("listings")
        .select("draft,row_version,lifecycle_state")
        .eq("lifecycle_state", "pending")
        .order("updated_at");
      schemaError(error);
      return respond(
        data?.map((l) => ({
          ...l.draft,
          version: l.row_version,
          status: l.lifecycle_state,
        })) || [],
      );
    }
    const moderation = path.match(/^admin\/revisions\/([^/]+)\/decision$/);
    if (moderation && method === "POST") {
      await moderationUser();
      const input = parse(
        z.object({
          decision: z.enum(["approve", "changes_requested", "reject"]),
          reason: text.max(2000).optional(),
          version: z.number().int(),
        }),
        await json(request),
      );
      if (input.decision === "approve") {
        const { data: l, error } = await client
          .from("listings")
          .select("draft,row_version")
          .eq("id", moderation[1])
          .single();
        schemaError(error);
        if (!l || l.row_version !== input.version)
          throw new ApiError(409, "Version modifiée.", "VERSION_CONFLICT");
        const { data: assets, error: assetsError } = await client
          .from("media_assets")
          .select("id,object_key")
          .eq("listing_id", moderation[1]);
        schemaError(assetsError);
        for (const photo of listingPhotoUrls(l.draft)) {
          const id = photo.match(/^\/api\/media\/([a-f0-9-]{36})$/)?.[1],
            asset = assets?.find((a) => a.id === id);
          if (!asset) throw new ApiError(400, "Photo non autorisée.");
          const { data: bytes, error: readError } = await client.storage
            .from("private-uploads")
            .download(asset.object_key);
          schemaError(readError);
          let clean: Buffer;
          try {
            if (bytes!.size > 10485760) throw new Error();
            const image = sharp(Buffer.from(await bytes!.arrayBuffer()), {
              limitInputPixels: 30000000,
            });
            const metadata = await image.metadata();
            if (!["jpeg", "png", "webp"].includes(metadata.format || ""))
              throw new Error();
            clean = await image
              .rotate()
              .resize({
                width: 1920,
                height: 1440,
                fit: "inside",
                withoutEnlargement: true,
              })
              .webp({ quality: 85 })
              .toBuffer();
          } catch {
            throw new ApiError(
              400,
              "Une photo doit être remplacée : format illisible ou non autorisé.",
            );
          }
          const { error: writeError } = await client.storage
            .from("public-approved")
            .upload(`${id}.webp`, clean, {
              contentType: "image/webp",
              cacheControl: "0",
              upsert: false,
            });
          if (
            writeError &&
            !/already exists|duplicate/i.test(writeError.message)
          )
            schemaError(writeError);
        }
      }
      return respond(
        await rpc("gp_moderate", {
          p_id: moderation[1],
          p_decision: input.decision,
          p_version: input.version,
          p_reason: input.reason || null,
        }),
      );
    }
    if (path === "conversations" && method === "GET") {
      await user(true);
      return respond(await rpc("gp_conversations", {}));
    }
    if (path === "conversations" && method === "POST") {
      await user(true, true);
      const input = parse(
        z.object({ listingId: z.string().uuid() }),
        await json(request),
      );
      assertRealListing(input.listingId);
      const id = await rpc("gp_contact", { p_listing_id: input.listingId });
      const all = await rpc("gp_conversations", {});
      return respond(
        all.find((c: any) => c.id === id),
        201,
      );
    }
    const block = path.match(/^conversations\/([^/]+)\/block$/);
    if (block && ["GET", "PUT", "DELETE"].includes(method)) {
      await user(true, true);
      return respond(
        await rpc(
          method === "GET"
            ? "gp_conversation_block_state"
            : "gp_set_conversation_block",
          {
            p_conversation_id: block[1],
            ...(method === "GET" ? {} : { p_blocked: method === "PUT" }),
          },
        ),
      );
    }
    const messages = path.match(/^conversations\/([^/]+)\/messages$/);
    if (messages) {
      await user(true, true);
      if (method === "GET") {
        const { limit, after } = parseHistoryQuery(
          url,
          `messages:${messages[1]}`,
        );
        const result = await rpc("gp_messages_page", {
          p_conversation_id: messages[1],
          p_after: after ? { id: after.id, createdAt: after.createdAt } : null,
          p_limit: limit,
        });
        await rpc("gp_messages_read", { p_conversation_id: messages[1] });
        const rows = result.items;
        return respond(rows.slice(0, limit).reverse().map(message), 200, {
          nextCursor: historyCursor(`messages:${messages[1]}`, rows, limit),
        });
      }
      if (method === "POST") {
        const input = parse(
          z.object({
            body: text.min(1).max(4000),
            clientRequestId: z.string().min(8).max(100),
          }),
          await json(request),
        );
        return respond(
          message(
            await rpc("gp_message", {
              p_conversation_id: messages[1],
              p_body: input.body,
              p_request_id: input.clientRequestId,
            }),
          ),
          201,
        );
      }
    }
    const visits = path.match(
      /^conversations\/([^/]+)\/(?:visits|visit-requests)$/,
    );
    if (visits) {
      await user(true, true);
      if (method === "GET") {
        const { data: c } = await client
          .from("conversations")
          .select("id")
          .eq("id", visits[1])
          .maybeSingle();
        if (!c) throw new ApiError(404, "Conversation introuvable.");
        const { data, error } = await client
          .from("visit_requests")
          .select("*")
          .eq("conversation_id", visits[1])
          .order("created_at", { ascending: false });
        schemaError(error);
        return respond(data?.map(visit) || []);
      }
      if (method === "POST") {
        const input = parse(
          z.object({
            proposedAt: z
              .string()
              .datetime({ offset: true })
              .nullable()
              .optional(),
            clientRequestId: z.string().min(8).max(100),
          }),
          await json(request),
        );
        return respond(
          visit(
            await rpc("gp_visit", {
              p_conversation_id: visits[1],
              p_request_id: input.clientRequestId,
              p_proposed_at: input.proposedAt || null,
            }),
          ),
          201,
        );
      }
    }
    const decision = path.match(
      /^(?:visits|visit-requests)\/([^/]+)\/decision$/,
    );
    if (decision && method === "POST") {
      await user(true, true);
      const input = parse(
        z.object({
          action: z.enum(["accept", "decline", "cancel"]),
          version: z.number().int(),
          confirmedAt: z
            .string()
            .datetime({ offset: true })
            .nullable()
            .optional(),
        }),
        await json(request),
      );
      return respond(
        visit(
          await rpc("gp_visit_decision", {
            p_id: decision[1],
            p_action: input.action,
            p_version: input.version,
            p_confirmed_at: input.confirmedAt || null,
          }),
        ),
      );
    }
    if (path === "uploads" && method === "POST") {
      const u = (await user(true))!;
      if (Number(request.headers.get("content-length") || 0) > 16 * 1024 * 1024)
        throw new ApiError(413, "Image trop volumineuse.");
      const form = await boundedFormData(request),
        file = form.get("file"),
        listingId = String(form.get("listingId") || "");
      const { data: l } = await client
        .from("listings")
        .select("id")
        .eq("id", listingId)
        .eq("seller_id", u.id)
        .maybeSingle();
      if (!l) throw new ApiError(404, "Annonce introuvable.");
      if (!(file instanceof File) || file.size > 10485760 || file.size < 20)
        throw new ApiError(400, "Choisissez une image de 10 Mo maximum.");
      let output: Buffer;
      try {
        const image = sharp(Buffer.from(await file.arrayBuffer()), {
          limitInputPixels: 30000000,
        });
        const metadata = await image.metadata();
        if (!["jpeg", "png", "webp"].includes(metadata.format || ""))
          throw new Error();
        output = await image
          .rotate()
          .resize({
            width: 1920,
            height: 1440,
            fit: "inside",
            withoutEnlargement: true,
          })
          .webp({ quality: 85 })
          .toBuffer();
      } catch {
        throw new ApiError(400, "Image illisible ou format non autorisé.");
      }
      const id = randomUUID(),
        objectKey = `${u.id}/${listingId}/${id}.webp`;
      await assertRemoteUploadQuota(client, output.length);
      const { error } = await client.storage
        .from("private-uploads")
        .upload(objectKey, output, { contentType: "image/webp" });
      if (error) await assertRemoteUploadQuota(client, output.length);
      schemaError(error);
      const insert = await client.from("media_assets").insert({
        id,
        owner_id: u.id,
        listing_id: listingId,
        object_key: objectKey,
        mime: "image/webp",
      });
      schemaError(insert.error);
      return respond({ id, url: `/api/media/${id}` }, 201);
    }
    const media = path.match(/^media\/([a-f0-9-]{36})$/);
    if (media && method === "GET") {
      let download = await client.storage
        .from("public-approved")
        .download(`${media[1]}.webp`);
      if (download.error) {
        await user(true);
        const { data: asset, error } = await client
          .from("media_assets")
          .select("object_key")
          .eq("id", media[1])
          .maybeSingle();
        schemaError(error);
        if (!asset) throw new ApiError(404, "Média introuvable.");
        download = await client.storage
          .from("private-uploads")
          .download(asset.object_key);
      }
      if (download.error || !download.data)
        throw new ApiError(404, "Média introuvable.");
      const bytes = await resizeAuthorizedMedia(
        Buffer.from(await download.data.arrayBuffer()),
        mediaVariantWidth(url),
      );
      return new Response(new Uint8Array(bytes), {
        headers: {
          ...Object.fromEntries(headers()),
          "Content-Type": "image/webp",
          "Cache-Control": "private, no-store",
          "X-Content-Type-Options": "nosniff",
        },
      });
    }
    if (path === "notifications" && method === "GET") {
      const u = (await user(true))!;
      const [items, count] = await Promise.all([
        client
          .from("notifications")
          .select("id,type,title,body,url,created_at,read_at")
          .eq("user_id", u.id)
          .order("created_at", { ascending: false })
          .limit(100),
        client
          .from("notifications")
          .select("id", { head: true, count: "exact" })
          .eq("user_id", u.id)
          .is("read_at", null),
      ]);
      schemaError(items.error);
      schemaError(count.error);
      return respond(
        items.data?.map((n) => ({
          id: n.id,
          type: n.type,
          title: n.title,
          body: n.body,
          url: n.url,
          createdAt: n.created_at,
          readAt: n.read_at,
        })) || [],
        200,
        { unread: count.count || 0 },
      );
    }
    if (path === "notifications/read" && method === "POST") {
      await user(true);
      const input = parse(
        z.object({ ids: z.array(z.string().uuid()).max(100).optional() }),
        await json(request),
      );
      return respond({
        updated: await rpc("gp_notifications_read", {
          p_ids: input.ids || null,
        }),
      });
    }
    if (path === "me/notification-settings" && method === "GET") {
      const u = (await user(true))!;
      const { data, error } = await client
        .from("profiles")
        .select("email_notifications")
        .eq("user_id", u.id)
        .single();
      schemaError(error);
      return respond({ emailEnabled: data?.email_notifications !== false });
    }
    if (path === "me/notification-settings" && method === "PATCH") {
      const u = (await user(true))!;
      const input = parse(
        z.object({ emailEnabled: z.boolean() }),
        await json(request),
      );
      const { error } = await client
        .from("profiles")
        .update({ email_notifications: input.emailEnabled })
        .eq("user_id", u.id);
      schemaError(error);
      return respond(input);
    }
    if (path === "admin/reports" && method === "GET") {
      await moderationUser();
      const { data, error } = await client
        .from("reports")
        .select(
          "id,listing_id,reason,status,row_version,created_at,decision_reason",
        )
        .order("created_at", { ascending: false })
        .limit(100);
      schemaError(error);
      return respond(
        data?.map((r) => ({
          id: r.id,
          listingId: r.listing_id,
          reason: r.reason,
          status: r.status,
          version: r.row_version,
          createdAt: r.created_at,
          decisionReason: r.decision_reason,
        })) || [],
      );
    }
    const reportDecision = path.match(/^admin\/reports\/([^/]+)\/decision$/);
    if (reportDecision && method === "POST") {
      await moderationUser();
      const input = parse(
        z.object({
          status: z.enum(["reviewed", "dismissed"]),
          reason: text.min(5).max(2000),
          version: z.number().int(),
        }),
        await json(request),
      );
      const r = await rpc("gp_report_decision", {
        p_id: reportDecision[1],
        p_status: input.status,
        p_reason: input.reason,
        p_version: input.version,
      });
      return respond({
        id: r.id,
        listingId: r.listing_id,
        reason: r.reason,
        status: r.status,
        version: r.row_version,
        createdAt: r.created_at,
        decisionReason: r.decision_reason,
      });
    }
    if (path === "mfa" && method === "GET") {
      const u = (await user(true))!;
      const [
        { data: assurance, error: assuranceError },
        { data: factors, error: factorsError },
      ] = await Promise.all([
        client.auth.mfa.getAuthenticatorAssuranceLevel(),
        client.auth.mfa.listFactors(),
      ]);
      if (assuranceError || factorsError)
        throw new ApiError(
          400,
          "Impossible de consulter votre double authentification.",
        );
      const required = await rpc("gp_mfa_required", {});
      return respond({
        supported: true,
        currentLevel: assurance.currentLevel,
        nextLevel: assurance.nextLevel,
        factors: factors.all
          .filter((f) => f.factor_type === "totp")
          .map((f) => ({
            id: f.id,
            name: f.friendly_name || "Application d’authentification",
            status: f.status,
          })),
        requiredForAdmin:
          ["moderator", "admin"].includes(u.role) &&
          (required || process.env.GP_REQUIRE_ADMIN_MFA === "true"),
      });
    }
    if (path === "mfa/enroll" && method === "POST") {
      await user(true, true);
      const { data, error } = await client.auth.mfa.enroll({
        factorType: "totp",
        friendlyName: "GP Authenticator",
      });
      if (error || data.type !== "totp")
        throw new ApiError(
          400,
          "Impossible de préparer un authentificateur. Vérifiez les facteurs déjà inscrits.",
        );
      return respond({
        factorId: data.id,
        qrCode: data.totp.qr_code,
        secret: data.totp.secret,
      });
    }
    if (path === "mfa/challenge" && method === "POST") {
      await user(true, true);
      const input = parse(
        z.object({ factorId: z.string().uuid() }),
        await json(request),
      );
      const { data, error } = await client.auth.mfa.challenge({
        factorId: input.factorId,
      });
      if (error)
        throw new ApiError(
          400,
          "Impossible de créer un défi pour cet authentificateur.",
        );
      return respond({ challengeId: data.id, expiresAt: data.expires_at });
    }
    if (path === "mfa/verify" && method === "POST") {
      await user(true, true);
      const input = parse(
        z.object({
          factorId: z.string().uuid(),
          challengeId: z.string().uuid(),
          code: z.string().regex(/^\d{6}$/),
        }),
        await json(request),
      );
      const { error } = await client.auth.mfa.verify(input);
      if (error)
        throw new ApiError(
          400,
          "Le code est incorrect ou expiré. Recommencez le défi.",
          "MFA_INVALID",
        );
      return respond({ verified: true });
    }
    if (path === "mfa/unenroll" && method === "POST") {
      const u = (await user(true, true))!;
      const input = parse(
        z.object({
          factorId: z.string().uuid(),
          password: z.string().max(128),
        }),
        await json(request),
      );
      const { data: assurance, error: assuranceError } =
        await client.auth.mfa.getAuthenticatorAssuranceLevel();
      if (assuranceError || assurance.currentLevel !== "aal2")
        throw new ApiError(
          403,
          "Confirmez d’abord votre double authentification.",
          "MFA_REQUIRED",
        );
      const { createClient } = await import("@supabase/supabase-js");
      const verifier = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        (process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
          process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY)!,
        { auth: { persistSession: false, autoRefreshToken: false } },
      );
      const checked = await verifier.auth.signInWithPassword({
        email: u.email,
        password: input.password,
      });
      if (checked.error)
        throw new ApiError(
          403,
          "Confirmez votre mot de passe.",
          "REAUTH_REQUIRED",
        );
      await verifier.auth.signOut({ scope: "local" });
      const { error } = await client.auth.mfa.unenroll({
        factorId: input.factorId,
      });
      if (error)
        throw new ApiError(400, "Impossible de retirer cet authentificateur.");
      return respond({ removed: true });
    }
    if (path === "me/profile" && method === "PATCH") {
      const u = (await user(true))!;
      const input = parse(
        z
          .object({
            name: text.min(2).max(80).optional(),
            sellerType: z
              .enum(["private", "professional"])
              .nullable()
              .optional(),
          })
          .strict()
          .refine((x) => Object.keys(x).length > 0),
        await json(request),
      );
      const patch = {
        ...(input.name ? { name: input.name } : {}),
        ...(input.sellerType !== undefined
          ? { seller_type: input.sellerType }
          : {}),
      };
      const { error } = await client
        .from("profiles")
        .update(patch)
        .eq("user_id", u.id);
      schemaError(error);
      return respond({ ...u, ...input });
    }
    if (path === "me/export" && ["GET", "POST"].includes(method))
      return handlePrivacyCommands(request, "export");
    if (path === "me/delete" && method === "POST")
      return handlePrivacyCommands(request, "delete");
    if (path === "reports" && method === "POST") {
      const u = (await user(true, true))!;
      const input = parse(
        z.object({
          listingId: z.string().uuid(),
          reason: text.min(5).max(2000),
        }),
        await json(request),
      );
      assertRealListing(input.listingId);
      const { data, error } = await client
        .from("reports")
        .insert({
          user_id: u.id,
          listing_id: input.listingId,
          reason: input.reason,
        })
        .select("id")
        .single();
      schemaError(error);
      return respond(data, 201);
    }
    throw new ApiError(404, "Ressource introuvable.", "NOT_FOUND");
  } catch (e) {
    if (e instanceof ApiError) {
      const h = headers();
      if (e.status === 429) h.set("Retry-After", String(e.retryAfter ?? 60));
      return Response.json(
        { error: e.message, code: e.code },
        { status: e.status, headers: h },
      );
    }
    console.error(
      "[gp-supabase]",
      e instanceof Error ? e.name : "UnknownError",
    );
    return Response.json(
      {
        error: "Le service est temporairement indisponible.",
        code: "SERVICE_UNAVAILABLE",
      },
      { status: 503, headers: headers() },
    );
  }
}
