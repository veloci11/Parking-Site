import test from "node:test";
import assert from "node:assert/strict";
import { requireModerationMfa } from "../src/server/moderation-mfa";
import { ApiError } from "../src/server/security";

function authority(policy: unknown, level: string | null = "aal1") {
  const calls: string[] = [];
  const response = { data: policy, error: null as unknown };
  const assurance = {
    data: { currentLevel: level } as { currentLevel: string | null } | null,
    error: null as unknown,
  };
  const client = {
    async rpc(name: "gp_mfa_required", args: Record<string, never>) {
      calls.push(name);
      assert.deepEqual(args, {});
      return response;
    },
    auth: {
      mfa: {
        async getAuthenticatorAssuranceLevel() {
          calls.push("assurance");
          return assurance;
        },
      },
    },
  };
  return { client, response, assurance, calls };
}
const denied = (status: number, code: string) => (error: unknown) =>
  error instanceof ApiError && error.status === status && error.code === code;

test("database-required moderation blocks AAL1 even with absent or false env override", async () => {
  for (const override of [undefined, false]) {
    const fixture = authority(true);
    await assert.rejects(
      requireModerationMfa(fixture.client, override),
      denied(403, "MFA_REQUIRED"),
    );
    assert.deepEqual(fixture.calls, ["gp_mfa_required", "assurance"]);
  }
  const strong = authority(true, "aal2");
  await requireModerationMfa(strong.client);
  assert.deepEqual(strong.calls, ["gp_mfa_required", "assurance"]);
});
test("env can require MFA in addition to DB policy, while explicit optional policy remains supported", async () => {
  const optional = authority(false);
  await requireModerationMfa(optional.client);
  assert.deepEqual(optional.calls, ["gp_mfa_required"]);
  const forced = authority(false);
  await assert.rejects(
    requireModerationMfa(forced.client, true),
    denied(403, "MFA_REQUIRED"),
  );
  forced.assurance.data = { currentLevel: "aal2" };
  await requireModerationMfa(forced.client, true);
});
test("unavailable/malformed private policy and failed assurance never skip the MFA gate", async () => {
  for (const value of [null, undefined, "false", {}, 0]) {
    const fixture = authority(value, "aal2");
    await assert.rejects(
      requireModerationMfa(fixture.client),
      denied(503, "MFA_POLICY_UNAVAILABLE"),
    );
    assert.deepEqual(fixture.calls, ["gp_mfa_required"]);
  }
  const unavailable = authority(false);
  unavailable.response.error = { message: "private RPC unavailable" };
  await assert.rejects(
    requireModerationMfa(unavailable.client),
    denied(503, "MFA_POLICY_UNAVAILABLE"),
  );
  const invalid = authority(true, "aal2");
  invalid.assurance.error = { message: "session verification failed" };
  await assert.rejects(
    requireModerationMfa(invalid.client),
    denied(403, "MFA_REQUIRED"),
  );
  invalid.assurance.error = null;
  invalid.assurance.data = null;
  await assert.rejects(
    requireModerationMfa(invalid.client),
    denied(403, "MFA_REQUIRED"),
  );
});
