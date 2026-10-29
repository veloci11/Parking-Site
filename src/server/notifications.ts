import { db } from "./db";
import type { User } from "@/lib/types";
const initialized = new WeakSet<object>();
export interface AppNotification {
  id: string;
  type: string;
  title: string;
  body: string;
  url: string;
  createdAt: string;
  readAt: string | null;
}
export function notificationContent(type: string, target: string) {
  const titles: Record<string, string> = {
    message: "Un nouveau message vous attend",
    conversation: "Un acheteur souhaite vous contacter",
    visit: "Une demande de visite vous attend",
    visit_decision: "Votre demande de visite a été mise à jour",
    moderation: "Votre annonce a été examinée",
  };
  let conversationId: string | undefined;
  if (type === "message")
    conversationId = db()
      .prepare("SELECT conversation_id FROM messages WHERE id=?")
      .get(target)?.conversation_id as string | undefined;
  if (type === "conversation") conversationId = target;
  if (type === "visit" || type === "visit_decision")
    conversationId = db()
      .prepare("SELECT conversation_id FROM visits WHERE id=?")
      .get(target.split(":")[0])?.conversation_id as string | undefined;
  return {
    title: titles[type] || "Une mise à jour est disponible",
    body: "Consultez votre espace GP pour retrouver les informations et poursuivre votre échange.",
    url: conversationId
      ? `/compte/messages/${conversationId}`
      : type === "moderation"
        ? "/compte/annonces"
        : "/compte",
  };
}
export function ensureNotificationSchema() {
  const sql = db();
  if (!initialized.has(sql)) {
    sql.exec(
      `CREATE TABLE IF NOT EXISTS notifications(id TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES users(id),type TEXT NOT NULL,target_id TEXT NOT NULL,title TEXT NOT NULL,body TEXT NOT NULL,url TEXT NOT NULL,read_at TEXT,created_at TEXT NOT NULL,UNIQUE(user_id,type,target_id)); CREATE TABLE IF NOT EXISTS message_reads(user_id TEXT REFERENCES users(id),message_id TEXT REFERENCES messages(id),read_at TEXT NOT NULL,PRIMARY KEY(user_id,message_id)); CREATE INDEX IF NOT EXISTS notifications_user_time ON notifications(user_id,created_at DESC);`,
    );
    const ensure = (table: string, column: string, type: string) => {
      if (
        !sql
          .prepare(`PRAGMA table_info(${table})`)
          .all()
          .some((row) => row.name === column)
      )
        sql.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${type}`);
    };
    ensure("users", "email_notifications", "INTEGER NOT NULL DEFAULT 1");
    for (const [c, t] of Object.entries({
      status: "TEXT NOT NULL DEFAULT 'open'",
      row_version: "INTEGER NOT NULL DEFAULT 1",
      decision_reason: "TEXT",
      decided_by: "TEXT",
      decided_at: "TEXT",
    }))
      ensure("reports", c, t);
    for (const [c, t] of Object.entries({
      attempts: "INTEGER NOT NULL DEFAULT 0",
      next_run_at: "TEXT",
      lease_token: "TEXT",
      lease_until: "TEXT",
      sent_at: "TEXT",
      last_error_code: "TEXT",
      previewed_at: "TEXT",
    }))
      ensure("outbox", c, t);
    initialized.add(sql);
  }
  const rows = sql
    .prepare(
      "SELECT * FROM outbox WHERE NOT EXISTS(SELECT 1 FROM notifications n WHERE n.user_id=outbox.user_id AND n.type=outbox.type AND n.target_id=outbox.target_id)",
    )
    .all();
  for (const row of rows) {
    const content = notificationContent(
      String(row.type),
      String(row.target_id),
    );
    sql
      .prepare("INSERT OR IGNORE INTO notifications VALUES(?,?,?,?,?,?,?,?,?)")
      .run(
        String(row.id),
        String(row.user_id),
        String(row.type),
        String(row.target_id),
        content.title,
        content.body,
        content.url,
        null,
        String(row.created_at),
      );
  }
}
export function notificationsFor(userId: string) {
  ensureNotificationSchema();
  const rows = db()
    .prepare(
      "SELECT * FROM notifications WHERE user_id=? ORDER BY created_at DESC,id DESC LIMIT 100",
    )
    .all(userId);
  return {
    data: rows.map(
      (r) =>
        ({
          id: String(r.id),
          type: String(r.type),
          title: String(r.title),
          body: String(r.body),
          url: String(r.url),
          createdAt: String(r.created_at),
          readAt: r.read_at as string | null,
        }) satisfies AppNotification,
    ),
    unread: Number(
      db()
        .prepare(
          "SELECT COUNT(*) AS n FROM notifications WHERE user_id=? AND read_at IS NULL",
        )
        .get(userId)?.n || 0,
    ),
  };
}
export function markNotificationsRead(userId: string, ids?: string[]) {
  ensureNotificationSchema();
  if (ids?.length === 0) return 0;
  const result = ids
    ? db()
        .prepare(
          `UPDATE notifications SET read_at=? WHERE user_id=? AND read_at IS NULL AND id IN (${ids.map(() => "?").join(",")})`,
        )
        .run(new Date().toISOString(), userId, ...ids)
    : db()
        .prepare(
          "UPDATE notifications SET read_at=? WHERE user_id=? AND read_at IS NULL",
        )
        .run(new Date().toISOString(), userId);
  return Number(result.changes);
}
export function markConversationRead(userId: string, conversationId: string) {
  ensureNotificationSchema();
  const sql = db(),
    date = new Date().toISOString();
  sql
    .prepare(
      "INSERT OR IGNORE INTO message_reads(user_id,message_id,read_at) SELECT ?,id,? FROM messages WHERE conversation_id=? AND sender_id<>?",
    )
    .run(userId, date, conversationId, userId);
  sql
    .prepare(
      "UPDATE notifications SET read_at=? WHERE user_id=? AND url=? AND read_at IS NULL",
    )
    .run(date, userId, `/compte/messages/${conversationId}`);
}
export function unreadFor(userId: string, conversationId: string) {
  ensureNotificationSchema();
  return Number(
    db()
      .prepare(
        "SELECT COUNT(*) AS n FROM messages m WHERE m.conversation_id=? AND m.sender_id<>? AND NOT EXISTS(SELECT 1 FROM message_reads r WHERE r.message_id=m.id AND r.user_id=?)",
      )
      .get(conversationId, userId, userId)?.n || 0,
  );
}
export function reportDTO(row: Record<string, unknown>) {
  return {
    id: String(row.id),
    listingId: String(row.listing_id),
    reason: String(row.reason),
    status: String(row.status),
    version: Number(row.row_version),
    createdAt: String(row.created_at),
    decisionReason: row.decision_reason as string | null,
  };
}
