import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import { safeAuthReturn } from "@/lib/auth-return";
export interface AuthFlow {
  kind: "register" | "recovery";
  next: string;
  accountDigest: string;
  expiresAt: number;
  nonce: string;
}
export interface RecoveryGrant {
  kind: "password-reset";
  userId: string;
  sessionId: string;
  expiresAt: number;
  nonce: string;
}
function mac(payload: string, key: string) {
  return createHmac("sha256", key).update(payload).digest("base64url");
}
export function signAuthValue(
  value: AuthFlow | RecoveryGrant,
  key: string,
): string {
  const body = Buffer.from(JSON.stringify(value)).toString("base64url");
  return `${body}.${mac(body, key)}`;
}
export function verifyAuthValue(
  raw: string | undefined,
  key: string,
  now = Date.now(),
): AuthFlow | RecoveryGrant | null {
  if (!raw || raw.length > 12000) return null;
  const [body, signature, extra] = raw.split(".");
  if (!body || !signature || extra) return null;
  const expected = Buffer.from(mac(body, key)),
    actual = Buffer.from(signature);
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected))
    return null;
  try {
    const value = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
    const uuid =
      /^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;
    if (
      !value ||
      !Number.isSafeInteger(value.expiresAt) ||
      value.expiresAt <= now ||
      typeof value.nonce !== "string" ||
      !uuid.test(value.nonce)
    )
      return null;
    if (value.kind === "password-reset") {
      if (
        typeof value.userId !== "string" ||
        !uuid.test(value.userId) ||
        typeof value.sessionId !== "string" ||
        !uuid.test(value.sessionId)
      )
        return null;
      return {
        kind: value.kind,
        userId: value.userId,
        sessionId: value.sessionId,
        expiresAt: value.expiresAt,
        nonce: value.nonce,
      };
    }
    if (
      !["register", "recovery"].includes(value.kind) ||
      typeof value.next !== "string" ||
      typeof value.accountDigest !== "string" ||
      !/^[a-f0-9]{64}$/.test(value.accountDigest)
    )
      return null;
    return {
      kind: value.kind,
      next: safeAuthReturn(value.next),
      accountDigest: value.accountDigest,
      expiresAt: value.expiresAt,
      nonce: value.nonce,
    };
  } catch {
    return null;
  }
}
export function authFlow(
  kind: AuthFlow["kind"],
  next: unknown,
  now = Date.now(),
  accountDigest: string,
): AuthFlow {
  return {
    kind,
    accountDigest,
    next: safeAuthReturn(next),
    expiresAt: now + (kind === "recovery" ? 30 * 60 : 24 * 60 * 60) * 1000,
    nonce: randomUUID(),
  };
}

export function authAccountDigest(email: string, key: string): string {
  return createHmac("sha256", key)
    .update("gp-auth-account:v1:" + email.trim().toLowerCase())
    .digest("hex");
}
/** Both the PKCE verifier's flow marker and signed account binding are required. */
export function acceptsAuthExchange(
  flow: AuthFlow,
  redirectType: string | null,
  email: string | undefined,
  key: string,
): boolean {
  if (!email || flow.accountDigest !== authAccountDigest(email, key))
    return false;
  return flow.kind !== "recovery" || redirectType === "recovery";
}
