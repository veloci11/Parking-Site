import { z } from "zod";
import {
  modelingRequestDecisionSchema,
  modelingRequestInputSchema,
  modelingRequestStatusSchema,
  type ModelingRequest,
  type AdminModelingRequest,
  type AdminModelingRequests,
  type ModelingRequestDecision,
  type ModelingRequestStatus,
} from "@/lib/modeling-requests";
import type { User } from "@/lib/types";
import { db, transact } from "./db";
import { ApiError, audit } from "./security";
import { sceneContext } from "./scenes/context";
import { readBoundedJson } from "./json-body";

type Row = Record<string, unknown>;
export function modelingRequestDB() {
  const sql = db();
  sql.exec(`CREATE TABLE IF NOT EXISTS parking_modeling_requests(
    listing_id TEXT PRIMARY KEY REFERENCES listings(id) ON DELETE CASCADE,owner_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    note TEXT NOT NULL DEFAULT '' CHECK(length(note)<=2000),
    status TEXT NOT NULL DEFAULT 'requested' CHECK(status IN ('requested','in_progress','ready','declined')),
    requested_at TEXT NOT NULL,updated_at TEXT NOT NULL,actor_id TEXT REFERENCES users(id) ON DELETE SET NULL,
    version INTEGER NOT NULL DEFAULT 1 CHECK(version>0));
    CREATE INDEX IF NOT EXISTS modeling_requests_queue ON parking_modeling_requests(status,requested_at,listing_id);
    CREATE INDEX IF NOT EXISTS modeling_requests_owner ON parking_modeling_requests(owner_id);
    CREATE TRIGGER IF NOT EXISTS modeling_request_listing_delete BEFORE DELETE ON listings BEGIN DELETE FROM parking_modeling_requests WHERE listing_id=OLD.id; END;
    CREATE TRIGGER IF NOT EXISTS modeling_request_owner_delete BEFORE DELETE ON users BEGIN DELETE FROM parking_modeling_requests WHERE owner_id=OLD.id; UPDATE parking_modeling_requests SET actor_id=NULL WHERE actor_id=OLD.id; END;`);
  return sql;
}
function account(actor: User, verified = false, admin = false) {
  const row = db()
    .prepare("SELECT role,status,verified FROM users WHERE id=?")
    .get(actor.id);
  if (!row || row.status !== "active")
    throw new ApiError(403, "Ce compte n’est pas actif.", "FORBIDDEN");
  if (verified && !row.verified)
    throw new ApiError(
      403,
      "Confirmez votre adresse email.",
      "EMAIL_UNVERIFIED",
    );
  if (admin && row.role !== "admin")
    throw new ApiError(403, "Accès réservé aux administrateurs.", "FORBIDDEN");
}
function ownListing(actor: User, listingId: string) {
  if (
    !db()
      .prepare("SELECT 1 FROM listings WHERE id=? AND seller_id=?")
      .get(listingId, actor.id)
  )
    throw new ApiError(404, "Annonce introuvable.", "NOT_FOUND");
}
function dto(row: Row): ModelingRequest {
  return {
    listingId: String(row.listing_id),
    note: String(row.note),
    status: row.status as ModelingRequestStatus,
    requestedAt: String(row.requested_at),
    updatedAt: String(row.updated_at),
    version: Number(row.version),
  };
}
function adminDto(row: Row): AdminModelingRequest {
  return {
    ...dto(row),
    ownerId: String(row.owner_id),
    ownerName: String(row.owner_name),
    listingTitle: String(row.listing_title),
  };
}
const adminSelect =
  "SELECT m.*,u.name AS owner_name,COALESCE(json_extract(l.draft_json,'$.title'),'') AS listing_title FROM parking_modeling_requests m JOIN users u ON u.id=m.owner_id JOIN listings l ON l.id=m.listing_id";
