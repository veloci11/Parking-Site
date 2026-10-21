import { test } from "node:test";
import assert from "node:assert/strict";
import {
  qaTotp,
  QaStrongSession,
  qaInventoryMatchesUsers,
} from "../scripts/qa-publication-contract";

test("QA inventory never adopts empty or previous fixture identities", () => {
  assert.equal(
    qaInventoryMatchesUsers({ userIds: ["previous"] }, ["current"]),
    false,
  );
  assert.equal(qaInventoryMatchesUsers({ userIds: [] }, ["current"]), false);
  assert.equal(qaInventoryMatchesUsers(null, ["current"]), false);
  assert.equal(
    qaInventoryMatchesUsers({ userIds: ["current"] }, ["current", "other"]),
    true,
  );
});

test("QA TOTP matches RFC 6238 SHA1 vectors, including 64-bit counters", () => {
  const secret = "GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ";
  for (const [seconds, expected] of [
    [59, "94287082"],
    [1111111109, "07081804"],
    [1111111111, "14050471"],
    [1234567890, "89005924"],
    [2000000000, "69279037"],
    [20000000000, "65353130"],
  ] as const)
    assert.equal(qaTotp(secret, seconds * 1000, 8), expected);
  assert.throws(() => qaTotp("a private secret"), /private_encoding/);
});

test("QA strong helper preserves an existing AAL2 session without logging in again", async () => {
  const identity = {
    id: "qa-admin",
    email: "admin@qa.invalid",
    password: "fixture-only",
  };
  const calls: string[] = [];
  const session = new QaStrongSession(
    async (path) => {
      calls.push(path);
      if (path === "session")
        return { status: 200, data: { id: identity.id, role: "admin" } };
      if (path === "mfa")
        return {
          status: 200,
          data: { supported: true, currentLevel: "aal2", factors: [] },
        };
      throw new Error(
        "An established AAL2 session must not be logged in again",
      );
    },
    identity,
    "fixture",
  );
  await session.establish("admin");
  await session.establish("admin");
  await session.cleanup();
  assert.deepEqual(calls, ["session", "mfa", "session", "mfa"]);
});

test("QA strong helper refuses a nonfixture identity before any API call", async () => {
  let contacted = false;
  const session = new QaStrongSession(
    async () => {
      contacted = true;
      return { status: 200, data: null };
    },
    { id: "human", email: "person@example.com", password: "unused" },
    "fixture",
  );
  await assert.rejects(session.establish("admin"), /coordinator-created/);
  assert.equal(contacted, false);
});
