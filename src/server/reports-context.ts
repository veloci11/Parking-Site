import { reportPageQuery, localReportPageWhere } from "./report-pagination";
import { historyCursor } from "./history-pagination";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { db, transact } from "./db";
import { ApiError, audit, rateLimit } from "./security";
import { readBoundedJson } from "./json-body";
import { ensureNotificationSchema } from "./notifications";
import { sceneContext } from "./scenes/context";
import type { User } from "@/lib/types";
import type {
  ContextReport,
  ContextReportDetail,
  ReportEvidence,
} from "@/lib/context-reports";
const createSchema = z
  .object({
    targetType: z.enum(["conversation", "message"]),
    targetId: z.string().uuid(),
    category: z.enum(["harassment", "fraud", "personal_data", "spam", "other"]),
    reason: z.string().trim().min(10).max(2000),
    clientRequestId: z.string().uuid(),
  })
  .strict();
const decisionSchema = z
  .object({
    version: z.number().int().positive(),
    status: z.enum(["reviewed", "dismissed"]),
    reason: z.string().trim().min(15).max(2000),
  })
  .strict();
const appealSchema = z
  .object({
    version: z.number().int().positive(),
    reason: z.string().trim().min(15).max(2000),
  })
  .strict();
export function ensureContextReports() {
  db().exec(
    `CREATE TABLE IF NOT EXISTS context_reports(id TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES users(id),target_type TEXT NOT NULL,target_id TEXT NOT NULL,conversation_id TEXT NOT NULL REFERENCES conversations(id),category TEXT NOT NULL,reason TEXT NOT NULL,client_request_id TEXT NOT NULL,status TEXT NOT NULL DEFAULT 'open',row_version INTEGER NOT NULL DEFAULT 1,decision_reason TEXT,decided_at TEXT,appeal_reason TEXT,appealed_at TEXT,created_at TEXT NOT NULL,UNIQUE(user_id,target_type,target_id,category),UNIQUE(user_id,client_request_id));CREATE TABLE IF NOT EXISTS context_report_evidence(report_id TEXT PRIMARY KEY REFERENCES context_reports(id),snapshot_json TEXT NOT NULL);CREATE TABLE IF NOT EXISTS context_report_decisions(id TEXT PRIMARY KEY,report_id TEXT NOT NULL REFERENCES context_reports(id),actor_id TEXT NOT NULL,decision TEXT NOT NULL,reason TEXT NOT NULL,created_at TEXT NOT NULL);`,
  );
}
function mapReport(r: Record<string, unknown>): ContextReport {
  return {
    id: String(r.id),
    userId: String(r.user_id),
    targetType: r.target_type as ContextReport["targetType"],
    targetId: String(r.target_id),
    conversationId: String(r.conversation_id),
    category: r.category as ContextReport["category"],
    reason: String(r.reason),
    status: r.status as ContextReport["status"],
    version: Number(r.row_version),
    decisionReason:
      r.decision_reason == null ? null : String(r.decision_reason),
    decidedAt: r.decided_at == null ? null : String(r.decided_at),
    appealReason: r.appeal_reason == null ? null : String(r.appeal_reason),
    appealedAt: r.appealed_at == null ? null : String(r.appealed_at),
    createdAt: String(r.created_at),
  };
}
const isModerator = (u: User) =>
  u.emailVerified && ["moderator", "admin"].includes(u.role);
