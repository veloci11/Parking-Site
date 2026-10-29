import { test, after } from "node:test";
import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { handleAuthCommands } from "../src/server/auth-commands";
import {
  authFlow,
  authAccountDigest,
  signAuthValue,
} from "../src/server/auth-grants";

// The actual SSR SDK is used against a strict in-memory Auth transport.
// No request is sent to a real provider and no email/account is created.
const envKeys = [
  "GP_FORCE_LOCAL_DEMO",
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
  "NEXT_PUBLIC_SITE_URL",
  "GP_AUTH_FLOW_SECRET",
] as const;
const before = Object.fromEntries(
  envKeys.map((key) => [key, process.env[key]]),
);
Object.assign(process.env, {
  GP_FORCE_LOCAL_DEMO: "false",
  NEXT_PUBLIC_SUPABASE_URL: "https://gp-auth-fixture.supabase.co",
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_test_only",
  NEXT_PUBLIC_SITE_URL: "https://parking.test",
  GP_AUTH_FLOW_SECRET: "qa-auth-flow-secret-that-is-not-production".repeat(2),
});
const originalFetch = globalThis.fetch;
after(() => {
  globalThis.fetch = originalFetch;
  for (const key of envKeys) {
    if (before[key] === undefined) delete process.env[key];
    else process.env[key] = before[key];
  }
});
const policy = { termsVersion: "qa-terms", privacyVersion: "qa-privacy" };
const id = randomUUID(),
  sessionId = randomUUID(),
  email = "auth-qa@example.invalid";
const authUser = {
  id,
  aud: "authenticated",
  role: "authenticated",
  email,
  email_confirmed_at: new Date().toISOString(),
  created_at: new Date().toISOString(),
  app_metadata: {},
  user_metadata: {},
};
const token =
  [
    { alg: "HS256", typ: "JWT" },
    {
      sub: id,
      email,
      aud: "authenticated",
      role: "authenticated",
      session_id: sessionId,
      exp: Math.floor(Date.now() / 1000) + 3600,
      iat: Math.floor(Date.now() / 1000),
    },
  ]
    .map((v) => Buffer.from(JSON.stringify(v)).toString("base64url"))
    .join(".") + ".dGVzdA";
