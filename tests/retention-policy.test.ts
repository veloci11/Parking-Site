import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import {
  executeRetentionJob,
  retentionPolicy,
  type RetentionAdapter,
} from "../src/server/retention-policy";
const policy = {
  key: "fixture-only",
  version: 1,
  rules: { account: 0, draft: 0, media: 0, source: 0 },
  validated: true,
  operatorReference: "fixture-operator",
  reason: "Only inert fixtures in an isolated test.",
};
test("no default retention period or implicit operator validation exists", () => {
  for (const value of [
    {},
    { ...policy, validated: false },
    { ...policy, rules: { account: 0 } },
    { ...policy, rules: { ...policy.rules, media: -1 } },
    { ...policy, rules: { ...policy.rules, source: 1.5 } },
    { ...policy, rules: { ...policy.rules, extra: 1 } },
  ])
    assert.equal(retentionPolicy.safeParse(value).success, false);
  assert.deepEqual(retentionPolicy.parse(policy).rules, policy.rules);
});
function fixture(kind: "account" | "media" = "account") {
  const job = randomUUID(),
    user = randomUUID(),
    lease = randomUUID();
  const objects = [
    {
      bucket: "private-uploads",
      name: `${user}/one.webp`,
      storageFingerprint: "a".repeat(64),
    },
    {
      bucket: "private-uploads",
      name: `${user}/two.webp`,
      storageFingerprint: "b".repeat(64),
    },
  ];
  let phase = "purging",
    version = 1,
    auth = true;
  const remaining = new Set(objects.map((o) => o.name));
  const events: string[] = [];
  const faults = {
    storage: false,
    database: false,
    auth: false,
    authLies: false,
    checkpoint: false,
    claim: false,
    completion: false,
    malformed: false,
  };
  const adapter: RetentionAdapter = {
    rpc: async (name, args) => {
      events.push(name);
      if (name === "gp_retention_claim") {
        if (faults.claim) throw new Error("RETENTION_POLICY_REQUIRED");
        if (args.p_expected_version !== version)
          throw new Error("VERSION_CONFLICT");
        if (phase === "completed")
          return {
            id: job,
            state: "completed",
            activeSystemErased: true,
            completeErasure: false,
          };
        return {
          id: job,
          kind,
          state: phase,
          userId: user,
          version: ++version,
          leaseToken: lease,
          objects: faults.malformed
            ? [{ bucket: "private-uploads", name: "../outside" }]
            : objects,
        };
      }
      if (name === "gp_retention_checkpoint") {
        if (faults.checkpoint) throw new Error("RETENTION_HOLD");
        return { state: phase, userId: user };
      }
      if (name === "gp_retention_finish_database") {
        if (faults.database || remaining.size)
          throw new Error("STORAGE_REMOVAL_UNPROVEN");
        phase = kind === "account" ? "auth_pending" : "completed";
        return { state: phase, userId: user };
      }
      if (name === "gp_retention_complete") {
        if (auth || faults.completion) throw new Error("AUTH_REMOVAL_UNPROVEN");
        phase = "completed";
        return {
          state: "completed",
          activeSystemErased: true,
          completeErasure: false,
          retainedCategories: [
            "minimal_receipt",
            "audit",
            "backups_external_rotation",
          ],
        };
      }
      if (name === "gp_retention_release") {
        version++;
        return null;
      }
      throw new Error("unexpected operation");
    },
    removeObject: async (_bucket, name) => {
      events.push("storage:" + name);
      if (faults.storage && name.endsWith("two.webp"))
        throw new Error("STORAGE_FAILED");
      remaining.delete(name);
    },
    authUserExists: async () => {
      events.push("auth:read");
      return auth;
    },
    deleteAuthUser: async () => {
      events.push("auth:delete");
      if (faults.auth) throw new Error("AUTH_FAILED");
      if (!faults.authLies) auth = false;
    },
  };
  return {
    adapter,
    job,
    user,
    events,
    faults,
    remaining,
    version: () => version,
    phase: () => phase,
  };
}
test("storage interruption leaves an unclosed job, then retry removes only reviewed objects and proves Auth absence", async () => {
  const f = fixture();
  f.faults.storage = true;
  await assert.rejects(
    executeRetentionJob(f.adapter, f.job, 1),
    /STORAGE_FAILED/,
  );
  assert.equal(f.remaining.size, 1);
  assert.equal(f.phase(), "purging");
  assert.equal(f.events.includes("gp_retention_finish_database"), false);
  assert.equal(f.events.includes("auth:delete"), false);
  assert.ok(f.events.includes("gp_retention_release"));
  f.faults.storage = false;
  const result = await executeRetentionJob(f.adapter, f.job, f.version());
  assert.equal(result.completeErasure, false);
  assert.equal(result.activeSystemErased, true);
  assert.equal(f.remaining.size, 0);
  assert.equal(f.phase(), "completed");
  assert.ok(
    f.events.lastIndexOf("auth:read") <
      f.events.lastIndexOf("gp_retention_complete"),
  );
});
test("Auth failure resumes after database removal without repeating Storage deletion", async () => {
  const f = fixture();
  f.faults.auth = true;
  await assert.rejects(executeRetentionJob(f.adapter, f.job, 1), /AUTH_FAILED/);
  assert.equal(f.phase(), "auth_pending");
  const removed = f.events.filter((x) => x.startsWith("storage:")).length;
  f.faults.auth = false;
  await executeRetentionJob(f.adapter, f.job, f.version());
  assert.equal(
    f.events.filter((x) => x.startsWith("storage:")).length,
    removed,
  );
  assert.equal(
    f.events.filter((x) => x === "gp_retention_finish_database").length,
    1,
  );
  assert.equal(f.phase(), "completed");
});
test("database refuses unverifiable Storage absence and no Auth deletion follows", async () => {
  const f = fixture();
  f.faults.database = true;
  await assert.rejects(
    executeRetentionJob(f.adapter, f.job, 1),
    /STORAGE_REMOVAL_UNPROVEN/,
  );
  assert.equal(f.events.includes("auth:delete"), false);
  assert.equal(f.phase(), "purging");
});
test("successful Auth delete response without actual post-absence cannot complete", async () => {
  const f = fixture();
  f.faults.authLies = true;
  await assert.rejects(
    executeRetentionJob(f.adapter, f.job, 1),
    /AUTH_REMOVAL_UNPROVEN/,
  );
  assert.equal(f.events.includes("gp_retention_complete"), false);
  assert.equal(f.phase(), "auth_pending");
});
test("independent database completion proof can refuse even after Auth adapter reports absence", async () => {
  const f = fixture();
  f.faults.completion = true;
  await assert.rejects(
    executeRetentionJob(f.adapter, f.job, 1),
    /AUTH_REMOVAL_UNPROVEN/,
  );
  assert.equal(f.phase(), "auth_pending");
  f.faults.completion = false;
  await executeRetentionJob(f.adapter, f.job, f.version());
  assert.equal(f.events.filter((x) => x === "auth:delete").length, 1);
});
test("policy absence, active hold and malformed object paths fail closed before destructive APIs", async () => {
  for (const fault of ["claim", "checkpoint", "malformed"] as const) {
    const f = fixture();
    f.faults[fault] = true;
    await assert.rejects(executeRetentionJob(f.adapter, f.job, 1));
    assert.equal(
      f.events.some((x) => x.startsWith("storage:")),
      false,
    );
    assert.equal(f.events.includes("auth:delete"), false);
  }
});
test("orphan media completion never invokes Auth and a completed replay repeats no deletion", async () => {
  const f = fixture("media");
  await executeRetentionJob(f.adapter, f.job, 1);
  assert.equal(f.events.includes("auth:read"), false);
  const removed = f.events.filter((x) => x.startsWith("storage:")).length;
  await executeRetentionJob(f.adapter, f.job, f.version());
  assert.equal(
    f.events.filter((x) => x.startsWith("storage:")).length,
    removed,
  );
});
test("stale job version fails before Storage", async () => {
  const f = fixture();
  await assert.rejects(
    executeRetentionJob(f.adapter, f.job, 8),
    /VERSION_CONFLICT/,
  );
  assert.equal(
    f.events.some((x) => x.startsWith("storage:")),
    false,
  );
});
