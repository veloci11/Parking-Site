import {
  createHash,
  randomBytes,
  scryptSync,
  timingSafeEqual,
  randomUUID,
} from "node:crypto";
import { db, userDTO } from "./db";
import type { User } from "@/lib/types";
import { currentRequestId } from "./request-context";
import { localQuota } from "./entitlement-store";
export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public code = "VALIDATION_ERROR",
    public retryAfter?: number,
  ) {
    super(message);
  }
}
export const hash = (v: string) => createHash("sha256").update(v).digest("hex");
export const opaque = () => randomBytes(32).toString("hex");
export function passwordHash(value: string) {
  const salt = opaque();
  return `${salt}:${scryptSync(value, salt, 64).toString("hex")}`;
}
export function passwordMatches(value: string, encoded: string) {
  try {
    const [salt, key] = encoded.split(":");
    const actual = scryptSync(value, salt, 64);
    const expected = Buffer.from(key, "hex");
    return (
      expected.length === actual.length && timingSafeEqual(expected, actual)
    );
  } catch {
    return false;
  }
}
export function effectiveOrigin(request: Request) {
  const url = new URL(request.url);
  const host = request.headers.get("host");
  const configured = process.env.NEXT_PUBLIC_SITE_URL;
  if (configured && process.env.GP_FORCE_LOCAL_DEMO !== "true")
    return new URL(configured).origin;
  return host ? `${url.protocol}//${host}` : url.origin;
}
export function assertSameOrigin(request: Request) {
  if (
    !["GET", "HEAD", "OPTIONS"].includes(request.method) &&
    request.headers.get("origin") !== effectiveOrigin(request)
  )
    throw new ApiError(
      403,
      "Origine de la requête refusée.",
      "ORIGIN_REJECTED",
    );
}
export function assertLocal(request: Request) {
  const url = new URL(request.url);
  if (!["localhost", "127.0.0.1", "[::1]"].includes(url.hostname))
    throw new ApiError(
      503,
      "Cette version de développement est accessible uniquement en local.",
      "LOCAL_ONLY",
    );
  const host = new URL(effectiveOrigin(request));
  if (
    !["localhost", "127.0.0.1", "[::1]"].includes(host.hostname) ||
    host.port !== url.port
  )
    throw new ApiError(
      503,
      "Cette démonstration est réservée au poste local.",
      "LOCAL_ONLY",
    );
  if (
    process.env.NODE_ENV === "production" &&
    process.env.GP_LOCAL_DEMO !== "true"
  )
    throw new ApiError(
      503,
      "Le backend de production doit être configuré et validé avant ouverture.",
      "BACKEND_NOT_CONFIGURED",
    );
  assertSameOrigin(request);
}
export function currentUser(request: Request): User | null {
  const cookie = request.headers
    .get("cookie")
    ?.split(";")
    .map((s) => s.trim())
    .find((s) => s.startsWith("gp_session="))
    ?.slice(11);
  if (!cookie) return null;
  const row = db()
    .prepare(
      "SELECT u.* FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=? AND s.expires_at>? AND u.status='active'",
    )
    .get(hash(cookie), new Date().toISOString());
  return row ? userDTO(row) : null;
}
export function requireUser(request: Request, verified = false): User {
  const user = currentUser(request);
  if (!user)
    throw new ApiError(
      401,
      "Connectez-vous pour continuer.",
      "UNAUTHENTICATED",
    );
  if (verified && !user.emailVerified)
    throw new ApiError(
      403,
      "Confirmez votre adresse email pour continuer.",
      "EMAIL_UNVERIFIED",
    );
  return user;
}
export function requireModerator(request: Request) {
  const user = requireUser(request, true);
  if (!["moderator", "admin"].includes(user.role))
    throw new ApiError(403, "Accès réservé à la modération.", "FORBIDDEN");
  return user;
}
export function sessionCookie(userId: string) {
  const token = opaque();
  db()
    .prepare(
      "INSERT INTO sessions(token_hash,user_id,expires_at) VALUES(?,?,?)",
    )
    .run(hash(token), userId, new Date(Date.now() + 7 * 864e5).toISOString());
  return `gp_session=${token}; HttpOnly; SameSite=Lax; Path=/; Max-Age=604800`;
}
export function endSession(request: Request) {
  const token = request.headers
    .get("cookie")
    ?.split(";")
    .map((s) => s.trim())
    .find((s) => s.startsWith("gp_session="))
    ?.slice(11);
  if (token)
    db().prepare("DELETE FROM sessions WHERE token_hash=?").run(hash(token));
  return "gp_session=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0";
}
export function rateLimit(
  bucket: string,
  limit: number,
  seconds: number,
  amount = 1,
) {
  const now = Date.now();
  const separator = bucket.indexOf(":"),
    kind = bucket.slice(0, separator),
    userId = bucket.slice(separator + 1);
  const configured = separator > 0 ? localQuota(kind, userId) : null;
  const rules = [
    {
      bucket,
      limit: configured?.limit ?? limit,
      seconds: configured?.seconds ?? seconds,
      amount,
    },
  ];
  if (kind === "message" && configured) {
    const burst = localQuota("message_burst", userId)!;
    rules.push({ bucket: "message_burst:" + userId, ...burst, amount: 1 });
  }
  const writes = rules.map((rule) => {
    const row = db()
      .prepare("SELECT * FROM rate_limits WHERE bucket=?")
      .get(rule.bucket);
    const live = !!row && Number(row.reset_at) > now;
    const used = live ? Number(row.count) : 0,
      resetAt = live ? Number(row.reset_at) : now + rule.seconds * 1000;
    if (
      !Number.isSafeInteger(rule.amount) ||
      rule.amount <= 0 ||
      used + rule.amount > rule.limit
    )
      throw new ApiError(
        429,
        "Limite d’usage atteinte. Réessayez après sa remise à zéro.",
        "RATE_LIMITED",
        Math.max(1, Math.ceil((resetAt - now) / 1000)),
      );
    return { bucket: rule.bucket, count: used + rule.amount, resetAt };
  });
  for (const write of writes)
    db()
      .prepare(
        "INSERT INTO rate_limits(bucket,count,reset_at) VALUES(?,?,?) ON CONFLICT(bucket) DO UPDATE SET count=excluded.count,reset_at=excluded.reset_at",
      )
      .run(write.bucket, write.count, write.resetAt);
}
/** Count accepted private source bytes and uploads together, also inside an existing transaction. */
export function localConsumeUpload(userId: string, bytes: number) {
  const sql = db();
  sql.exec("SAVEPOINT gp_upload_quota");
  try {
    rateLimit("upload:" + userId, 60, 3600);
    rateLimit("upload_bytes:" + userId, 262144000, 86400, bytes);
    sql.exec("RELEASE gp_upload_quota");
  } catch (error) {
    sql.exec("ROLLBACK TO gp_upload_quota");
    sql.exec("RELEASE gp_upload_quota");
    throw error;
  }
}
export function audit(
  actorId: string,
  action: string,
  targetId: string,
  detail = "",
) {
  db()
    .prepare(
      "INSERT INTO audit(id,actor_id,action,target_id,detail,created_at,request_id) VALUES(?,?,?,?,?,?,?)",
    )
    .run(
      randomUUID(),
      actorId,
      action,
      targetId,
      detail,
      new Date().toISOString(),
      currentRequestId() ?? null,
    );
}
export function queueNotice(userId: string, type: string, targetId: string) {
  db()
    .prepare(
      "INSERT OR IGNORE INTO outbox(id,user_id,type,target_id,created_at) VALUES(?,?,?,?,?)",
    )
    .run(randomUUID(), userId, type, targetId, new Date().toISOString());
}
