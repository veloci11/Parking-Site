import { after, test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { handleAuthOAuth } from "../src/server/auth-oauth";
import {
  createOAuthIntent,
  signOAuthIntent,
  verifyOAuthIntent,
} from "../src/server/auth-oauth-intent";

// Real Supabase SSR SDK, strict in-memory HTTP transport: no provider/account/email.
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
const origin = "https://parking-oauth.test",
  service = "https://gp-oauth-fixture.supabase.co";
const secret = "qa-oauth-flow-secret-not-production".repeat(2);
Object.assign(process.env, {
  GP_FORCE_LOCAL_DEMO: "false",
  NEXT_PUBLIC_SUPABASE_URL: service,
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_test_only",
  NEXT_PUBLIC_SITE_URL: origin,
  GP_AUTH_FLOW_SECRET: secret,
});
const originalFetch = globalThis.fetch;
after(() => {
  globalThis.fetch = originalFetch;
  for (const key of envKeys)
    if (before[key] === undefined) delete process.env[key];
    else process.env[key] = before[key];
});
const policy = {
  termsVersion: "oauth-qa-terms",
  privacyVersion: "oauth-qa-privacy",
};
const id = randomUUID(),
  sessionId = randomUUID();
const authUser = {
  id,
  aud: "authenticated",
  role: "authenticated",
  email: "private-relay@example.invalid",
  email_confirmed_at: new Date().toISOString(),
  created_at: new Date().toISOString(),
  app_metadata: { provider: "apple" },
  user_metadata: { role: "admin" },
};
const token =
  [
    { alg: "HS256", typ: "JWT" },
    {
      sub: id,
      aud: "authenticated",
      role: "authenticated",
      session_id: sessionId,
      exp: Math.floor(Date.now() / 1000) + 3600,
      iat: Math.floor(Date.now() / 1000),
    },
  ]
    .map((value) => Buffer.from(JSON.stringify(value)).toString("base64url"))
    .join(".") + ".dGVzdA";

function fixture(
  options: {
    providers?: string[];
    settingsFail?: boolean;
    termsFail?: boolean;
    exchangeFail?: boolean;
    status?: string;
    verified?: boolean;
  } = {},
) {
  const calls: { url: URL; method: string; body: Record<string, unknown> }[] =
    [];
  globalThis.fetch = async (input, init) => {
    const url = new URL(
      typeof input === "string"
        ? input
        : input instanceof URL
          ? input
          : input.url,
    );
    assert.equal(url.origin, service, "test must never contact a live service");
    const method = init?.method || "GET",
      body = typeof init?.body === "string" ? JSON.parse(init.body) : {};
    calls.push({ url, method, body });
    if (url.pathname === "/auth/v1/settings")
      return options.settingsFail
        ? new Response("unavailable", { status: 503 })
        : Response.json({
            external: Object.fromEntries(
              (options.providers ?? ["google", "apple"]).map((provider) => [
                provider,
                true,
              ]),
            ),
          });
    if (url.pathname === "/rest/v1/rpc/gp_auth_policy")
      return Response.json(policy);
    if (url.pathname === "/auth/v1/token") {
      assert.equal(url.searchParams.get("grant_type"), "pkce");
      assert.equal(body.auth_code, "test-social-code");
      assert.ok(
        typeof body.code_verifier === "string" &&
          body.code_verifier.length > 30,
        "PKCE verifier is sent only to Auth",
      );
      if (options.exchangeFail)
        return Response.json(
          { code: "flow_state_expired", msg: "private provider detail" },
          { status: 400 },
        );
      return Response.json({
        access_token: token,
        token_type: "bearer",
        expires_in: 3600,
        refresh_token: "test-oauth-refresh",
        user: authUser,
      });
    }
    if (url.pathname === "/auth/v1/user")
      return Response.json({
        ...authUser,
        email_confirmed_at:
          options.verified === false ? null : authUser.email_confirmed_at,
      });
    if (url.pathname === "/rest/v1/profiles")
      return Response.json({ name: "Membre" });
    if (url.pathname === "/rest/v1/app_roles")
      return Response.json({ role: "member" });
    if (url.pathname === "/rest/v1/account_statuses")
      return Response.json({ status: options.status || "active" });
    if (url.pathname === "/rest/v1/rpc/gp_accept_terms")
      return options.termsFail
        ? Response.json(
            { code: "P0001", message: "TERMS_VERSION_CHANGED" },
            { status: 400 },
          )
        : Response.json({ ...policy, accepted: true });
    if (url.pathname === "/auth/v1/logout")
      return new Response(null, { status: 204 });
    throw new Error(`Unmocked OAuth transport ${method} ${url.pathname}`);
  };
  return calls;
}
function request(
  action: string,
  body?: unknown,
  cookie = "",
  requestOrigin = origin,
) {
  return new Request(`${origin}/api/auth/oauth/${action}`, {
    method: body === undefined ? "GET" : "POST",
    headers: {
      origin: requestOrigin,
      cookie,
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
      .map((value) => [
        value.slice(0, value.indexOf("=")),
        value.slice(value.indexOf("=") + 1),
      ]),
  );
  for (const value of response.headers.getSetCookie()) {
    const pair = value.split(";")[0],
      split = pair.indexOf("=");
    if (/Max-Age=0(?:;|$)/.test(value)) jar.delete(pair.slice(0, split));
    else jar.set(pair.slice(0, split), pair.slice(split + 1));
  }
  return [...jar].map(([name, value]) => `${name}=${value}`).join("; ");
}
const startBody = (provider = "google", next = "/compte/messages") => ({
  provider,
  next,
  termsAccepted: true,
  ...policy,
});
async function begin(provider = "google", next = "/compte/messages") {
  const response = await handleAuthOAuth(
    request("start", startBody(provider, next)),
  );
  assert.equal(response.status, 200);
  const payload = await response.json(),
    authorize = new URL(payload.data.url);
  assert.equal(authorize.origin, service);
  assert.equal(authorize.pathname, "/auth/v1/authorize");
  assert.equal(authorize.searchParams.get("provider"), provider);
  assert.equal(authorize.searchParams.get("code_challenge_method"), "s256");
  assert.ok(authorize.searchParams.get("code_challenge"));
  const callback = new URL(authorize.searchParams.get("redirect_to")!);
  assert.equal(callback.origin, origin);
  assert.equal(callback.pathname, "/api/auth/oauth/callback");
  callback.searchParams.set("code", "test-social-code");
  return { response, callback, jar: cookies(response) };
}

test("provider metadata exposes only enabled Google/Apple and fails closed", async () => {
  for (const providers of [
    [],
    ["google"],
    ["apple"],
    ["google", "apple", "github"],
  ]) {
    fixture({ providers });
    const response = await handleAuthOAuth(request("providers"));
    assert.equal(response.status, 200);
    assert.deepEqual(
      (await response.json()).data.providers,
      providers.filter((p) => p !== "github"),
    );
    assert.match(response.headers.get("cache-control")!, /no-store/);
  }
  fixture({ settingsFail: true });
  assert.deepEqual(
    (await (await handleAuthOAuth(request("providers"))).json()).data.providers,
    [],
  );
  delete process.env.GP_AUTH_FLOW_SECRET;
  assert.deepEqual(
    (await (await handleAuthOAuth(request("providers"))).json()).data.providers,
    [],
  );
  process.env.GP_AUTH_FLOW_SECRET = secret;
});

test("OAuth start requires same-origin explicit current consent and an enabled provider", async () => {
  let calls = fixture({ providers: [] });
  assert.equal(
    (await handleAuthOAuth(request("start", startBody()))).status,
    409,
  );
  assert.ok(
    !calls.some((call) => call.url.pathname.includes("gp_auth_policy")),
  );
  calls = fixture();
  for (const body of [
    { ...startBody(), termsAccepted: false },
    { ...startBody(), provider: "github" },
    { ...startBody(), role: "admin" },
  ])
    assert.equal((await handleAuthOAuth(request("start", body))).status, 400);
  assert.equal(
    (
      await handleAuthOAuth(
        request("start", startBody(), "", "https://evil.invalid"),
      )
    ).status,
    403,
  );
  assert.equal(
    (
      await handleAuthOAuth(
        request("start", { ...startBody(), termsVersion: "old" }),
      )
    ).status,
    409,
  );
  assert.ok(!calls.some((call) => call.url.pathname === "/auth/v1/token"));
});

test("Google and Apple use real SDK PKCE, browser-bound consent, protected identity and safe returns", async () => {
  for (const provider of ["google", "apple"]) {
    const calls = fixture();
    const start = await begin(provider);
    assert.match(start.jar, /code-verifier=/);
    assert.match(start.jar, /gp_oauth_intent=/);
    assert.ok(
      start.response.headers
        .getSetCookie()
        .every(
          (value) =>
            value.includes("HttpOnly") &&
            value.includes("SameSite=Lax") &&
            value.includes("Secure"),
        ),
    );
    const response = await handleAuthOAuth(
      new Request(start.callback, { headers: { cookie: start.jar } }),
    );
    assert.equal(response.status, 303);
    assert.equal(response.headers.get("location"), `${origin}/compte/messages`);
    const finalCookies = cookies(response, start.jar);
    assert.match(finalCookies, /sb-.*-auth-token=/);
    assert.doesNotMatch(finalCookies, /gp_oauth_intent|code-verifier/);
    assert.deepEqual(
      calls.find((call) => call.url.pathname.endsWith("gp_accept_terms"))?.body,
      {
        p_terms_version: policy.termsVersion,
        p_privacy_version: policy.privacyVersion,
        p_confirmed: true,
      },
    );
    assert.ok(
      calls.some(
        (call) =>
          call.url.pathname.endsWith("app_roles") && call.method === "GET",
      ),
    );
    assert.ok(
      !calls.some((call) => ["PUT", "PATCH", "DELETE"].includes(call.method)),
      "OAuth must not change profile roles, passwords or accounts",
    );
  }
});

test("an external next cannot become an OAuth open redirect", async () => {
  fixture();
  const start = await begin("google", "https://evil.invalid/steal");
  const response = await handleAuthOAuth(
    new Request(start.callback, { headers: { cookie: start.jar } }),
  );
  assert.equal(response.headers.get("location"), `${origin}/compte`);
});

test("an invalid OAuth callback preserves an existing authenticated session", async () => {
  fixture();
  const start = await begin();
  const success = await handleAuthOAuth(
    new Request(start.callback, { headers: { cookie: start.jar } }),
  );
  const authenticated = cookies(success, start.jar);
  const calls = fixture();
  const invalid = await handleAuthOAuth(
    request(
      "callback?flow=wrong&code=test-social-code",
      undefined,
      authenticated,
    ),
  );
  assert.equal(invalid.status, 303);
  assert.equal(cookies(invalid, authenticated), authenticated);
  assert.ok(
    !calls.some(
      (call) =>
        call.url.pathname === "/auth/v1/token" ||
        call.url.pathname === "/auth/v1/logout",
    ),
  );
});

test("an OAuth callback uses its signed PKCE flow instead of a more recent verifier", async () => {
  const calls = fixture();
  const first = await begin("google");
  const firstIntent = first.jar
    .split("; ")
    .find((part) => part.startsWith("gp_oauth_intent="))!;
  const intent = verifyOAuthIntent(
    firstIntent.slice("gp_oauth_intent=".length),
    secret,
  )!;
  assert.ok(intent.pkceFlowId);
  const storedVerifier = first.jar
    .split("; ")
    .find((part) => part.includes(`-flow-${intent.pkceFlowId}-code-verifier=`))!
    .split("=")
    .slice(1)
    .join("=");
  const expectedVerifier = JSON.parse(
    Buffer.from(
      decodeURIComponent(storedVerifier).slice("base64-".length),
      "base64url",
    ).toString("utf8"),
  );
  const second = await handleAuthOAuth(
    request("start", startBody("apple"), first.jar),
  );
  const combined = cookies(second, first.jar).replace(
    /gp_oauth_intent=[^;]+/,
    firstIntent,
  );
  const response = await handleAuthOAuth(
    new Request(first.callback, { headers: { cookie: combined } }),
  );
  assert.equal(response.headers.get("location"), `${origin}/compte/messages`);
  assert.equal(
    calls.find((call) => call.url.pathname === "/auth/v1/token")?.body
      .code_verifier,
    expectedVerifier,
  );
});

test("callback rejects absent, altered, expired and other-browser intents before code exchange", async () => {
  const calls = fixture();
  const start = await begin();
  const expired = signOAuthIntent(
    createOAuthIntent(
      "google",
      "/deposer",
      policy,
      Date.now() - 11 * 60 * 1000,
    ),
    secret,
  );
  const attempts = [
    "",
    start.jar.replace(/gp_oauth_intent=./, "gp_oauth_intent=x"),
    start.jar.replace(/gp_oauth_intent=[^;]+/, `gp_oauth_intent=${expired}`),
  ];
  for (const cookie of attempts) {
    const response = await handleAuthOAuth(
      new Request(start.callback, { headers: { cookie } }),
    );
    assert.match(response.headers.get("location")!, /authError=oauth/);
    assert.doesNotMatch(cookies(response), /auth-token/);
  }
  const different = await begin();
  const mismatch = await handleAuthOAuth(
    new Request(start.callback, { headers: { cookie: different.jar } }),
  );
  assert.match(mismatch.headers.get("location")!, /authError=oauth/);
  assert.ok(!calls.some((call) => call.url.pathname === "/auth/v1/token"));
});

test("provider cancellation and invalid exchange return a recoverable generic error", async () => {
  let calls = fixture();
  let start = await begin();
  start.callback.searchParams.set("error", "access_denied");
  let response = await handleAuthOAuth(
    new Request(start.callback, { headers: { cookie: start.jar } }),
  );
  assert.match(
    response.headers.get("location")!,
    /authError=oauth&next=%2Fcompte%2Fmessages/,
  );
  assert.ok(!calls.some((call) => call.url.pathname === "/auth/v1/token"));
  calls = fixture({ exchangeFail: true });
  start = await begin();
  response = await handleAuthOAuth(
    new Request(start.callback, { headers: { cookie: start.jar } }),
  );
  assert.match(response.headers.get("location")!, /authError=oauth/);
  assert.doesNotMatch(cookies(response), /auth-token/);
});

test("a changed policy, inactive or unverified account never receives the exchanged session", async () => {
  for (const option of [
    { termsFail: true },
    { status: "suspended" },
    { verified: false },
  ]) {
    const calls = fixture(option),
      start = await begin();
    const response = await handleAuthOAuth(
      new Request(start.callback, { headers: { cookie: start.jar } }),
    );
    assert.match(response.headers.get("location")!, /authError=oauth/);
    assert.doesNotMatch(
      cookies(response, start.jar),
      /auth-token|gp_oauth_intent/,
    );
    assert.ok(calls.some((call) => call.url.pathname === "/auth/v1/logout"));
    if (!option.termsFail)
      assert.ok(
        !calls.some((call) => call.url.pathname.endsWith("gp_accept_terms")),
      );
  }
});

test("signed consent has a separate purpose, expiry and constrained return", () => {
  const intent = createOAuthIntent("apple", "/compte/annonces", policy);
  const signed = signOAuthIntent(intent, secret);
  assert.equal(verifyOAuthIntent(signed, secret)?.next, "/compte/annonces");
  assert.equal(verifyOAuthIntent(signed, "other secret"), null);
  assert.equal(verifyOAuthIntent(signed, secret, intent.expiresAt), null);
  assert.equal(verifyOAuthIntent(signed + ".extra", secret), null);
});
