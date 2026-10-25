import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { safeAuthReturn, type AuthPolicy } from "@/lib/auth-return";

export const oauthProviders = ["google", "apple"] as const;
export type OAuthProvider = (typeof oauthProviders)[number];
const schema = z
  .object({
    kind: z.literal("oauth-consent"),
    provider: z.enum(oauthProviders),
    pkceFlowId: z
      .string()
      .regex(/^[a-zA-Z0-9_-]{8,64}$/)
      .optional(),
    next: z.string().max(1800),
    termsVersion: z.string().min(1).max(100),
    privacyVersion: z.string().min(1).max(100),
    nonce: z.string().uuid(),
    expiresAt: z.number().int().positive(),
  })
  .strict();
export type OAuthIntent = z.infer<typeof schema>;

function signature(body: string, key: string) {
  return createHmac("sha256", key)
    .update("gp-oauth-v1:" + body)
    .digest();
}
export function createOAuthIntent(
  provider: OAuthProvider,
  next: unknown,
  policy: AuthPolicy,
  now = Date.now(),
): OAuthIntent {
  const destination = safeAuthReturn(next);
  return {
    kind: "oauth-consent",
    provider,
    next: destination.length <= 1800 ? destination : "/compte",
    ...policy,
    nonce: randomUUID(),
    expiresAt: now + 10 * 60 * 1000,
  };
}
export function signOAuthIntent(intent: OAuthIntent, key: string) {
  const body = Buffer.from(JSON.stringify(schema.parse(intent))).toString(
    "base64url",
  );
  return `${body}.${signature(body, key).toString("base64url")}`;
}
export function verifyOAuthIntent(
  raw: string | undefined,
  key: string,
  now = Date.now(),
): OAuthIntent | null {
  if (!raw || raw.length > 3800) return null;
  const [body, encodedSignature, extra] = raw.split(".");
  if (!body || !encodedSignature || extra) return null;
  const expected = signature(body, key),
    actual = Buffer.from(encodedSignature, "base64url");
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected))
    return null;
  try {
    const result = schema.safeParse(
      JSON.parse(Buffer.from(body, "base64url").toString("utf8")),
    );
    if (
      !result.success ||
      result.data.expiresAt <= now ||
      result.data.expiresAt > now + 10 * 60 * 1000
    )
      return null;
    return { ...result.data, next: safeAuthReturn(result.data.next) };
  } catch {
    return null;
  }
}
