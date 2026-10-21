import { mediaVariantWidth, resizeAuthorizedMedia } from "./media-variants";
import { createServerClient } from "@supabase/ssr";
import { randomUUID } from "node:crypto";
import sharp from "sharp";
import { boundedFormData } from "./uploads";
import { readBoundedJson } from "./json-body";
import { parsePageQuery, encodeCursor } from "./pagination";
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
const json = readBoundedJson;
const schemaError = (e: { message: string; code?: string } | null) => {
  if (!e) return;
  const known: Record<string, [number, string]> = {
    CONVERSATION_BLOCKED: [
      409,
      "Cette conversation est bloquée. Les nouveaux messages et demandes de visite sont désactivés.",
    ],
    MFA_OR_PERMISSION_REQUIRED: [
      403,
      "La modération requiert les droits adaptés et la double authentification si elle est activée.",
    ],
    MFA_REQUIRED: [403, "Confirmez votre double authentification."],
    UNAUTHENTICATED: [401, "Connectez-vous pour continuer."],
    EMAIL_UNVERIFIED: [403, "Confirmez votre adresse email."],
    FORBIDDEN: [403, "Action non autorisée."],
    NOT_FOUND: [404, "Ressource introuvable."],
    VERSION_CONFLICT: [
      409,
      "La version a changé. Rechargez avant de recommencer.",
    ],
    QUOTA_EXCEEDED: [403, "Limite de 10 annonces actives atteinte."],
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
        client.from("profiles").select("name").eq("user_id", u.id).single(),
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
      if (process.env.GP_REQUIRE_ADMIN_MFA === "true") {
        const { data, error } =
          await client.auth.mfa.getAuthenticatorAssuranceLevel();
        if (error || data.currentLevel !== "aal2")
          throw new ApiError(
            403,
            "Confirmez votre double authentification avant de continuer.",
            "MFA_REQUIRED",
          );
      }
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
    if (path === "auth/callback" && method === "GET") {
      const code = url.searchParams.get("code");
      if (!code) throw new ApiError(400, "Lien de confirmation invalide.");
      const { error } = await client.auth.exchangeCodeForSession(code);
      if (error) throw new ApiError(400, "Lien invalide ou expiré.");
      const next = url.searchParams.get("next");
      const location = new URL(
        next === "/reinitialiser" ? "/reinitialiser" : "/compte",
        effectiveOrigin(request),
      );
      const h = headers();
      h.set("Location", location.toString());
      return new Response(null, { status: 303, headers: h });
    }
    if (path === "auth/register" && method === "POST") {
      const input = parse(
        z.object({
          name: text.min(2).max(80),
          email: text.toLowerCase().email().max(254),
          password,
        }),
        await json(request),
      );
      const { data, error } = await client.auth.signUp({
        email: input.email,
        password: input.password,
        options: {
          data: { name: input.name },
          emailRedirectTo: `${effectiveOrigin(request)}/api/auth/callback?next=/compte`,
        },
      });
      if (error)
        throw new ApiError(
          400,
          "Inscription impossible. Vérifiez les informations ou réessayez plus tard.",
          "AUTH_ERROR",
        );
      return respond(
        data.user
          ? {
              id: data.user.id,
              name: input.name,
              email: input.email,
              role: "member",
              emailVerified: !!data.user.email_confirmed_at,
            }
          : null,
        201,
        {
          mode: "supabase",
          message:
            "Consultez votre boîte email pour confirmer votre inscription.",
        },
      );
    }
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
    if (path === "auth/forgot" && method === "POST") {
      const input = parse(
        z.object({ email: text.email() }),
        await json(request),
      );
      await client.auth.resetPasswordForEmail(input.email, {
        redirectTo: `${effectiveOrigin(request)}/api/auth/callback?next=/reinitialiser`,
      });
      return respond({
        message:
          "Si un compte correspond, un email de récupération a été envoyé.",
      });
    }
    if (path === "auth/reset" && method === "POST") {
      await user(true);
      const input = parse(
        z.object({ password, token: z.string().optional() }),
        await json(request),
      );
      const { error } = await client.auth.updateUser({
        password: input.password,
      });
      if (error)
        throw new ApiError(
          400,
          "Réinitialisation impossible. Ouvrez le lien reçu par email.",
        );
      await client.auth.signOut();
      return respond({ reset: true });
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
      const result = await rpc("gp_catalog_page", {
        p_query: filters.query,
        p_type: filters.type,
        p_price_max: filters.maxPrice,
        p_area_min: filters.minArea,
        p_sort: filters.sort,
        p_cursor: cursor,
        p_limit: limit,
        p_scene: filters.scene,
      });
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
      const value: Listing = {
        id,
        slug: "nouvelle-annonce",
        title: "",
        description: "",
        city: "Lyon",
        district: "",
        priceCents: 0,
        type: "covered",
        spaces: [
          {
            id: randomUUID(),
            number: "",
            level: -1,
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
        coordinates: [4.85, 45.76],
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
    const listing = path.match(/^listings\/([^/]+)(?:\/(submit|lifecycle))?$/);
    if (listing) {
      const [, id, action] = listing;
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
        const scene = await rpc("gp_scene_public", {
          p_listing_id: id,
          p_level: null,
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
        const { data, error } = await client
          .from("messages")
          .select("*")
          .eq("conversation_id", messages[1])
          .order("created_at")
          .limit(500);
        schemaError(error);
        const { data: c } = await client
          .from("conversations")
          .select("id")
          .eq("id", messages[1])
          .maybeSingle();
        if (!c) throw new ApiError(404, "Conversation introuvable.");
        await rpc("gp_messages_read", { p_conversation_id: messages[1] });
        return respond(data?.map(message) || []);
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
      const { error } = await client.storage
        .from("private-uploads")
        .upload(objectKey, output, { contentType: "image/webp" });
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
        z.object({ name: text.min(2).max(80) }).strict(),
        await json(request),
      );
      const { error } = await client
        .from("profiles")
        .update(input)
        .eq("user_id", u.id);
      schemaError(error);
      return respond({ ...u, ...input });
    }
    if (path === "me/export" && ["GET", "POST"].includes(method)) {
      const u = (await user(true))!,
        listings = await client
          .from("listings")
          .select("draft")
          .eq("seller_id", u.id),
        messages = await client
          .from("messages")
          .select("*")
          .eq("sender_id", u.id);
      schemaError(listings.error);
      schemaError(messages.error);
      return respond({
        profile: u,
        listings: listings.data?.map((l) => l.draft) || [],
        messages: messages.data?.map(message) || [],
      });
    }
    if (path === "me/delete" && method === "POST") {
      const u = (await user(true))!;
      const input = parse(
        z.object({
          password: z.string().max(128),
          confirmation: z.literal("SUPPRIMER"),
        }),
        await json(request),
      );
      const { error } = await client.auth.signInWithPassword({
        email: u.email,
        password: input.password,
      });
      if (error)
        throw new ApiError(
          403,
          "Confirmez votre mot de passe.",
          "REAUTH_REQUIRED",
        );
      await rpc("gp_delete_account", {});
      await client.auth.signOut();
      return respond({
        deactivated: true,
        message:
          "Compte désactivé et annonces retirées. La purge résiduelle suit la politique de conservation.",
      });
    }
    if (path === "reports" && method === "POST") {
      const u = (await user(true, true))!;
      const input = parse(
        z.object({
          listingId: z.string().uuid(),
          reason: text.min(5).max(2000),
        }),
        await json(request),
      );
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
    if (e instanceof ApiError)
      return Response.json(
        { error: e.message, code: e.code },
        { status: e.status, headers: headers() },
      );
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