const verified = (u: User) => {
  if (!u.emailVerified)
    throw new ApiError(403, "Confirmez votre email.", "EMAIL_UNVERIFIED");
};
function localReport(id: string) {
  const row = db().prepare("SELECT * FROM context_reports WHERE id=?").get(id);
  if (!row) throw new ApiError(404, "Signalement introuvable.", "NOT_FOUND");
  return row;
}
export function createLocalContextReport(
  user: User,
  raw: unknown,
): ContextReport {
  ensureContextReports();
  verified(user);
  const input = createSchema.parse(raw);
  return transact(() => {
    let conversationId = input.targetId;
    let reported: Record<string, unknown> | undefined;
    if (input.targetType === "message") {
      reported = db()
        .prepare("SELECT * FROM messages WHERE id=?")
        .get(input.targetId);
      if (!reported)
        throw new ApiError(404, "Message introuvable.", "NOT_FOUND");
      conversationId = String(reported.conversation_id);
    }
    const conversation = db()
      .prepare("SELECT * FROM conversations WHERE id=?")
      .get(conversationId);
    if (
      !conversation ||
      ![conversation.buyer_id, conversation.seller_id].includes(user.id)
    )
      throw new ApiError(404, "Conversation introuvable.", "NOT_FOUND");
    const old = db()
      .prepare(
        "SELECT * FROM context_reports WHERE user_id=? AND (client_request_id=? OR (target_type=? AND target_id=? AND category=?))",
      )
      .get(
        user.id,
        input.clientRequestId,
        input.targetType,
        input.targetId,
        input.category,
      );
    if (old) {
      if (
        old.target_type !== input.targetType ||
        old.target_id !== input.targetId ||
        old.category !== input.category
      )
        throw new ApiError(
          409,
          "Cet identifiant désigne un autre signalement.",
          "VERSION_CONFLICT",
        );
      return mapReport(old);
    }
    rateLimit(`context_report:${user.id}`, 10, 3600);
    const rows = reported
      ? [reported]
      : db()
          .prepare(
            "SELECT * FROM (SELECT * FROM messages WHERE conversation_id=? ORDER BY created_at DESC,id DESC LIMIT 20) ORDER BY created_at,id",
          )
          .all(conversationId);
    const capturedAt = new Date().toISOString(),
      id = randomUUID();
    const snapshot: ReportEvidence = {
      scope: reported ? "reported_message_only" : "last_20_at_report_time",
      conversationId,
      listingId: String(conversation.listing_id),
      messages: rows.map((m) => ({
        id: String(m.id),
        senderId: String(m.sender_id),
        body: String(m.body),
        createdAt: String(m.created_at),
      })),
      capturedAt,
    };
    db()
      .prepare(
        "INSERT INTO context_reports(id,user_id,target_type,target_id,conversation_id,category,reason,client_request_id,created_at) VALUES(?,?,?,?,?,?,?,?,?)",
      )
      .run(
        id,
        user.id,
        input.targetType,
        input.targetId,
        conversationId,
        input.category,
        input.reason,
        input.clientRequestId,
        capturedAt,
      );
    db()
      .prepare("INSERT INTO context_report_evidence VALUES(?,?)")
      .run(id, JSON.stringify(snapshot));
    audit(user.id, "context_report.create", id);
    return mapReport(localReport(id));
  });
}
export function listLocalContextReports(
  user: User,
  admin = false,
): ContextReport[] {
  ensureContextReports();
  if (admin && !isModerator(user))
    throw new ApiError(403, "Accès réservé à la modération.", "FORBIDDEN");
  return db()
    .prepare(
      admin
        ? "SELECT * FROM context_reports ORDER BY created_at DESC,id LIMIT 100"
        : "SELECT * FROM context_reports WHERE user_id=? ORDER BY created_at DESC,id LIMIT 100",
    )
    .all(...(admin ? [] : [user.id]))
    .map(mapReport);
}
export function detailLocalContextReport(
  user: User,
  id: string,
): ContextReportDetail {
  ensureContextReports();
  const row = localReport(id),
    moderator = isModerator(user);
  if (row.user_id !== user.id && !moderator)
    throw new ApiError(404, "Signalement introuvable.", "NOT_FOUND");
  const decisions = db()
    .prepare(
      "SELECT decision,reason,created_at FROM context_report_decisions WHERE report_id=? ORDER BY created_at,id",
    )
    .all(id)
    .map((r) => ({
      decision: String(r.decision),
      reason: String(r.reason),
      createdAt: String(r.created_at),
    }));
  let evidence: ReportEvidence | null = null;
  if (moderator) {
    evidence = JSON.parse(
      String(
        db()
          .prepare(
            "SELECT snapshot_json FROM context_report_evidence WHERE report_id=?",
          )
          .get(id)?.snapshot_json || "null",
      ),
    );
    audit(user.id, "context_report.context_read", id);
  }
  return { report: mapReport(row), evidence, decisions };
}
export function decideLocalContextReport(
  user: User,
  id: string,
  raw: unknown,
): ContextReport {
  ensureContextReports();
  if (!isModerator(user))
    throw new ApiError(403, "Accès réservé à la modération.", "FORBIDDEN");
  const input = decisionSchema.parse(raw);
  ensureNotificationSchema();
  return transact(() => {
    const row = localReport(id);
    if (row.user_id === user.id)
      throw new ApiError(
        403,
        "Un autre modérateur doit traiter votre signalement.",
        "FORBIDDEN",
      );
    if (
      row.row_version !== input.version ||
      !["open", "appealed"].includes(String(row.status))
    )
      throw new ApiError(
        409,
        "Ce dossier a changé. Actualisez-le.",
        "VERSION_CONFLICT",
      );
    const at = new Date().toISOString();
    db()
      .prepare(
        "UPDATE context_reports SET status=?,row_version=row_version+1,decision_reason=?,decided_at=? WHERE id=?",
      )
      .run(input.status, input.reason, at, id);
    db()
      .prepare("INSERT INTO context_report_decisions VALUES(?,?,?,?,?,?)")
      .run(randomUUID(), id, user.id, input.status, input.reason, at);
    audit(user.id, `context_report.${input.status}`, id);
    db()
      .prepare(
        "INSERT INTO notifications(id,user_id,type,target_id,title,body,url,created_at) VALUES(?,?,?,?,?,?,?,?)",
      )
      .run(
        randomUUID(),
        row.user_id,
        "report_decision",
        `${id}:${input.version + 1}`,
        "Décision sur votre signalement",
        "Consultez le motif et les possibilités de réexamen dans votre espace.",
        "/compte/signalements",
        at,
      );
    return mapReport(localReport(id));
  });
}
export function appealLocalContextReport(
  user: User,
  id: string,
  raw: unknown,
): ContextReport {
  ensureContextReports();
  verified(user);
  const input = appealSchema.parse(raw);
  return transact(() => {
    const row = localReport(id);
    if (row.user_id !== user.id)
      throw new ApiError(404, "Signalement introuvable.", "NOT_FOUND");
    if (
      row.row_version !== input.version ||
      !["reviewed", "dismissed"].includes(String(row.status)) ||
      row.appeal_reason !== null
    )
      throw new ApiError(
        409,
        "Le réexamen est déjà demandé ou le dossier a changé.",
        "VERSION_CONFLICT",
      );
    rateLimit(`context_report_appeal:${user.id}`, 10, 3600);
    db()
      .prepare(
        "UPDATE context_reports SET status='appealed',row_version=row_version+1,appeal_reason=?,appealed_at=? WHERE id=?",
      )
      .run(input.reason, new Date().toISOString(), id);
    audit(user.id, "context_report.appeal", id);
    return mapReport(localReport(id));
  });
}
function reportError(error: { message: string } | null) {
  if (!error) return;
  for (const code of [
    "NOT_FOUND",
    "VERSION_CONFLICT",
    "FORBIDDEN",
    "EMAIL_UNVERIFIED",
    "UNAUTHENTICATED",
    "RATE_LIMITED",
    "VALIDATION_ERROR",
  ])
    if (error.message.includes(code))
      throw new ApiError(
        code === "NOT_FOUND"
          ? 404
          : code === "VERSION_CONFLICT"
            ? 409
            : code === "UNAUTHENTICATED"
              ? 401
              : code === "RATE_LIMITED"
                ? 429
                : code === "FORBIDDEN" || code === "EMAIL_UNVERIFIED"
                  ? 403
                  : 400,
        {
          NOT_FOUND: "Signalement introuvable.",
          VERSION_CONFLICT:
            "Le dossier a changé. Actualisez avant de continuer.",
          FORBIDDEN: "Cette action n’est pas autorisée.",
          EMAIL_UNVERIFIED: "Confirmez votre email.",
          UNAUTHENTICATED: "Connectez-vous pour continuer.",
          RATE_LIMITED: "Trop de signalements. Réessayez plus tard.",
          VALIDATION_ERROR: "Vérifiez le motif et la catégorie du signalement.",
        }[code] || "Action refusée.",
        code,
      );
  throw new ApiError(
    503,
    "Le service de signalement est indisponible.",
    "SERVICE_UNAVAILABLE",
  );
}
export async function handleContextReports(
  request: Request,
): Promise<Response> {
  let context: ReturnType<typeof sceneContext> | undefined;
  try {
    context = sceneContext(request);
    const { client, user, moderator, headers } = context;
    const u = (await user())!;
    const url = new URL(request.url),
      admin = url.pathname.startsWith("/api/admin/report-context"),
      path = url.pathname.replace(/^\/api\/(?:admin\/)?report-context\/?/, "");
    if (admin) await moderator(u);
    const respond = (data: unknown, status = 200) =>
      Response.json({ data }, { status, headers: headers() });
    async function rpc(name: string, args: Record<string, unknown>) {
      const result = await client!.rpc(name, args);
      reportError(result.error);
      return result.data;
    }
    if ((path === "" || path === "mine") && request.method === "GET") {
      const page = reportPageQuery(
        url,
        admin ? "context-reports:admin" : `context-reports:${u.id}`,
        true,
      );
      let rows: Record<string, unknown>[];
      if (client) {
        rows =
          (await rpc("gp_context_reports_page", {
            p_admin: admin,
            p_status: page.status,
            p_limit: page.limit,
            p_after: page.after
              ? { id: page.after.id, createdAt: page.after.createdAt }
              : null,
          })) || [];
      } else {
        ensureContextReports();
        const { conditions, values } = localReportPageWhere(page);
        if (!admin) {
          conditions.push("user_id = ?");
          values.push(u.id);
        }
        rows = db()
          .prepare(
            `SELECT * FROM context_reports ${conditions.length ? `WHERE ${conditions.join(" AND ")}` : ""} ORDER BY created_at DESC,id LIMIT ?`,
          )
          .all(...values, page.limit + 1);
      }
      return Response.json(
        {
          data: rows.slice(0, page.limit).map(mapReport),
          nextCursor: historyCursor(
            page.scope,
            rows as { id: unknown; created_at: unknown }[],
            page.limit,
          ),
        },
        { headers: headers() },
      );
    }

    if (path === "" && !admin && request.method === "POST") {
      const input = createSchema.parse(await readBoundedJson(request, 16384));
      return respond(
        client
          ? mapReport(
              await rpc("gp_context_report_create", {
                p_target_type: input.targetType,
                p_target_id: input.targetId,
                p_category: input.category,
                p_reason: input.reason,
                p_request_id: input.clientRequestId,
              }),
            )
          : createLocalContextReport(u, input),
        201,
      );
    }
    const match = path.match(/^([a-f0-9-]{36})(?:\/(appeal|decision))?$/);
    if (!match) throw new ApiError(404, "Ressource introuvable.", "NOT_FOUND");
    const [, id, action] = match;
    if (!action && request.method === "GET") {
      if (client) {
        const result = await rpc("gp_context_report_detail", { p_id: id });
        return respond({ ...result, report: mapReport(result.report) });
      }
      return respond(detailLocalContextReport(u, id));
    }
    if (action === "appeal" && !admin && request.method === "POST") {
      const input = appealSchema.parse(await readBoundedJson(request, 16384));
      return respond(
        client
          ? mapReport(
              await rpc("gp_context_report_appeal", {
                p_id: id,
                p_version: input.version,
                p_reason: input.reason,
              }),
            )
          : appealLocalContextReport(u, id, input),
      );
    }
    if (action === "decision" && admin && request.method === "POST") {
      const input = decisionSchema.parse(await readBoundedJson(request, 16384));
      return respond(
        client
          ? mapReport(
              await rpc("gp_context_report_decide", {
                p_id: id,
                p_version: input.version,
                p_status: input.status,
                p_reason: input.reason,
              }),
            )
          : decideLocalContextReport(u, id, input),
      );
    }
    throw new ApiError(404, "Ressource introuvable.", "NOT_FOUND");
  } catch (error) {
    const headers =
      context?.headers() ||
      new Headers({ "Cache-Control": "private, no-store" });
    if (error instanceof ApiError) {
      if (error.status === 429) headers.set("Retry-After", "3600");
      return Response.json(
        { error: error.message, code: error.code },
        { status: error.status, headers },
      );
    }
    if (error instanceof z.ZodError)
      return Response.json(
        {
          error: "Vérifiez la cible, la catégorie et le motif du signalement.",
          code: "VALIDATION_ERROR",
        },
        { status: 400, headers },
      );
    return Response.json(
      {
        error: "Le service de signalement est indisponible.",
        code: "SERVICE_UNAVAILABLE",
      },
      { status: 503, headers },
    );
  }
}