function fixture(
  options: {
    emailError?: string;
    emailStatus?: number;
    exchangeEmail?: string;
    exchangeFails?: boolean;
    updateFails?: boolean;
  } = {},
) {
  const calls: { url: URL; method: string; body: Record<string, unknown> }[] =
    [];
  let consumed = false;
  globalThis.fetch = async (input, init) => {
    const url = new URL(
      typeof input === "string"
        ? input
        : input instanceof URL
          ? input
          : input.url,
    );
    assert.equal(
      url.origin,
      "https://gp-auth-fixture.supabase.co",
      "test must never contact a live service",
    );
    const method = init?.method || "GET";
    const body = typeof init?.body === "string" ? JSON.parse(init.body) : {};
    calls.push({ url, method, body });
    if (url.pathname === "/rest/v1/rpc/gp_auth_policy")
      return Response.json(policy);
    if (
      ["/auth/v1/signup", "/auth/v1/recover", "/auth/v1/resend"].includes(
        url.pathname,
      )
    ) {
      if (options.emailError)
        return Response.json(
          { code: options.emailError, msg: "Provider detail is private" },
          { status: options.emailStatus || 429 },
        );
      return Response.json(url.pathname.endsWith("signup") ? authUser : {});
    }
    if (url.pathname === "/auth/v1/token") {
      if (options.exchangeFails)
        return Response.json(
          { code: "flow_state_expired", msg: "expired" },
          { status: 400 },
        );
      return Response.json({
        access_token: token,
        token_type: "bearer",
        expires_in: 3600,
        refresh_token: "test-refresh",
        user: { ...authUser, email: options.exchangeEmail || email },
      });
    }
    if (url.pathname === "/auth/v1/user") {
      if (method === "PUT" && options.updateFails)
        return Response.json(
          { code: "weak_password", msg: "rejected" },
          { status: 400 },
        );
      return Response.json(authUser);
    }
    if (url.pathname === "/rest/v1/profiles")
      return Response.json({ name: "Test member" });
    if (url.pathname === "/rest/v1/app_roles")
      return Response.json({ role: "member" });
    if (url.pathname === "/rest/v1/account_statuses")
      return Response.json({ status: "active" });
    if (url.pathname === "/rest/v1/rpc/gp_consume_recovery_grant") {
      assert.equal(body.p_session_id, sessionId);
      if (consumed)
        return Response.json(
          { code: "P0001", message: "RECOVERY_GRANT_USED" },
          { status: 400 },
        );
      consumed = true;
      return Response.json(true);
    }
    if (url.pathname === "/auth/v1/logout")
      return new Response(null, { status: 204 });
    throw new Error(`Unmocked Auth transport ${method} ${url.pathname}`);
  };
  return calls;
}
function request(action: string, body?: unknown, cookies = "") {
  return new Request(`https://parking.test/api/auth/commands/${action}`, {
    method: body === undefined ? "GET" : "POST",
    headers: {
      origin: "https://parking.test",
      cookie: cookies,
      "content-type": "application/json",
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}
function cookies(response: Response, previous = "") {
  const jar = new Map(
    previous
      .split("; ")
      .filter(Boolean)
      .map((c) => [c.slice(0, c.indexOf("=")), c.slice(c.indexOf("=") + 1)]),
  );
  for (const value of response.headers.getSetCookie()) {
    const pair = value.split(";")[0],
      split = pair.indexOf("=");
    if (value.includes("Max-Age=0")) jar.delete(pair.slice(0, split));
    else jar.set(pair.slice(0, split), pair.slice(split + 1));
  }
  return [...jar].map(([name, value]) => `${name}=${value}`).join("; ");
}
function callback(calls: ReturnType<typeof fixture>) {
  const call = calls.find((c) =>
    ["/auth/v1/signup", "/auth/v1/recover", "/auth/v1/resend"].includes(
      c.url.pathname,
    ),
  )!;
  const target = new URL(call.url.searchParams.get("redirect_to")!);
  assert.equal(target.origin, "https://parking.test");
  assert.equal(target.pathname, "/api/auth/callback");
  target.searchParams.set("code", "test-auth-code");
  return target;
}
async function completeFlow(kind: "register" | "forgot") {
  const calls = fixture();
  const start = await handleAuthCommands(
    request(
      kind,
      kind === "register"
        ? {
            name: "Test member",
            email,
            password: "qa-password-123456",
            termsAccepted: true,
            ...policy,
            next: "/deposer",
          }
        : { email, next: "/deposer" },
    ),
  );
  assert.equal(start.status, kind === "register" ? 201 : 200);
  const initialCookies = cookies(start);
  assert.match(initialCookies, /code-verifier/);
  const target = callback(calls);
  const response = await handleAuthCommands(
    new Request(target, { headers: { cookie: initialCookies } }),
    "callback",
  );
  return {
    calls,
    start,
    target,
    response,
    initialCookies,
    sessionCookies: cookies(response, initialCookies),
  };
}
test("connected signup accepts a buyer without seller status, uses PKCE, validates consent and returns to the requested page", async () => {
  const { calls, start, response } = await completeFlow("register");
  assert.equal(response.status, 303);
  assert.equal(
    response.headers.get("location"),
    "https://parking.test/deposer",
  );
  const signup = calls.find((c) => c.url.pathname.endsWith("signup"))!;
  assert.equal((signup.body.data as Record<string, unknown>).sellerType, null);
  assert.equal(signup.body.code_challenge_method, "s256");
  const exchange = calls.find((c) => c.url.pathname.endsWith("token"))!;
  assert.equal(
    createHash("sha256")
      .update(exchange.body.code_verifier as string)
      .digest("base64url"),
    signup.body.code_challenge,
  );
  for (const cookie of start.headers.getSetCookie()) {
    assert.match(cookie, /HttpOnly/);
    assert.match(cookie, /Secure/);
    assert.match(cookie, /SameSite=Lax/);
  }
  assert.match(response.headers.get("cache-control") || "", /no-store/);
  assert.ok(
    !response.headers
      .getSetCookie()
      .some(
        (c) => c.startsWith("gp_recovery_grant=") && !c.includes("Max-Age=0"),
      ),
  );
});
test("connected recovery grants password change only after its matching exchange and consumes the grant once", async () => {
  const { response, sessionCookies, calls } = await completeFlow("forgot");
  assert.equal(
    response.headers.get("location"),
    "https://parking.test/reinitialiser?next=%2Fdeposer",
  );
  const state = await handleAuthCommands(
    request("reset-status", undefined, sessionCookies),
  );
  assert.equal((await state.json()).data.recoveryReady, true);
  const reset = await handleAuthCommands(
    request("reset", { password: "updated-password-123456" }, sessionCookies),
  );
  assert.equal(reset.status, 200);
  assert.ok(
    calls.some((c) => c.url.pathname === "/auth/v1/user" && c.method === "PUT"),
  );
  assert.ok(calls.some((c) => c.url.pathname === "/auth/v1/logout"));
  assert.ok(
    reset.headers
      .getSetCookie()
      .some(
        (c) => c.startsWith("gp_recovery_grant=") && c.includes("Max-Age=0"),
      ),
  );
  const replay = await handleAuthCommands(
    request("reset", { password: "another-password-123456" }, sessionCookies),
  );
  assert.equal(replay.status, 403);
  assert.equal((await replay.json()).code, "RECOVERY_GRANT_USED");
});
test("resend uses a new signup PKCE exchange and preserves the requested return without revealing account existence", async () => {
  const calls = fixture();
  const start = await handleAuthCommands(
    request("resend", { email, next: "/compte/annonces" }),
  );
  assert.equal(start.status, 200);
  assert.match((await start.clone().json()).message, /Si cette adresse/);
  const target = callback(calls);
  const result = await handleAuthCommands(
    new Request(target, { headers: { cookie: cookies(start) } }),
    "callback",
  );
  assert.equal(
    result.headers.get("location"),
    "https://parking.test/compte/annonces",
  );
  const resend = calls.find((c) => c.url.pathname.endsWith("resend"))!;
  assert.equal(resend.body.type, "signup");
  assert.equal(resend.body.code_challenge_method, "s256");
});
test("email provider refusal and rate limits are visible failures, never successful sending messages", async () => {
  for (const [error, status, expected] of [
    ["over_email_send_rate_limit", 429, 429],
    ["email_address_not_authorized", 400, 503],
    ["unexpected_failure", 500, 503],
  ] as const) {
    fixture({ emailError: error, emailStatus: status });
    for (const action of ["forgot", "resend"] as const) {
      const result = await handleAuthCommands(request(action, { email }));
      assert.equal(result.status, expected);
      const body = await result.json();
      assert.ok(body.error);
      assert.equal(body.message, undefined);
      assert.ok(!JSON.stringify(body).includes("Provider detail"));
    }
  }
});
test("missing verifier, expired state and mismatched account cannot authorize reset or leak the callback code", async () => {
  let calls = fixture();
  const start = await handleAuthCommands(
    request("forgot", { email, next: "/deposer" }),
  );
  const target = callback(calls);
  const missing = await handleAuthCommands(new Request(target), "callback");
  assert.equal(missing.status, 303);
  const missingTarget = new URL(missing.headers.get("location")!);
  assert.equal(missingTarget.pathname, "/mot-de-passe-oublie");
  assert.equal(missingTarget.searchParams.get("next"), "/deposer");
  assert.equal(missingTarget.searchParams.has("code"), false);
  assert.ok(!calls.some((c) => c.url.pathname.endsWith("token")));
  const expired = authFlow(
    "recovery",
    "/deposer",
    Date.now() - 31 * 60000,
    authAccountDigest(email, process.env.GP_AUTH_FLOW_SECRET!),
  );
  target.searchParams.set(
    "state",
    signAuthValue(expired, process.env.GP_AUTH_FLOW_SECRET!),
  );
  const bad = await handleAuthCommands(
    new Request(target, { headers: { cookie: cookies(start) } }),
    "callback",
  );
  assert.equal(bad.status, 303);
  assert.ok(!calls.some((c) => c.url.pathname.endsWith("token")));
  calls = fixture({ exchangeEmail: "another@example.invalid" });
  const fresh = await handleAuthCommands(request("forgot", { email }));
  const wrong = await handleAuthCommands(
    new Request(callback(calls), { headers: { cookie: cookies(fresh) } }),
    "callback",
  );
  assert.equal(
    new URL(wrong.headers.get("location")!).searchParams.get("authError"),
    "invalid",
  );
  assert.ok(
    calls.some((c) => c.url.pathname.endsWith("logout")),
    "mismatched exchange must close its session",
  );
  assert.ok(
    !wrong.headers
      .getSetCookie()
      .some(
        (c) => c.startsWith("gp_recovery_grant=") && !c.includes("Max-Age=0"),
      ),
  );
});
