import { test, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { safeAuthReturn, localAuthPolicy } from "../src/lib/auth-return";
import {
  authFlow,
  authAccountDigest,
  acceptsAuthExchange,
  signAuthValue,
  verifyAuthValue,
} from "../src/server/auth-grants";
import { handleAuthCommands } from "../src/server/auth-commands";
import { db, resetDbForTests } from "../src/server/db";
const dir = mkdtempSync(join(tmpdir(), "gp-auth-commands-"));
process.env.GP_FORCE_LOCAL_DEMO = "true";
process.env.GP_DATABASE_PATH = join(dir, "qa.sqlite");
after(() => {
  resetDbForTests();
  rmSync(dir, { recursive: true, force: true });
});
const request = (action: string, body?: unknown, cookie = "") =>
  new Request(`http://127.0.0.1:3000/api/auth/commands/${action}`, {
    method: body ? "POST" : "GET",
    headers: {
      origin: "http://127.0.0.1:3000",
      "content-type": "application/json",
      cookie,
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
test("retours Auth limités aux pages connues, sans URL externe/API ni séparateur encodé", () => {
  for (const value of [
    "//evil.invalid",
    "https://evil.invalid",
    "/api/me/export",
    "/compte\\@evil.invalid",
    "/%2f%2fevil.invalid",
    "/compte%0aevil",
    "/inconnu",
  ])
    assert.equal(safeAuthReturn(value), "/compte");
  assert.equal(safeAuthReturn("/deposer?token=secret"), "/deposer");
  const id = randomUUID();
  assert.equal(
    safeAuthReturn(`/annonces/${id}/parking?contact=1&secret=x`),
    `/annonces/${id}/parking?contact=1`,
  );
  assert.equal(
    safeAuthReturn(`/compte/messages/${id}`),
    `/compte/messages/${id}`,
  );
});
test("la connexion reprend la messagerie, l'administration et la place choisie sans garder de paramètres privés", () => {
  for (const page of [
    "/compte/messages",
    "/compte/notifications",
    "/compte/scenes",
    "/compte/parkings",
    "/admin",
    "/admin/comptes",
  ])
    assert.equal(safeAuthReturn(`${page}?token=secret`), page);
  const listing = randomUUID(),
    unit = randomUUID();
  const path = `/annonces/${listing}/parking`;
  assert.equal(
    safeAuthReturn(`${path}?contact=1&unit=${unit}&floor=-2&token=secret`),
    `${path}?contact=1&unit=${unit}&floor=-2`,
  );
  assert.equal(safeAuthReturn(`${path}?unit=arbitrary&floor=99`), path);
  assert.equal(
    safeAuthReturn(`${path}?contact=1&unit=${listing}%3Aunit%3A18`),
    `${path}?contact=1&unit=${listing}%3Aunit%3A18`,
  );
  assert.equal(safeAuthReturn(`${path}?unit=${unit}%3Aunit%3A18`), path);
  assert.equal(
    safeAuthReturn(`${path}?unit=${unit}&floor=-999`),
    `${path}?unit=${unit}`,
  );
  assert.equal(
    safeAuthReturn(`/?display=list&listing=${listing}`),
    `/?listing=${listing}&display=list`,
  );
  assert.equal(safeAuthReturn("/?display=untrusted"), "/");
  assert.equal(safeAuthReturn("/admin/not-a-page"), "/compte");
});
test("état signé et autorisation de récupération refusent altération, mauvaise clé, expiration et contexte malformé", () => {
  const key = "qa-only-".repeat(8),
    now = Date.now(),
    flow = authFlow(
      "recovery",
      "/deposer",
      now,
      authAccountDigest("qa@test.invalid", key),
    ),
    raw = signAuthValue(flow, key);
  assert.deepEqual(verifyAuthValue(raw, key, now), flow);
  assert.equal(verifyAuthValue(raw + "x", key, now), null);
  assert.equal(verifyAuthValue(raw, "other-key", now), null);
  assert.equal(verifyAuthValue(raw, key, now + 31 * 60000), null);
  const grant = {
    kind: "password-reset" as const,
    userId: randomUUID(),
    sessionId: randomUUID(),
    nonce: randomUUID(),
    expiresAt: now + 60000,
  };
  assert.deepEqual(verifyAuthValue(signAuthValue(grant, key), key, now), grant);
  assert.equal(
    verifyAuthValue(
      signAuthValue({ ...grant, sessionId: "-".repeat(36) }, key),
      key,
      now,
    ),
    null,
  );
  assert.equal(verifyAuthValue("x".repeat(12001), key), null);
});
test("inscription locale exige versions et accord, enregistre la déclaration puis changement réauthentifié ferme la session", async () => {
  const input = {
    name: "QA Auth",
    email: `${randomUUID()}@test.invalid`,
    password: "Current-qa-password-123",
    sellerType: "private",
    ...localAuthPolicy,
    termsAccepted: true,
    next: "/deposer",
  };
  assert.equal(
    (
      await handleAuthCommands(
        request("register", { ...input, termsAccepted: false }),
      )
    ).status,
    400,
  );
  assert.equal(
    (
      await handleAuthCommands(
        request("register", { ...input, termsVersion: "obsolete" }),
      )
    ).status,
    409,
  );
  const created = await handleAuthCommands(request("register", input));
  assert.equal(created.status, 201);
  const data = await created.clone().json();
  assert.ok(data.data.id);
  const stored = db()
    .prepare("SELECT * FROM terms_acceptances WHERE user_id=?")
    .get(data.data.id)!;
  assert.equal(stored.terms_version, localAuthPolicy.termsVersion);
  assert.equal(stored.source, "signup_declaration");
  const cookies = created.headers
    .getSetCookie()
    .map((c) => c.split(";")[0])
    .join("; ");
  assert.ok(cookies);
  const status = await handleAuthCommands(request("terms", undefined, cookies));
  assert.equal((await status.json()).data.accepted, true);
  assert.equal(
    (
      await handleAuthCommands(
        request(
          "change-password",
          { currentPassword: "wrong", password: "New-secure-password-456" },
          cookies,
        ),
      )
    ).status,
    403,
  );
  const changed = await handleAuthCommands(
    request(
      "change-password",
      { currentPassword: input.password, password: "New-secure-password-456" },
      cookies,
    ),
  );
  assert.equal(changed.status, 200);
  assert.match(changed.headers.get("set-cookie") || "", /Max-Age=0/);
  assert.equal(
    (await handleAuthCommands(request("terms", undefined, cookies))).status,
    401,
  );
});
test("échec callback redirige vers une page sûre sans code ni secret dans la destination", async () => {
  const response = await handleAuthCommands(
    new Request(
      "http://127.0.0.1:3000/api/auth/callback?code=private&next=https://evil.invalid",
    ),
    "callback",
  );
  assert.equal(response.status, 303);
  const target = new URL(response.headers.get("location")!);
  assert.equal(target.pathname, "/connexion");
  assert.equal(target.searchParams.get("next"), "/compte");
  assert.equal(target.searchParams.has("code"), false);
});

test("un code de confirmation normal ou d'un autre compte ne débloque pas la récupération", () => {
  const key = "test-binding-".repeat(6),
    email = "qa@test.invalid";
  const recovery = authFlow(
    "recovery",
    "/compte",
    Date.now(),
    authAccountDigest(email, key),
  );
  assert.equal(acceptsAuthExchange(recovery, null, email, key), false);
  assert.equal(acceptsAuthExchange(recovery, "signup", email, key), false);
  assert.equal(
    acceptsAuthExchange(recovery, "recovery", "other@test.invalid", key),
    false,
  );
  assert.equal(acceptsAuthExchange(recovery, "recovery", email, key), true);
  assert.equal(JSON.stringify(recovery).includes(email), false);
});
