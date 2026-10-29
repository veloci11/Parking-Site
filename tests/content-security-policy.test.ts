import { test } from "node:test";
import assert from "node:assert/strict";
import { contentSecurityPolicy } from "../src/lib/content-security-policy";
test("production CSP isolates scripts and private documents while permitting the actual map worker", () => {
  const policy = contentSecurityPolicy("abcdefghijklmnopqrstuv==");
  assert.match(
    policy,
    /script-src 'self' 'nonce-abcdefghijklmnopqrstuv==' 'strict-dynamic'/,
  );
  assert.ok(!policy.includes("'unsafe-eval'"));
  assert.ok(!/script-src[^;]*unsafe-inline/.test(policy));
  assert.match(policy, /connect-src 'self' https:\/\/tiles.openfreemap.org;/);
  assert.match(policy, /worker-src 'self' blob:/);
  assert.match(policy, /object-src 'none'/);
  assert.match(policy, /frame-src 'none'/);
  assert.match(policy, /frame-ancestors 'none'/);
  assert.throws(() => contentSecurityPolicy("attacker; script-src *"));
  assert.throws(() =>
    contentSecurityPolicy(
      "abcdefghijklmnopqrstuv==",
      false,
      "https://user:password@example.test/style",
    ),
  );
  assert.throws(() =>
    contentSecurityPolicy(
      "abcdefghijklmnopqrstuv==",
      false,
      "http://untrusted.test/style",
    ),
  );
});
