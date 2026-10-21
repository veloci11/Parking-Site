import { handlePrivacyExports } from "./privacy-exports";
import { createClient } from "@supabase/supabase-js";
import { randomUUID, randomBytes, createHash } from "node:crypto";
import { z } from "zod";
import { sceneContext } from "./scenes/context";
import { readBoundedJson } from "./json-body";
import {
  ApiError,
  audit,
  passwordMatches,
  rateLimit,
  endSession,
  effectiveOrigin,
} from "./security";
import { db, transact } from "./db";
import type { User } from "@/lib/types";
const receiptCookie = "gp_privacy_receipt";
const digest = (value: string) =>
  createHash("sha256").update(value).digest("hex");
function cookie(request: Request, value: string) {
  return `${receiptCookie}=${value}; HttpOnly; SameSite=Lax; Path=/; Max-Age=7776000${new URL(effectiveOrigin(request)).protocol === "https:" ? "; Secure" : ""}`;
}
function ensureLocal() {
  db().exec(
    "CREATE TABLE IF NOT EXISTS privacy_requests(id TEXT PRIMARY KEY,user_id TEXT NOT NULL UNIQUE REFERENCES users(id),receipt_hash TEXT NOT NULL UNIQUE,state TEXT NOT NULL,created_at TEXT NOT NULL,updated_at TEXT NOT NULL,limited_cleanup_at TEXT,retained_categories TEXT NOT NULL)",
  );
}
const retained = [
  "auth_identity",
  "conversations",
  "reported_context",
  "listing_history",
  "scene_evidence",
  "audit",
  "backups",
];
function localRows(
  table: string,
  where: string,
  args: string[],
  projection = "*",
) {
  if (
    !db()
      .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name=?")
      .get(table)
  )
    return [];
  return db()
    .prepare(`SELECT ${projection} FROM ${table} WHERE ${where}`)
    .all(...args);
}
export function localPrivacyExport(u: User) {
  const own = (table: string, column = "user_id", projection = "*") =>
    localRows(table, `${column}=?`, [u.id], projection);
  return {
    formatVersion: "gp-private-export-v1",
    generatedAt: new Date().toISOString(),
    scope:
      "Account data and owned documents metadata; binary files are not embedded; internal moderation evidence and credentials are excluded.",
    profile: u,
    notificationPreferences: db()
      .prepare("PRAGMA table_info(users)")
      .all()
      .some((c) => c.name === "email_notifications")
      ? {
          emailEnabled: Boolean(
            db()
              .prepare("SELECT email_notifications FROM users WHERE id=?")
              .get(u.id)?.email_notifications,
          ),
        }
      : null,
    listings: own("listings", "seller_id").map((row) => ({
      ...JSON.parse(String(row.draft_json)),
      status: row.status,
      version: row.version,
    })),
    listingRevisions: localRows(
      "revisions",
      "listing_id IN(SELECT id FROM listings WHERE seller_id=?)",
      [u.id],
    ),
    mediaAssets: own(
      "media",
      "owner_id",
      "id,owner_id,listing_id,mime,created_at",
    ),
    favorites: own("favorites"),
    conversations: localRows("conversations", "buyer_id=? OR seller_id=?", [
      u.id,
      u.id,
    ]),
    messagesSent: own("messages", "sender_id"),
    visits: localRows(
      "visits",
      "conversation_id IN(SELECT id FROM conversations WHERE buyer_id=? OR seller_id=?)",
      [u.id, u.id],
    ),
    messageReads: own("message_reads"),
    blocksByMe: own("conversation_blocks"),
    notifications: own("notifications"),
    listingReportsByMe: own("reports"),
    contextReportsByMe: own("context_reports"),
    termsAcceptances: own("terms_acceptances"),
    scenesOwned: own("scene_models", "owner_id"),
    sceneSourcesOwned: localRows(
      "scene_sources",
      "owner_id=? AND uploader_id=?",
      [u.id, u.id],
      "id,listing_id,owner_id,uploader_id,mime,byte_size,sha256,created_at",
    ),
    registryContributions: own("parking_contributors"),
    auditAboutMe: own("audit", "actor_id", "id,action,target_id,created_at"),
  };
}
export async function handlePrivacyCommands(
  request: Request,
  actionOverride?: string,
): Promise<Response> {
  if (new URL(request.url).pathname.startsWith("/api/privacy/exports"))
    return handlePrivacyExports(request);
  let context: ReturnType<typeof sceneContext> | undefined;
  try {
    context = sceneContext(request);
    const { client, user, headers } = context;
    const action =
      actionOverride ||
      new URL(request.url).pathname.replace(/^\/api\/privacy\/?/, "");
    const respond = (data: unknown, status = 200, extraHeaders?: Headers) =>
      Response.json({ data }, { status, headers: extraHeaders || headers() });
    if (action === "status" && request.method === "GET") {
      const value =
        (request.headers.get("cookie") || "")
          .split(";")
          .map((v) => v.trim())
          .find((v) => v.startsWith(receiptCookie + "="))
          ?.slice(receiptCookie.length + 1) || "";
      const parsed = /^([a-f0-9-]{36})\.([a-f0-9]{64})$/.exec(value);
      if (!parsed)
        throw new ApiError(
          404,
          "Aucune demande accessible depuis ce navigateur.",
          "NOT_FOUND",
        );
      let result;
      if (client) {
        const r = await client.rpc("gp_privacy_request_status", {
          p_id: parsed[1],
          p_receipt_hash: digest(parsed[2]),
        });
        if (r.error)
          throw new ApiError(503, "Le suivi est momentanément indisponible.");
        result = r.data;
      } else {
        ensureLocal();
        const row = db()
          .prepare(
            "SELECT id,state,created_at,updated_at,limited_cleanup_at,retained_categories FROM privacy_requests WHERE id=? AND receipt_hash=? AND created_at>?",
          )
          .get(
            parsed[1],
            digest(parsed[2]),
            new Date(Date.now() - 90 * 86400000).toISOString(),
          );
        result = row
          ? {
              id: row.id,
              state: row.state,
              createdAt: row.created_at,
              updatedAt: row.updated_at,
              limitedCleanupAt: row.limited_cleanup_at,
              retainedCategories: JSON.parse(String(row.retained_categories)),
              completeErasure: false,
            }
          : null;
      }
      if (!result) throw new ApiError(404, "Demande introuvable.", "NOT_FOUND");
      return respond(result);
    }
    if (["export", "delete"].includes(action) && request.method !== "POST")
      throw new ApiError(
        405,
        "Confirmez votre mot de passe pour cette opération.",
        "METHOD_NOT_ALLOWED",
      );
    if (request.method !== "POST" || !["export", "delete"].includes(action))
      throw new ApiError(404, "Ressource introuvable.");
    const input = z
      .object({
        password: z.string().min(1).max(128),
        confirmation: z.literal("SUPPRIMER").optional(),
      })
      .strict()
      .parse(await readBoundedJson(request, 16384));
    if (action === "delete" && input.confirmation !== "SUPPRIMER")
      throw new ApiError(
        400,
        "Confirmez explicitement la demande de suppression.",
      );
    const u = (await user())!;
    if (!client) {
      rateLimit(`privacy-reauth:${u.id}`, 5, 600);
      const row = db()
        .prepare("SELECT password FROM users WHERE id=?")
        .get(u.id);
      if (
        !row?.password ||
        !passwordMatches(input.password, String(row.password))
      )
        throw new ApiError(
          403,
          "Confirmez votre mot de passe. Les comptes de démonstration partagés sont protégés.",
          "REAUTH_REQUIRED",
        );
      if (action === "export") {
        const value = localPrivacyExport(u);
        audit(u.id, "privacy.export_prepared", u.id);
        return respond(value);
      }
      if (
        u.role === "admin" &&
        Number(
          db()
            .prepare(
              "SELECT count(*) n FROM users WHERE role='admin' AND status='active'",
            )
            .get()?.n,
        ) <= 1
      )
        throw new ApiError(
          409,
          "Transférez les accès d’administration avant de fermer le dernier compte administrateur.",
          "LAST_ADMIN",
        );
      const id = randomUUID(),
        token = randomBytes(32).toString("hex"),
        now = new Date().toISOString();
      ensureLocal();
      transact(() => {
        db()
          .prepare("INSERT INTO privacy_requests VALUES(?,?,?,?,?,?,?,?)")
          .run(
            id,
            u.id,
            digest(token),
            "requested",
            now,
            now,
            null,
            JSON.stringify(retained),
          );
        db()
          .prepare(
            "UPDATE users SET status='deletion_pending',name='Compte supprimé' WHERE id=?",
          )
          .run(u.id);
        db()
          .prepare(
            "UPDATE listings SET status='withdrawn',public_json=NULL,version=version+1 WHERE seller_id=?",
          )
          .run(u.id);
        db()
          .prepare(
            "DELETE FROM claims WHERE listing_id IN(SELECT id FROM listings WHERE seller_id=?)",
          )
          .run(u.id);
        db().prepare("DELETE FROM favorites WHERE user_id=?").run(u.id);
        db().prepare("DELETE FROM sessions WHERE user_id=?").run(u.id);
        db().prepare("UPDATE mail_tokens SET used=1 WHERE user_id=?").run(u.id);
        audit(u.id, "privacy.deletion_requested", id);
      });
      const h = headers();
      h.append("Set-Cookie", endSession(request));
      h.append("Set-Cookie", cookie(request, `${id}.${token}`));
      return respond(
        {
          id,
          state: "requested",
          deactivated: true,
          completeErasure: false,
          retainedCategories: retained,
        },
        201,
        h,
      );
    }
    // A separate verified Auth session supplies a fresh password AMR. It never overwrites browser cookies.
    const reauth = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { auth: { persistSession: false, autoRefreshToken: false } },
    );
    const fresh = await reauth.auth.signInWithPassword({
      email: u.email,
      password: input.password,
    });
    if (fresh.error || fresh.data.user?.id !== u.id) {
      await reauth.auth.signOut({ scope: "local" });
      throw new ApiError(
        403,
        "Confirmez votre mot de passe.",
        "REAUTH_REQUIRED",
      );
    }
    try {
      if (action === "export") {
        const r = await reauth.rpc("gp_privacy_export");
        if (r.error)
          throw new ApiError(503, "Votre export n’a pas pu être préparé.");
        const bytes = Buffer.byteLength(JSON.stringify(r.data));
        if (bytes > 32 * 1024 * 1024)
          throw new ApiError(
            413,
            "Cet export dépasse la limite de téléchargement direct. Aucune version tronquée n’a été produite.",
            "EXPORT_TOO_LARGE",
          );
        return respond(r.data);
      }
      const token = randomBytes(32).toString("hex"),
        r = await reauth.rpc("gp_privacy_request_deletion", {
          p_receipt_hash: digest(token),
        });
      if (r.error)
        throw new ApiError(
          r.error.message.includes("LAST_ADMIN") ? 409 : 503,
          r.error.message.includes("LAST_ADMIN")
            ? "Transférez les accès du dernier administrateur avant de fermer ce compte."
            : "La demande n’a pas été confirmée. Réessayez.",
        );
      await client.auth.signOut({ scope: "local" });
      const h = headers();
      h.append("Set-Cookie", cookie(request, `${r.data.id}.${token}`));
      return respond(
        { ...r.data, deactivated: true, completeErasure: false },
        201,
        h,
      );
    } finally {
      await reauth.auth.signOut({ scope: "local" });
    }
  } catch (error) {
    const h =
      context?.headers() ||
      new Headers({ "Cache-Control": "private, no-store" });
    if (error instanceof ApiError)
      return Response.json(
        { error: error.message, code: error.code },
        { status: error.status, headers: h },
      );
    return Response.json(
      {
        error:
          error instanceof z.ZodError
            ? "Vérifiez les champs demandés."
            : "Cette opération de confidentialité est indisponible.",
      },
      { status: error instanceof z.ZodError ? 400 : 503, headers: h },
    );
  }
}
