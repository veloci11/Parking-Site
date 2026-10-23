import { handlePrivacyCommands } from "./privacy-commands";
import { assertLocalIdfPublication } from "./region";
import { PARIS_CENTER } from "@/lib/paris-region";
import { assertLocalOffers } from "./listing-offers";
import { localLimits } from "./entitlement-store";
import {
  localRegistryPrepareApproval,
  localRegistryCompleteApproval,
  localRegistryPrepareResume,
} from "./parking-registry";
import {
  validateLocalCommercial,
  stageLocalLocation,
  locationHash,
} from "./commercial";
import { attributeLocalConditions, attributeLocalListing } from "./conditions";
import { parseHistoryQuery, historyCursor } from "./history-pagination";
import { adminUsers, decideAccount } from "./admin-accounts";
import { mediaVariantWidth, resizeAuthorizedMedia } from "./media-variants";
import {
  ensureConversationBlocks,
  conversationBlockState,
  assertConversationOpen,
  assertContactOpen,
  removeOwnPairBlocks,
} from "./conversation-blocks";
import { randomUUID } from "node:crypto";
import { mkdir, writeFile, readFile } from "node:fs/promises";
import { resolve } from "node:path";
import sharp from "sharp";
import { boundedFormData } from "./uploads";
import { readApiJson } from "./json-body";
import { parsePageQuery, localCatalogPage } from "./pagination";
import { listingPhotoUrls, validatePhotoLinks } from "./media-links";
import {
  ensureNotificationSchema,
  notificationsFor,
  markNotificationsRead,
  markConversationRead,
  unreadFor,
  reportDTO,
} from "./notifications";
import { z } from "zod";
import { draftSchema, password } from "./validation";
import { supabaseConfigured, handleSupabaseApi } from "./supabase";
const text = z.string().trim();
import type { Listing, Message, Conversation, Visit, User } from "@/lib/types";
import { db, personas, userDTO, transact } from "./db";
import {
  getPublicListing,
  listPublicListings,
  publicProjection,
} from "./catalog";
import {
  ApiError,
  assertLocal,
  currentUser,
  requireUser,
  requireModerator,
  passwordHash,
  passwordMatches,
  hash,
  opaque,
  sessionCookie,
  endSession,
  rateLimit,
  localConsumeUpload,
  audit,
  queueNotice,
} from "./security";
const now = () => new Date().toISOString();
const blankQuality = {
  floor: "Non renseigné",
  lighting: "Non renseigné",
  humidity: "Non renseignée",
  access: "Non renseigné",
  maneuver: "Non renseignée",
  observations: "",
};
const body = readApiJson;
function parse<T>(schema: z.ZodType<T>, input: unknown): T {
  const result = schema.safeParse(input);
  if (!result.success)
    throw new ApiError(
      400,
      result.error.issues
        .map((i) => `${i.path.join(".")}: ${i.message}`)
        .join(" · "),
    );
  return result.data;
}
function rowListing(id: string) {
  const row = db().prepare("SELECT * FROM listings WHERE id=?").get(id);
  if (!row) throw new ApiError(404, "Annonce introuvable.", "NOT_FOUND");
  return row;
}
function ownListing(id: string, user: User) {
  const row = rowListing(id);
  if (row.seller_id !== user.id)
    throw new ApiError(404, "Annonce introuvable.", "NOT_FOUND");
  return row;
}
function privateListing(row: Record<string, unknown>): Listing {
  return {
    ...JSON.parse(String(row.draft_json)),
    status: row.status,
    version: row.version,
  };
}
function checkVersion(row: Record<string, unknown>, version: unknown) {
  if (!Number.isInteger(version) || version !== row.version)
    throw new ApiError(
      409,
      "Cette annonce a changé. Rechargez sa dernière version.",
      "VERSION_CONFLICT",
    );
}
function saveDraft(
  row: Record<string, unknown>,
  draft: Listing,
  status: Listing["status"],
) {
  const version = Number(row.version) + 1;
  const value = { ...draft, version, status, updatedAt: now() };
  const result = db()
    .prepare(
      "UPDATE listings SET draft_json=?,status=?,version=?,updated_at=? WHERE id=? AND version=?",
    )
    .run(
      JSON.stringify(value),
      status,
      version,
      value.updatedAt,
      draft.id,
      Number(row.version),
    );
  if (Number(result.changes) !== 1)
    throw new ApiError(
      409,
      "Cette annonce a changé. Rechargez sa dernière version.",
      "VERSION_CONFLICT",
    );
  return value;
}
function validatePhotos(photos: string[], userId: string, listingId: string) {
  for (const url of photos) {
    if (
      ["/demo/covered.png", "/demo/box.png", "/demo/outdoor.png"].includes(url)
    )
      continue;
    const id = url.match(/^\/api\/media\/([a-f0-9-]{36})$/)?.[1];
    if (
      !id ||
      !db()
        .prepare(
          "SELECT id FROM media WHERE id=? AND owner_id=? AND listing_id=?",
        )
        .get(id, userId, listingId)
    )
      throw new ApiError(400, "Une photo ne correspond pas à cette annonce.");
  }
}
function conversationRow(id: string, user: User) {
  const row = db().prepare("SELECT * FROM conversations WHERE id=?").get(id);
  if (!row || ![row.buyer_id, row.seller_id].includes(user.id))
    throw new ApiError(404, "Conversation introuvable.", "NOT_FOUND");
  return row;
}
function conversationDTO(
  row: Record<string, unknown>,
  user: User,
): Conversation {
  const listing = rowListing(String(row.listing_id));
  const other = db()
    .prepare("SELECT name FROM users WHERE id=?")
    .get(
      row.buyer_id === user.id ? String(row.seller_id) : String(row.buyer_id),
    );
  return {
    id: String(row.id),
    listingId: String(row.listing_id),
    listingTitle: JSON.parse(String(listing.public_json || listing.draft_json))
      .title,
    otherName: String(other?.name || "Membre"),
    updatedAt: String(row.updated_at),
    unread: unreadFor(user.id, String(row.id)),
    ...conversationBlockState(String(row.id), user.id),
  };
}
function messageDTO(row: Record<string, unknown>): Message {
  return {
    id: String(row.id),
    conversationId: String(row.conversation_id),
    senderId: String(row.sender_id),
    body: String(row.body),
    createdAt: String(row.created_at),
  };
}
function visitDTO(row: Record<string, unknown>): Visit {
  return {
    id: String(row.id),
    conversationId: String(row.conversation_id),
    status: row.status as Visit["status"],
    proposedAt: row.proposed_at as string | null,
    confirmedAt: row.confirmed_at as string | null,
    version: Number(row.version),
  };
}
function makeMail(userId: string, type: "verify" | "reset") {
  const token = opaque(),
    receipt = opaque();
  db()
    .prepare("INSERT INTO mail_tokens VALUES(?,?,?,?,?,?,0,?)")
    .run(
      hash(token),
      userId,
      type,
      token,
      hash(receipt),
      new Date(Date.now() + 30 * 60000).toISOString(),
      now(),
    );
  return receipt;
}
export async function handleApi(request: Request): Promise<Response> {
  if (supabaseConfigured() && process.env.GP_FORCE_LOCAL_DEMO !== "true")
    return handleSupabaseApi(request);
  let cookie: string | undefined;
  const respond = (
    data: unknown,
    status = 200,
    extra: Record<string, unknown> = {},
  ) =>
    Response.json(
      { data, ...extra },
      {
        status,
        headers: {
          "Cache-Control": "no-store",
          ...(cookie ? { "Set-Cookie": cookie } : {}),
        },
      },
    );
  try {
    assertLocal(request);
    const url = new URL(request.url),
      path = url.pathname.replace(/^\/api\//, "").replace(/\/$/, ""),
      method = request.method;
    if (path === "session" && method === "GET")
      return respond(currentUser(request), 200, { mode: "demo" });
    if (path === "health" && method === "GET")
      return respond({
        status: "ok",
        mode: "local-demo",
        billingEnabled: false,
      });
    if (path === "auth/demo" && method === "POST") {
      const input = parse(
        z.object({
          persona: z.enum(["buyer", "seller", "moderator", "admin"]),
        }),
        await body(request),
      );
      const user = db()
        .prepare("SELECT * FROM users WHERE id=?")
        .get(personas[input.persona])!;
      cookie = sessionCookie(String(user.id));
      return respond(userDTO(user));
    }
    if (path === "auth/register" && method === "POST") {
      const input = parse(
        z.object({
          name: text.min(2).max(80),
          email: text.toLowerCase().email().max(254),
          password,
          sellerType: z.enum(["private", "professional"]).nullable().optional(),
        }),
        await body(request),
      );
      rateLimit(`register:${input.email}`, 5, 3600);
      const existing = db()
        .prepare("SELECT id FROM users WHERE email=?")
        .get(input.email);
      if (existing)
        return respond(null, 200, {
          message:
            "Si cette adresse peut être utilisée, les instructions sont disponibles dans votre boîte locale.",
        });
      const id = randomUUID();
      db()
        .prepare(
          "INSERT INTO users(id,name,email,password,created_at) VALUES(?,?,?,?,?)",
        )
        .run(id, input.name, input.email, passwordHash(input.password), now());
      db()
        .prepare("UPDATE users SET seller_type=? WHERE id=?")
        .run(input.sellerType ?? null, id);
      const receipt = makeMail(id, "verify");
      cookie = sessionCookie(id);
      audit(id, "account.register", id);
      return respond(
        userDTO(db().prepare("SELECT * FROM users WHERE id=?").get(id)!),
        201,
        { mailboxReceipt: receipt },
      );
    }
    if (path === "auth/login" && method === "POST") {
      const input = parse(
        z.object({
          email: text.toLowerCase().email(),
          password: z.string().max(128),
        }),
        await body(request),
      );
      rateLimit(`login:${input.email}`, 15, 900);
      const row = db()
        .prepare("SELECT * FROM users WHERE email=? AND status='active'")
        .get(input.email);
      if (
        !row?.password ||
        !passwordMatches(input.password, String(row.password))
      )
        throw new ApiError(
          401,
          "Email ou mot de passe incorrect.",
          "INVALID_CREDENTIALS",
        );
      cookie = sessionCookie(String(row.id));
      return respond(userDTO(row));
    }
    if (path === "auth/logout" && method === "POST") {
      cookie = endSession(request);
      return respond(null);
    }
    if (path === "local-mailbox" && method === "GET") {
      const user = currentUser(request);
      const receipt = request.headers.get("x-mailbox-receipt");
      let rows;
      if (user)
        rows = db()
          .prepare(
            "SELECT type,token,created_at FROM mail_tokens WHERE user_id=? AND used=0 AND expires_at>? ORDER BY created_at DESC",
          )
          .all(user.id, now());
      else if (receipt)
        rows = db()
          .prepare(
            "SELECT type,token,created_at FROM mail_tokens WHERE receipt_hash=? AND used=0 AND expires_at>?",
          )
          .all(hash(receipt), now());
      else throw new ApiError(401, "Boîte locale privée.", "UNAUTHENTICATED");
      return respond(
        rows.map((r) => ({
          type: r.type,
          token: r.token,
          createdAt: r.created_at,
        })),
        200,
        { mode: "local-only" },
      );
    }
    if (path === "auth/verify" && method === "POST") {
      const input = parse(
        z.object({ token: z.string().min(32).max(128) }),
        await body(request),
      );
      const token = db()
        .prepare(
          "SELECT * FROM mail_tokens WHERE token_hash=? AND type='verify' AND used=0 AND expires_at>?",
        )
        .get(hash(input.token), now());
      if (!token)
        throw new ApiError(400, "Lien de confirmation invalide ou expiré.");
      transact(() => {
        db()
          .prepare("UPDATE mail_tokens SET used=1 WHERE token_hash=?")
          .run(hash(input.token));
        db()
          .prepare("UPDATE users SET verified=1 WHERE id=?")
          .run(String(token.user_id));
      });
      return respond({ verified: true });
    }
    if (path === "auth/forgot" && method === "POST") {
      const input = parse(
        z.object({ email: text.toLowerCase().email() }),
        await body(request),
      );
      rateLimit(`forgot:${input.email}`, 5, 3600);
      const row = db()
        .prepare("SELECT id FROM users WHERE email=? AND status='active'")
        .get(input.email);
      const receipt = row ? makeMail(String(row.id), "reset") : opaque();
      return respond(
        {
          message:
            "Si un compte correspond, les instructions de récupération sont disponibles.",
        },
        200,
        { mailboxReceipt: receipt },
      );
    }
    if (path === "auth/reset" && method === "POST") {
      const input = parse(
        z.object({ token: z.string().min(32).max(128), password }),
        await body(request),
      );
      const row = db()
        .prepare(
          "SELECT * FROM mail_tokens WHERE token_hash=? AND type='reset' AND used=0 AND expires_at>?",
        )
        .get(hash(input.token), now());
      if (!row)
        throw new ApiError(400, "Lien de récupération invalide ou expiré.");
      transact(() => {
        db()
          .prepare("UPDATE users SET password=? WHERE id=?")
          .run(passwordHash(input.password), String(row.user_id));
        db()
          .prepare(
            "UPDATE mail_tokens SET used=1 WHERE user_id=? AND type='reset'",
          )
          .run(String(row.user_id));
        db()
          .prepare("DELETE FROM sessions WHERE user_id=?")
          .run(String(row.user_id));
      });
      cookie = "gp_session=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0";
      return respond({ reset: true });
    }
    if (path === "listings" && method === "GET") {
      const { filters, limit, cursor } = parsePageQuery(url);
      const result = localCatalogPage(filters, limit, cursor);
      return respond(result.items, 200, {
        total: result.total,
        nextCursor: result.nextCursor,
      });
    }
    if (path === "me/listings" && method === "GET") {
      const user = requireUser(request);
      return respond(
        db()
          .prepare(
            "SELECT * FROM listings WHERE seller_id=? ORDER BY updated_at DESC",
          )
          .all(user.id)
          .map(privateListing),
      );
    }
    if (path === "listings" && method === "POST") {
      const user = requireUser(request);
      const input = parse(draftSchema, await body(request));
      rateLimit(`draft:${user.id}`, 10, 86400);
      const id = randomUUID(),
        date = now();
      const listing = attributeLocalListing(
        {
          id,
          slug: "nouvelle-annonce",
          title: "",
          description: "",
          city: "Paris",
          district: "",
          priceCents: 0,
          transactionType: "sale",
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
          quality: blankQuality,
          locationPrecision: "area",
          coordinates: [...PARIS_CENTER],
          sceneAvailable: false,
          isDemo: true,
          status: "draft",
          version: 1,
          sellerName: user.name,
          createdAt: date,
          updatedAt: date,
          ...input,
        },
        user.id,
      );
      listing.id = id;
      listing.version = 1;
      listing.locationConfirmedAt = null;
      validateLocalCommercial(listing, user.id);
      validatePhotoLinks(listing);
      validatePhotos(listingPhotoUrls(listing), user.id, id);
      db()
        .prepare(
          "INSERT INTO listings(id,seller_id,draft_json,status,created_at,updated_at) VALUES(?,?,?,?,?,?)",
        )
        .run(id, user.id, JSON.stringify(listing), "draft", date, date);
      return respond(listing, 201);
    }
    const listingMatch = path.match(
      /^listings\/([^/]+)(?:\/(submit|lifecycle|preview))?$/,
    );
    if (listingMatch) {
      const [, id, action] = listingMatch;
      if (method === "GET" && action === "preview") {
        const u = requireUser(request);
        const row = ownListing(id, u);
        return respond(publicProjection(privateListing(row)));
      }
      if (method === "GET" && !action) {
        const user = currentUser(request);
        const row = rowListing(id);
        if (url.searchParams.get("draft") === "1") {
          if (!user || row.seller_id !== user.id)
            throw new ApiError(404, "Annonce introuvable.", "NOT_FOUND");
          return respond(privateListing(row));
        }
        const listing = getPublicListing(id);
        if (!listing)
          throw new ApiError(
            404,
            "Cette annonce n’est plus disponible.",
            "NOT_FOUND",
          );
        return respond(listing);
      }
      const user = requireUser(request, action === "submit");
      const input = await body(request);
      const row = ownListing(id, user);
      checkVersion(row, input.version);
      if (method === "PATCH" && !action) {
        if (row.status === "pending")
          throw new ApiError(
            409,
            "Cette version est en cours de modération.",
            "VERSION_CONFLICT",
          );
        const patch = parse(draftSchema, input);
        const existing = privateListing(row);
        const value = attributeLocalListing(
          { ...existing, ...patch, id },
          user.id,
          existing,
        );
        validateLocalCommercial(value, user.id);
        const location = stageLocalLocation(
          value,
          existing,
          patch,
          row.location_confirmation_hash,
        );
        validatePhotoLinks(value);
        validatePhotos(listingPhotoUrls(value), user.id, id);
        value.sceneAvailable = false;
        value.slug = (value.city + "-" + value.district + "-" + value.title)
          .normalize("NFD")
          .replace(/[\u0300-\u036f]/g, "")
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, "-")
          .slice(0, 100);
        return respond(
          transact(() => {
            const saved = saveDraft(row, location.listing, "draft");
            db()
              .prepare(
                "UPDATE listings SET location_confirmation_hash=? WHERE id=?",
              )
              .run(location.hash, id);
            return saved;
          }),
        );
      }
      if (method === "POST" && action === "submit") {
        if (input.ownershipAttested !== true)
          throw new ApiError(
            400,
            "Confirmez votre droit à publier cette annonce.",
          );
        const draft = privateListing(row);
        if (
          !["draft", "changes_requested", "rejected"].includes(
            String(row.status),
          )
        )
          throw new ApiError(
            409,
            "Cette annonce ne peut pas être soumise dans cet état.",
          );
        assertLocalOffers(draft, true);
        if (
          draft.title.length < 15 ||
          draft.description.length < 100 ||
          !draft.city ||
          !draft.district ||
          draft.priceCents <= 0 ||
          draft.photos.length < 1 ||
          draft.spaces.length < 1
        )
          throw new ApiError(
            400,
            "Complétez le titre, la description, le lieu, le prix, les places et au moins une photo du parking.",
          );
        draft.conditionObservations = attributeLocalConditions(
          draft,
          user.id,
          draft,
          true,
        );
        validateLocalCommercial(draft, user.id, true);
        if (
          !draft.locationConfirmedAt ||
          row.location_confirmation_hash !== locationHash(draft)
        )
          throw new ApiError(
            400,
            "Confirmez la localisation publique après sa dernière modification.",
            "LOCATION_CONFIRMATION_REQUIRED",
          );
        validatePhotoLinks(draft);
        validatePhotos(listingPhotoUrls(draft), user.id, id);
        return respond(
          transact(() => {
            rateLimit(`submit:${user.id}`, 20, 86400);
            const active = db()
              .prepare(
                "SELECT COUNT(DISTINCT id) AS n FROM listings WHERE seller_id=? AND id<>? AND (public_json IS NOT NULL OR status='pending') AND status NOT IN ('sold','withdrawn')",
              )
              .get(user.id, id);
            if (Number(active?.n) >= localLimits(user.id).limits.activeListings)
              throw new ApiError(
                403,
                "La limite d’annonces actives est atteinte.",
                "QUOTA_EXCEEDED",
              );
            const saved = saveDraft(
              row,
              { ...draft, sellerTypeSnapshot: user.sellerType ?? null },
              "pending",
            );
            db()
              .prepare(
                "INSERT INTO revisions(id,listing_id,version,snapshot_json,created_at) VALUES(?,?,?,?,?)",
              )
              .run(
                randomUUID(),
                id,
                saved.version,
                JSON.stringify(saved),
                now(),
              );
            audit(user.id, "listing.submit", id, "ownership_attested=true");
            return saved;
          }),
        );
      }
      if (method === "POST" && action === "lifecycle") {
        const command = parse(
          z.object({
            action: z.enum(["pause", "resume", "sold", "withdraw"]),
            version: z.number().int(),
          }),
          input,
        );
        if (
          command.action === "resume" &&
          (!row.public_json || row.status !== "paused")
        )
          throw new ApiError(
            409,
            "Seule une annonce publiée en pause peut être reprise.",
          );
        if (command.action === "pause" && !row.public_json)
          throw new ApiError(
            409,
            "Seule une annonce publiée peut être mise en pause.",
          );
        if (["sold", "withdrawn"].includes(String(row.status)))
          throw new ApiError(409, "Cette annonce est déjà clôturée.");
        const status: Listing["status"] = {
          pause: "paused",
          resume: "published",
          sold: "sold",
          withdraw: "withdrawn",
        }[command.action] as Listing["status"];
        return respond(
          transact(() => {
            if (command.action === "resume") {
              assertLocalIdfPublication(
                JSON.parse(String(row.public_json)) as Listing,
              );
              const conflict = localRegistryPrepareResume(id, user.id);
              if (conflict) return conflict;
            }
            const saved = saveDraft(row, privateListing(row), status);
            if (command.action !== "resume")
              db().prepare("DELETE FROM claims WHERE listing_id=?").run(id);
            else
              db()
                .prepare("UPDATE listings SET published_at=? WHERE id=?")
                .run(now(), id);
            if (
              command.action === "resume" &&
              db()
                .prepare(
                  "SELECT 1 FROM registry_listing_units WHERE listing_id=?",
                )
                .get(id)
            )
              localRegistryCompleteApproval(id);
            audit(user.id, `listing.${command.action}`, id);
            return saved;
          }),
        );
      }
    }
    if (path === "favorites" && method === "GET") {
      const user = requireUser(request);
      const ids = db()
        .prepare("SELECT listing_id FROM favorites WHERE user_id=?")
        .all(user.id)
        .map((r) => String(r.listing_id));
      return respond(ids);
    }
    const favorite = path.match(/^favorites\/([^/]+)$/);
    if (favorite && ["PUT", "DELETE"].includes(method)) {
      const user = requireUser(request);
      if (method === "PUT") {
        if (!getPublicListing(favorite[1]))
          throw new ApiError(404, "Annonce indisponible.");
        db()
          .prepare("INSERT OR IGNORE INTO favorites VALUES(?,?)")
          .run(user.id, favorite[1]);
      } else
        db()
          .prepare("DELETE FROM favorites WHERE user_id=? AND listing_id=?")
          .run(user.id, favorite[1]);
      return respond({ saved: method === "PUT" });
    }
    if (
      path === "admin/users" ||
      path === "admin/audit" ||
      /^admin\/users\/[^/]+\/decision$/.test(path)
    ) {
      const actor = requireUser(request, true);
      if (actor.role !== "admin")
        throw new ApiError(
          403,
          "Accès réservé aux administrateurs.",
          "FORBIDDEN",
        );
      if (path === "admin/users" && method === "GET")
        return respond(adminUsers());
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
          await body(request),
        );
        return respond(decideAccount(actor, decision[1], input));
      }
      if (path === "admin/audit" && method === "GET") {
        const { limit, after } = parseHistoryQuery(url, "admin:audit");
        const rows = after
          ? db()
              .prepare(
                "SELECT id,actor_id,action,target_id,created_at,request_id,before_json,after_json FROM audit WHERE created_at<? OR created_at=? AND id<? ORDER BY created_at DESC,id DESC LIMIT ?",
              )
              .all(after.createdAt, after.createdAt, after.id, limit + 1)
          : db()
              .prepare(
                "SELECT id,actor_id,action,target_id,created_at,request_id,before_json,after_json FROM audit ORDER BY created_at DESC,id DESC LIMIT ?",
              )
              .all(limit + 1);
        return respond(
          rows.slice(0, limit).map((r) => ({
            id: r.id,
            actorId: r.actor_id,
            requestId: r.request_id,
            before: r.before_json ? JSON.parse(String(r.before_json)) : null,
            after: r.after_json ? JSON.parse(String(r.after_json)) : null,
            action: r.action,
            targetId: r.target_id,
            createdAt: r.created_at,
          })),
          200,
          { nextCursor: historyCursor("admin:audit", rows as any, limit) },
        );
      }
    }
    if (path === "admin/publications" && method === "GET") {
      requireModerator(request);
      return respond(
        db()
          .prepare(
            "SELECT * FROM listings WHERE public_json IS NOT NULL AND status NOT IN ('sold','withdrawn','suspended') ORDER BY updated_at DESC,id",
          )
          .all()
          .map(privateListing),
      );
    }
    const suspension = path.match(/^admin\/listings\/([^/]+)\/suspend$/);
    if (suspension && method === "POST") {
      const moderator = requireModerator(request);
      const input = parse(
        z
          .object({
            version: z.number().int().positive(),
            reason: text.min(15).max(2000),
          })
          .strict(),
        await body(request),
      );
      return respond(
        transact(() => {
          const row = rowListing(suspension[1]);
          checkVersion(row, input.version);
          if (
            !row.public_json ||
            ["sold", "withdrawn", "suspended"].includes(String(row.status))
          )
            throw new ApiError(
              409,
              "Cette annonce ne possède plus de publication à suspendre.",
              "VERSION_CONFLICT",
            );
          const saved = saveDraft(
            row,
            {
              ...privateListing(row),
              rejectionReason: input.reason,
              sceneAvailable: false,
            },
            "suspended",
          );
          db()
            .prepare(
              "UPDATE listings SET public_json=NULL,published_at=NULL WHERE id=?",
            )
            .run(suspension[1]);
          db()
            .prepare("DELETE FROM claims WHERE listing_id=?")
            .run(suspension[1]);
          db()
            .prepare(
              "UPDATE revisions SET decision='suspended',reason=?,actor_id=? WHERE listing_id=? AND decision='pending'",
            )
            .run(input.reason, moderator.id, suspension[1]);
          audit(
            moderator.id,
            "moderation.suspend",
            suspension[1],
            input.reason,
          );
          queueNotice(
            String(row.seller_id),
            "moderation",
            `${suspension[1]}:${saved.version}`,
          );
          return saved;
        }),
      );
    }
    if (path === "admin/revisions" && method === "GET") {
      requireModerator(request);
      return respond(
        db()
          .prepare(
            "SELECT * FROM listings WHERE status='pending' ORDER BY updated_at",
          )
          .all()
          .map(privateListing),
      );
    }
    const decision = path.match(/^admin\/revisions\/([^/]+)\/decision$/);
    if (decision && method === "POST") {
      const user = requireModerator(request);
      const input = parse(
        z.object({
          decision: z.enum(["approve", "changes_requested", "reject"]),
          reason: text.max(2000).optional(),
          version: z.number().int(),
        }),
        await body(request),
      );
      const row = rowListing(decision[1]);
      checkVersion(row, input.version);
      if (row.status !== "pending")
        throw new ApiError(
          409,
          "Cette version n’attend plus de décision.",
          "VERSION_CONFLICT",
        );
      if (input.decision !== "approve" && !input.reason)
        throw new ApiError(400, "Précisez le motif de la décision.");
      return respond(
        transact(() => {
          const draft = privateListing(row);
          const seller = db()
            .prepare("SELECT * FROM users WHERE id=?")
            .get(String(row.seller_id));
          if (!seller || !seller.verified || seller.status !== "active")
            throw new ApiError(409, "Ce compte ne peut plus publier.");
          const active = db()
            .prepare(
              "SELECT COUNT(DISTINCT id) AS n FROM listings WHERE seller_id=? AND id<>? AND (public_json IS NOT NULL OR status='pending') AND status NOT IN ('sold','withdrawn')",
            )
            .get(String(row.seller_id), String(row.id));
          if (
            input.decision === "approve" &&
            Number(active?.n) >=
              localLimits(String(row.seller_id)).limits.activeListings
          )
            throw new ApiError(403, "Quota actif atteint.", "QUOTA_EXCEEDED");
          if (input.decision === "approve") {
            assertLocalIdfPublication(draft);
            const conflict = localRegistryPrepareApproval(
              String(row.id),
              user.id,
            );
            if (conflict) return conflict;
          }
          const status =
            input.decision === "approve"
              ? "published"
              : input.decision === "reject"
                ? "rejected"
                : "changes_requested";
          const saved = saveDraft(
            row,
            { ...draft, rejectionReason: input.reason },
            status,
          );
          if (input.decision === "approve") {
            db().prepare("DELETE FROM claims WHERE listing_id=?").run(draft.id);
            for (const space of draft.spaces) {
              const claim = db()
                .prepare("SELECT listing_id FROM claims WHERE space_id=?")
                .get(space.id);
              if (claim && claim.listing_id !== draft.id)
                throw new ApiError(
                  409,
                  "Une unité est déjà liée à une annonce active.",
                  "SPACE_CLAIMED",
                );
              db()
                .prepare("INSERT OR IGNORE INTO claims VALUES(?,?)")
                .run(space.id, draft.id);
            }
            const projected = publicProjection({
              ...saved,
              sceneAvailable: false,
            });
            db()
              .prepare(
                "UPDATE listings SET public_json=?,published_at=COALESCE(published_at,?) WHERE id=?",
              )
              .run(JSON.stringify(projected), now(), draft.id);
            localRegistryCompleteApproval(draft.id, saved);
          }
          db()
            .prepare(
              "UPDATE revisions SET decision=?,reason=?,actor_id=? WHERE listing_id=? AND version=?",
            )
            .run(
              input.decision,
              input.reason || null,
              user.id,
              draft.id,
              input.version,
            );
          audit(
            user.id,
            `moderation.${input.decision}`,
            draft.id,
            input.reason,
          );
          queueNotice(
            String(row.seller_id),
            "moderation",
            `${draft.id}:${input.version}`,
          );
          return saved;
        }),
      );
    }
    if (path === "conversations" && method === "GET") {
      const user = requireUser(request);
      return respond(
        db()
          .prepare(
            "SELECT * FROM conversations WHERE buyer_id=? OR seller_id=? ORDER BY updated_at DESC",
          )
          .all(user.id, user.id)
          .map((r) => conversationDTO(r, user)),
      );
    }
    if (path === "conversations" && method === "POST") {
      const user = requireUser(request, true);
      const input = parse(
        z.object({ listingId: z.string().uuid() }),
        await body(request),
      );
      const listing = getPublicListing(input.listingId);
      if (!listing)
        throw new ApiError(
          409,
          "Cette annonce n’accepte plus de nouveaux contacts.",
        );
      const row = rowListing(input.listingId);
      if (row.seller_id === user.id)
        throw new ApiError(400, "Vous êtes le vendeur de cette annonce.");
      assertContactOpen(user.id, String(row.seller_id));
      const existing = db()
        .prepare(
          "SELECT * FROM conversations WHERE listing_id=? AND buyer_id=? AND seller_id=?",
        )
        .get(input.listingId, user.id, String(row.seller_id));
      if (existing) return respond(conversationDTO(existing, user));
      rateLimit(`contact:${user.id}`, 10, 86400);
      const id = randomUUID(),
        date = now();
      db()
        .prepare("INSERT INTO conversations VALUES(?,?,?,?,?,?)")
        .run(id, input.listingId, user.id, String(row.seller_id), date, date);
      queueNotice(String(row.seller_id), "conversation", id);
      return respond(
        conversationDTO(
          db().prepare("SELECT * FROM conversations WHERE id=?").get(id)!,
          user,
        ),
        201,
      );
    }
    const block = path.match(/^conversations\/([^/]+)\/block$/);
    if (block && ["GET", "PUT", "DELETE"].includes(method)) {
      const user = requireUser(request, true);
      const participant = db()
        .prepare("SELECT buyer_id,seller_id FROM conversations WHERE id=?")
        .get(block[1]);
      if (
        !participant ||
        ![participant.buyer_id, participant.seller_id].includes(user.id)
      )
        throw new ApiError(403, "Action non autorisée.", "FORBIDDEN");
      ensureConversationBlocks();
      if (method === "PUT")
        db()
          .prepare("INSERT OR IGNORE INTO conversation_blocks VALUES(?,?,?)")
          .run(block[1], user.id, now());
      if (method === "DELETE") removeOwnPairBlocks(block[1], user.id);
      if (method !== "GET")
        audit(
          user.id,
          method === "PUT" ? "conversation.block" : "conversation.unblock",
          block[1],
        );
      return respond(conversationBlockState(block[1], user.id));
    }
    const messages = path.match(/^conversations\/([^/]+)\/messages$/);
    if (messages) {
      const user = requireUser(request, true),
        conversation = conversationRow(messages[1], user);
      if (method === "GET") {
        const { limit, after } = parseHistoryQuery(
          url,
          `messages:${messages[1]}`,
        );
        const rows = after
          ? db()
              .prepare(
                "SELECT * FROM messages WHERE conversation_id=? AND (created_at<? OR created_at=? AND id<?) ORDER BY created_at DESC,id DESC LIMIT ?",
              )
              .all(
                messages[1],
                after.createdAt,
                after.createdAt,
                after.id,
                limit + 1,
              )
          : db()
              .prepare(
                "SELECT * FROM messages WHERE conversation_id=? ORDER BY created_at DESC,id DESC LIMIT ?",
              )
              .all(messages[1], limit + 1);
        markConversationRead(user.id, messages[1]);
        return respond(rows.slice(0, limit).reverse().map(messageDTO), 200, {
          nextCursor: historyCursor(
            `messages:${messages[1]}`,
            rows as any,
            limit,
          ),
        });
      }
      if (method === "POST") {
        const input = parse(
          z.object({
            body: text.min(1).max(4000),
            clientRequestId: z.string().min(8).max(100),
          }),
          await body(request),
        );
        const existing = db()
          .prepare("SELECT * FROM messages WHERE sender_id=? AND request_id=?")
          .get(user.id, input.clientRequestId);
        if (existing) {
          if (existing.conversation_id !== messages[1])
            throw new ApiError(409, "Identifiant de demande déjà utilisé.");
          return respond(messageDTO(existing));
        }
        assertConversationOpen(messages[1], user.id);
        rateLimit(`message:${user.id}`, 30, 60);
        const id = randomUUID(),
          date = now();
        transact(() => {
          db()
            .prepare("INSERT INTO messages VALUES(?,?,?,?,?,?)")
            .run(
              id,
              messages[1],
              user.id,
              input.body,
              input.clientRequestId,
              date,
            );
          db()
            .prepare("UPDATE conversations SET updated_at=? WHERE id=?")
            .run(date, messages[1]);
          queueNotice(
            String(
              conversation.buyer_id === user.id
                ? conversation.seller_id
                : conversation.buyer_id,
            ),
            "message",
            id,
          );
        });
        return respond(
          messageDTO(
            db().prepare("SELECT * FROM messages WHERE id=?").get(id)!,
          ),
          201,
        );
      }
    }
    const visits = path.match(
      /^conversations\/([^/]+)\/(?:visits|visit-requests)$/,
    );
    if (visits) {
      const user = requireUser(request, true),
        conversation = conversationRow(visits[1], user);
      if (method === "GET")
        return respond(
          db()
            .prepare(
              "SELECT * FROM visits WHERE conversation_id=? ORDER BY created_at DESC",
            )
            .all(visits[1])
            .map(visitDTO),
        );
      if (method === "POST") {
        if (conversation.buyer_id !== user.id)
          throw new ApiError(403, "La demande doit venir de l’acheteur.");
        const input = parse(
          z.object({
            proposedAt: z
              .string()
              .datetime({ offset: true })
              .nullable()
              .optional(),
            clientRequestId: z.string().min(8).max(100),
          }),
          await body(request),
        );
        if (
          input.proposedAt &&
          new Date(input.proposedAt).getTime() <= Date.now()
        )
          throw new ApiError(400, "Choisissez une date future.");
        const requestId = `${user.id}:${input.clientRequestId}`;
        const old = db()
          .prepare("SELECT * FROM visits WHERE request_id=?")
          .get(requestId);
        if (old) {
          if (old.conversation_id !== visits[1])
            throw new ApiError(409, "Identifiant déjà utilisé.");
          return respond(visitDTO(old));
        }
        assertConversationOpen(visits[1], user.id);
        const id = randomUUID();
        db()
          .prepare(
            "INSERT INTO visits(id,conversation_id,status,proposed_at,request_id,created_at) VALUES(?,?,?,?,?,?)",
          )
          .run(
            id,
            visits[1],
            "requested",
            input.proposedAt || null,
            requestId,
            now(),
          );
        queueNotice(String(conversation.seller_id), "visit", id);
        return respond(
          visitDTO(db().prepare("SELECT * FROM visits WHERE id=?").get(id)!),
          201,
        );
      }
    }
    const visitDecision = path.match(
      /^(?:visits|visit-requests)\/([^/]+)\/decision$/,
    );
    if (visitDecision && method === "POST") {
      const user = requireUser(request, true);
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
        await body(request),
      );
      const visit = db()
        .prepare("SELECT * FROM visits WHERE id=?")
        .get(visitDecision[1]);
      if (!visit) throw new ApiError(404, "Demande introuvable.");
      const conversation = conversationRow(String(visit.conversation_id), user);
      if (input.action !== "cancel")
        assertConversationOpen(String(visit.conversation_id), user.id);
      if (visit.version !== input.version)
        throw new ApiError(409, "Cette visite a changé.", "VERSION_CONFLICT");
      if (["cancelled", "declined"].includes(String(visit.status)))
        throw new ApiError(409, "Cette demande est clôturée.");
      if (input.action !== "cancel" && conversation.seller_id !== user.id)
        throw new ApiError(
          403,
          "Seul le vendeur peut accepter ou refuser.",
          "FORBIDDEN",
        );
      if (
        input.confirmedAt &&
        new Date(input.confirmedAt).getTime() <= Date.now()
      )
        throw new ApiError(400, "Choisissez un horaire futur.");
      const status =
        input.action === "cancel"
          ? "cancelled"
          : input.action === "decline"
            ? "declined"
            : input.confirmedAt
              ? "confirmed"
              : "accepted";
      db()
        .prepare(
          "UPDATE visits SET status=?,confirmed_at=?,version=version+1 WHERE id=?",
        )
        .run(
          status,
          input.action === "accept" ? input.confirmedAt || null : null,
          visitDecision[1],
        );
      queueNotice(
        String(
          conversation.buyer_id === user.id
            ? conversation.seller_id
            : conversation.buyer_id,
        ),
        "visit_decision",
        `${visitDecision[1]}:${input.version + 1}`,
      );
      return respond(
        visitDTO(
          db()
            .prepare("SELECT * FROM visits WHERE id=?")
            .get(visitDecision[1])!,
        ),
      );
    }
    if (path === "uploads" && method === "POST") {
      const user = requireUser(request);
      if (Number(request.headers.get("content-length") || 0) > 16 * 1024 * 1024)
        throw new ApiError(413, "Image trop volumineuse (10 Mo maximum).");
      const form = await boundedFormData(request),
        file = form.get("file"),
        listingId = String(form.get("listingId") || "");
      ownListing(listingId, user);
      if (
        !(file instanceof File) ||
        file.size > 10 * 1024 * 1024 ||
        file.size < 20
      )
        throw new ApiError(
          400,
          "Choisissez une image JPEG, PNG ou WebP de 10 Mo maximum.",
        );
      const count = db()
        .prepare("SELECT COUNT(*) AS n FROM media WHERE listing_id=?")
        .get(listingId);
      if (Number(count?.n) >= 120)
        throw new ApiError(403, "Limite de médias atteinte.");
      let output: Buffer;
      try {
        const image = sharp(Buffer.from(await file.arrayBuffer()), {
          limitInputPixels: 30000000,
        });
        const meta = await image.metadata();
        if (!["jpeg", "png", "webp"].includes(meta.format || ""))
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
        // Local demo files are created at runtime; never bundle arbitrary media paths.
        folder = resolve(
          /* turbopackIgnore: true */ process.env.GP_MEDIA_PATH ||
            ".data/media",
        );
      await mkdir(folder, { recursive: true });
      const storagePath = resolve(folder, `${id}.webp`);
      localConsumeUpload(user.id, output.length);
      await writeFile(storagePath, output, { mode: 0o600 });
      db()
        .prepare("INSERT INTO media VALUES(?,?,?,?,?,?)")
        .run(id, user.id, listingId, storagePath, "image/webp", now());
      return respond({ id, url: `/api/media/${id}` }, 201);
    }
    const media = path.match(/^media\/([a-f0-9-]{36})$/);
    if (media && method === "GET") {
      const row = db().prepare("SELECT * FROM media WHERE id=?").get(media[1]);
      if (!row) throw new ApiError(404, "Média introuvable.");
      const user = currentUser(request);
      const listing = rowListing(String(row.listing_id));
      const approved =
        listing.public_json &&
        listingPhotoUrls(JSON.parse(String(listing.public_json))).includes(
          `/api/media/${media[1]}`,
        ) &&
        !["sold", "withdrawn", "paused"].includes(String(listing.status));
      if (
        !approved &&
        row.owner_id !== user?.id &&
        !["moderator", "admin"].includes(user?.role || "")
      )
        throw new ApiError(404, "Média introuvable.");
      const bytes = await resizeAuthorizedMedia(
        await readFile(String(row.path)),
        mediaVariantWidth(url),
      );
      return new Response(new Uint8Array(bytes), {
        headers: {
          "Content-Type": "image/webp",
          "Cache-Control": "private, no-store",
          "X-Content-Type-Options": "nosniff",
        },
      });
    }
    if (path === "reports" && method === "POST") {
      const user = requireUser(request, true);
      const input = parse(
        z.object({
          listingId: z.string().uuid(),
          reason: text.min(5).max(2000),
        }),
        await body(request),
      );
      rowListing(input.listingId);
      rateLimit(`report:${user.id}`, 10, 3600);
      const id = randomUUID();
      db()
        .prepare(
          "INSERT INTO reports(id,user_id,listing_id,reason,created_at) VALUES(?,?,?,?,?)",
        )
        .run(id, user.id, input.listingId, input.reason, now());
      return respond({ id }, 201);
    }
    if (path === "me/delete" && method === "POST")
      return handlePrivacyCommands(request, "delete");
    if (path === "notifications" && method === "GET") {
      const user = requireUser(request);
      const value = notificationsFor(user.id);
      return respond(value.data, 200, { unread: value.unread });
    }
    if (path === "notifications/read" && method === "POST") {
      const user = requireUser(request);
      const input = parse(
        z.object({ ids: z.array(z.string().uuid()).max(100).optional() }),
        await body(request),
      );
      return respond({ updated: markNotificationsRead(user.id, input.ids) });
    }
    if (path === "me/notification-settings" && method === "GET") {
      const user = requireUser(request);
      ensureNotificationSchema();
      return respond({
        emailEnabled: !!db()
          .prepare("SELECT email_notifications FROM users WHERE id=?")
          .get(user.id)?.email_notifications,
      });
    }
    if (path === "me/notification-settings" && method === "PATCH") {
      const user = requireUser(request);
      const input = parse(
        z.object({ emailEnabled: z.boolean() }),
        await body(request),
      );
      ensureNotificationSchema();
      db()
        .prepare("UPDATE users SET email_notifications=? WHERE id=?")
        .run(Number(input.emailEnabled), user.id);
      return respond(input);
    }
    if (path === "admin/reports" && method === "GET") {
      requireModerator(request);
      ensureNotificationSchema();
      return respond(
        db()
          .prepare("SELECT * FROM reports ORDER BY created_at DESC LIMIT 100")
          .all()
          .map(reportDTO),
      );
    }
    const reportDecision = path.match(/^admin\/reports\/([^/]+)\/decision$/);
    if (reportDecision && method === "POST") {
      const user = requireModerator(request);
      const input = parse(
        z.object({
          status: z.enum(["reviewed", "dismissed"]),
          reason: text.min(5).max(2000),
          version: z.number().int(),
        }),
        await body(request),
      );
      ensureNotificationSchema();
      return respond(
        transact(() => {
          const row = db()
            .prepare("SELECT * FROM reports WHERE id=?")
            .get(reportDecision[1]);
          if (!row)
            throw new ApiError(404, "Signalement introuvable.", "NOT_FOUND");
          if (row.row_version !== input.version)
            throw new ApiError(
              409,
              "Le signalement a changé.",
              "VERSION_CONFLICT",
            );
          db()
            .prepare(
              "UPDATE reports SET status=?,decision_reason=?,decided_by=?,decided_at=?,row_version=row_version+1 WHERE id=?",
            )
            .run(input.status, input.reason, user.id, now(), reportDecision[1]);
          audit(
            user.id,
            `report.${input.status}`,
            reportDecision[1],
            input.reason,
          );
          return reportDTO(
            db()
              .prepare("SELECT * FROM reports WHERE id=?")
              .get(reportDecision[1])!,
          );
        }),
      );
    }
    if (path === "mfa" && method === "GET") {
      requireUser(request);
      return respond({
        supported: false,
        currentLevel: null,
        nextLevel: null,
        factors: [],
        requiredForAdmin: false,
      });
    }
    if (path.startsWith("mfa/") && method === "POST") {
      requireUser(request);
      throw new ApiError(
        503,
        "La double authentification nécessite le backend Supabase.",
        "MFA_UNAVAILABLE",
      );
    }
    if (path === "me/profile" && method === "PATCH") {
      const user = requireUser(request);
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
        await body(request),
      );
      db()
        .prepare("UPDATE users SET name=?,seller_type=? WHERE id=?")
        .run(
          input.name ?? user.name,
          input.sellerType === undefined
            ? (user.sellerType ?? null)
            : input.sellerType,
          user.id,
        );
      return respond(
        userDTO(db().prepare("SELECT * FROM users WHERE id=?").get(user.id)!),
      );
    }
    if (path === "me/export" && ["GET", "POST"].includes(method))
      return handlePrivacyCommands(request, "export");
    throw new ApiError(404, "Ressource introuvable.", "NOT_FOUND");
  } catch (error) {
    if (error instanceof ApiError)
      return Response.json(
        { error: error.message, code: error.code },
        {
          status: error.status,
          headers: {
            "Cache-Control": "no-store",
            ...(error.status === 429
              ? { "Retry-After": String(error.retryAfter ?? 60) }
              : {}),
          },
        },
      );
    console.error(
      "[gp-api] request failed",
      error instanceof Error ? error.name : "UnknownError",
    );
    return Response.json(
      {
        error: "Une erreur interne empêche cette action. Réessayez.",
        code: "INTERNAL_ERROR",
      },
      { status: 500, headers: { "Cache-Control": "no-store" } },
    );
  }
}