export function localOwnModelingRequest(
  actor: User,
  listingId: string,
): ModelingRequest | null {
  account(actor);
  ownListing(actor, listingId);
  const row = modelingRequestDB()
    .prepare(
      "SELECT * FROM parking_modeling_requests WHERE listing_id=? AND owner_id=?",
    )
    .get(listingId, actor.id);
  return row ? dto(row) : null;
}
export function localRequestModeling(
  actor: User,
  listingId: string,
  note: string,
): ModelingRequest {
  const sql = modelingRequestDB();
  return transact(() => {
    account(actor, true);
    ownListing(actor, listingId);
    const old = sql
      .prepare("SELECT * FROM parking_modeling_requests WHERE listing_id=?")
      .get(listingId);
    if (old) {
      if (old.owner_id !== actor.id)
        throw new ApiError(404, "Demande introuvable.", "NOT_FOUND");
      return dto(old);
    }
    const normalized = modelingRequestInputSchema.parse({ note }).note ?? "",
      date = new Date().toISOString();
    sql
      .prepare(
        "INSERT INTO parking_modeling_requests(listing_id,owner_id,note,requested_at,updated_at) VALUES(?,?,?,?,?)",
      )
      .run(listingId, actor.id, normalized, date, date);
    audit(actor.id, "modeling.requested", listingId, "manual-modeling-v1");
    return dto(
      sql
        .prepare("SELECT * FROM parking_modeling_requests WHERE listing_id=?")
        .get(listingId)!,
    );
  });
}
export function localAdminModelingRequests(
  actor: User,
  status: ModelingRequestStatus | null,
  offset: number,
  limit: number,
): AdminModelingRequests {
  account(actor, true, true);
  const sql = modelingRequestDB();
  const where = status ? " WHERE m.status=?" : "",
    args = status ? [status] : [];
  const total = Number(
    sql
      .prepare("SELECT COUNT(*) AS n FROM parking_modeling_requests m" + where)
      .get(...args)!.n,
  );
  const requests = sql
    .prepare(
      adminSelect +
        where +
        " ORDER BY CASE m.status WHEN 'requested' THEN 0 WHEN 'in_progress' THEN 1 WHEN 'ready' THEN 2 ELSE 3 END,m.requested_at,m.listing_id LIMIT ? OFFSET ?",
    )
    .all(...args, limit, offset)
    .map(adminDto);
  return { requests, total, offset, hasMore: offset + requests.length < total };
}
export function localDecideModelingRequest(
  actor: User,
  decision: ModelingRequestDecision,
): AdminModelingRequest {
  const sql = modelingRequestDB();
  return transact(() => {
    account(actor, true, true);
    const row = sql
      .prepare(adminSelect + " WHERE m.listing_id=?")
      .get(decision.listingId);
    if (!row) throw new ApiError(404, "Demande introuvable.", "NOT_FOUND");
    if (Number(row.version) !== decision.version)
      throw new ApiError(
        409,
        "La demande a changé. Rechargez-la.",
        "VERSION_CONFLICT",
      );
    if (row.status !== decision.status) {
      sql
        .prepare(
          "UPDATE parking_modeling_requests SET status=?,version=version+1,updated_at=?,actor_id=? WHERE listing_id=?",
        )
        .run(
          decision.status,
          new Date().toISOString(),
          actor.id,
          decision.listingId,
        );
      audit(
        actor.id,
        "modeling.status_changed",
        decision.listingId,
        String(row.status) + "->" + decision.status,
      );
    }
    return adminDto(
      sql
        .prepare(adminSelect + " WHERE m.listing_id=?")
        .get(decision.listingId)!,
    );
  });
}
/** Manual queue only: no source processing, scene creation/review, publication or email. */
export async function handleModelingRequests(
  request: Request,
  listingId?: string,
): Promise<Response> {
  let context: ReturnType<typeof sceneContext> | undefined;
  try {
    context = sceneContext(request);
    const actor = (await context.user())!;
    const respond = (data: unknown) =>
      Response.json({ data }, { headers: context!.headers() });
    const rpc = async (name: string, args?: Record<string, unknown>) => {
      const result = await context!.client!.rpc(name, args);
      if (result.error) throw result.error;
      return result.data;
    };
    if (listingId !== undefined) {
      if (!z.string().uuid().safeParse(listingId).success)
        throw new ApiError(
          400,
          "Annonce invalide.",
          "MODELING_REQUEST_INVALID",
        );
      if (request.method === "GET")
        return respond(
          context.client
            ? await rpc("gp_my_modeling_request", { p_listing_id: listingId })
            : localOwnModelingRequest(actor, listingId),
        );
      if (request.method === "POST") {
        if (!actor.emailVerified)
          throw new ApiError(
            403,
            "Confirmez votre adresse email.",
            "EMAIL_UNVERIFIED",
          );
        const input = modelingRequestInputSchema.parse(
          await readBoundedJson(request, 16384),
        );
        return respond(
          context.client
            ? await rpc("gp_request_parking_modeling", {
                p_listing_id: listingId,
                p_note: input.note ?? "",
              })
            : localRequestModeling(actor, listingId, input.note ?? ""),
        );
      }
      throw new ApiError(405, "Méthode indisponible.");
    }
    await context.moderator(actor);
    if (actor.role !== "admin")
      throw new ApiError(
        403,
        "Accès réservé aux administrateurs.",
        "FORBIDDEN",
      );
    if (request.method === "GET") {
      const url = new URL(request.url),
        statusValue = url.searchParams.get("status");
      const status =
        statusValue === null
          ? null
          : modelingRequestStatusSchema.parse(statusValue);
      const offset = z.coerce
        .number()
        .int()
        .min(0)
        .max(1000000)
        .parse(url.searchParams.get("offset") ?? 0);
      const limit = z.coerce
        .number()
        .int()
        .min(1)
        .max(100)
        .parse(url.searchParams.get("limit") ?? 50);
      return respond(
        context.client
          ? await rpc("gp_admin_modeling_requests", {
              p_status: status,
              p_offset: offset,
              p_limit: limit,
            })
          : localAdminModelingRequests(actor, status, offset, limit),
      );
    }
    if (request.method === "PATCH") {
      const decision = modelingRequestDecisionSchema.parse(
        await readBoundedJson(request, 16384),
      );
      return respond(
        context.client
          ? await rpc("gp_decide_modeling_request", {
              p_listing_id: decision.listingId,
              p_status: decision.status,
              p_version: decision.version,
            })
          : localDecideModelingRequest(actor, decision),
      );
    }
    throw new ApiError(405, "Méthode indisponible.");
  } catch (error) {
    const known: Record<string, [number, string]> = {
      UNAUTHENTICATED: [401, "Connectez-vous pour continuer."],
      FORBIDDEN: [403, "Action non autorisée."],
      EMAIL_UNVERIFIED: [403, "Confirmez votre adresse email."],
      MFA_REQUIRED: [403, "Confirmez votre double authentification."],
      MFA_OR_PERMISSION_REQUIRED: [
        403,
        "L’administration requiert une session admin avec MFA.",
      ],
      VERSION_CONFLICT: [409, "La demande a changé. Rechargez-la."],
      NOT_FOUND: [404, "Demande ou annonce introuvable."],
      MODELING_REQUEST_INVALID: [400, "Demande de modélisation invalide."],
    };
    const message = (error as Error).message ?? "",
      code = Object.keys(known).find((key) => message.includes(key));
    const failure =
      error instanceof ApiError
        ? error
        : error instanceof z.ZodError
          ? new ApiError(
              400,
              "Demande, statut ou pagination invalide.",
              "MODELING_REQUEST_INVALID",
            )
          : code
            ? new ApiError(known[code][0], known[code][1], code)
            : new ApiError(
                500,
                "La demande de modélisation n’a pas pu être traitée.",
                "INTERNAL_ERROR",
              );
    return Response.json(
      { error: failure.message, code: failure.code },
      {
        status: failure.status,
        headers: context?.headers() ?? { "Cache-Control": "private, no-store" },
      },
    );
  }
}
