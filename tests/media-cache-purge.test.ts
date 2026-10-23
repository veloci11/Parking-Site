import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import {
  executeMediaCachePurge,
  mediaCacheDigest,
  MediaCachePurgeError,
  prepareMediaCachePurge,
  type MediaCachePurgeAdapter,
  type MediaCachePurgeSnapshot,
} from "../src/server/media-cache-purge";
import {
  mediaOperatorConfiguration,
  mediaPurgeOutcome,
} from "../scripts/purge-public-media-cache";

const projectFingerprint = mediaCacheDigest("inert-project-reference");
const reason = "Operator reviewed withdrawal and residual CDN exposure.";
function fixture(count = 2) {
  const id = randomUUID(),
    owner = randomUUID();
  const snapshot: MediaCachePurgeSnapshot = {
    listing: {
      id,
      seller_id: owner,
      lifecycle_state: "withdrawn",
      row_version: 3,
      updated_at: "2026-10-22T10:00:00Z",
    },
    published: false,
    media: Array.from({ length: count }, () => {
      const mediaId = randomUUID();
      return {
        id: mediaId,
        owner_id: owner,
        listing_id: id,
        object_key: `${owner}/${id}/${mediaId}.webp`,
        mime: "image/webp" as const,
      };
    }),
  };
  const events: string[] = [],
    consumed = new Set<string>();
  let reads = 0;
  const faults = {
    published: false,
    unknown: false,
    failRead: false,
    changedRead: 0,
    publishRead: 0,
    outcome: "queued" as "queued" | "unsupported" | "forbidden" | "failed",
    throwPurge: false,
  };
  const adapter: MediaCachePurgeAdapter = {
    readSnapshot: async () => {
      events.push("read");
      reads++;
      if (faults.failRead) throw new Error("sensitive upstream URL and token");
      const value = structuredClone(snapshot);
      if (reads === faults.changedRead) value.listing.row_version++;
      if (faults.unknown) return { ...value, listing: null };
      if (faults.published || reads === faults.publishRead)
        return { ...value, published: true };
      return value;
    },
    consumePlan: async (hash, executionReason) => {
      assert.equal(executionReason, reason);
      if (consumed.has(hash)) throw new Error("already used");
      consumed.add(hash);
      events.push("consume");
    },
    purgeObject: async (bucket, name) => {
      assert.equal(bucket, "public-approved");
      assert.match(name, /^[a-f0-9-]{36}\.webp$/);
      assert.ok(snapshot.media.some((m) => `${m.id}.webp` === name));
      assert.equal(events.at(-1), "read");
      events.push(`purge:${name}`);
      if (faults.throwPurge)
        throw new Error("https://private.invalid?token=secret");
      return faults.outcome;
    },
  };
  const prepare = () => prepareMediaCachePurge(adapter, id, projectFingerprint);
  const execute = async (
    prepared: Awaited<ReturnType<typeof prepare>>,
    overrides = {},
  ) =>
    executeMediaCachePurge(adapter, prepared.plan, {
      execute: true,
      expectedHash: prepared.planHash,
      reason,
      projectFingerprint,
      ...overrides,
    });
  return { id, snapshot, events, faults, adapter, prepare, execute };
}
const codeIs =
  (code: string, count = 0) =>
  (error: unknown) =>
    error instanceof MediaCachePurgeError &&
    error.code === code &&
    error.queuedCount === count;

test("default plan and dry-run perform reads only, with no purge or consumed receipt", async () => {
  const f = fixture(),
    prepared = await f.prepare();
  const report = await executeMediaCachePurge(f.adapter, prepared.plan, {
    projectFingerprint,
  });
  assert.deepEqual(f.events, ["read"]);
  assert.equal(report.dryRun, true);
  assert.equal(report.queuedCount, 0);
  assert.equal(report.globallyRevoked, false);
});
test("execution purges only exact public-approved IDs with a preflight before every object", async () => {
  const f = fixture(),
    prepared = await f.prepare(),
    report = await f.execute(prepared);
  assert.equal(report.queuedCount, 2);
  assert.equal(report.globallyRevoked, false);
  assert.deepEqual(
    f.events.map((event) => event.split(":")[0]),
    ["read", "read", "consume", "read", "purge", "read", "purge"],
  );
  assert.equal("status" in report && report.status, "invalidation_queued");
});
test("execute requires the reviewed hash, nonempty reason and matching project", async () => {
  for (const [overrides, code] of [
    [{ expectedHash: undefined }, "REVIEWED_PLAN_HASH_REQUIRED"],
    [{ expectedHash: "f".repeat(64) }, "REVIEWED_PLAN_HASH_REQUIRED"],
    [{ reason: undefined }, "EXECUTION_REASON_REQUIRED"],
    [{ reason: "too short" }, "EXECUTION_REASON_REQUIRED"],
    [{ reason: `${reason}\nunsafe` }, "EXECUTION_REASON_REQUIRED"],
    [{ projectFingerprint: "f".repeat(64) }, "PROJECT_MISMATCH"],
  ] as const) {
    const f = fixture(),
      prepared = await f.prepare();
    await assert.rejects(f.execute(prepared, overrides), codeIs(code));
    assert.deepEqual(f.events, ["read"]);
  }
});
test("published and unknown listings cannot be planned", async () => {
  const a = fixture();
  a.faults.published = true;
  await assert.rejects(a.prepare(), codeIs("LISTING_STILL_PUBLISHED"));
  const b = fixture();
  b.faults.unknown = true;
  await assert.rejects(b.prepare(), codeIs("LISTING_NOT_FOUND"));
  const c = fixture();
  c.snapshot.listing.lifecycle_state = "published";
  await assert.rejects(c.prepare(), codeIs("WITHDRAWN_LISTING_REQUIRED"));
});
test("publication or version changes stop before the next purge, preserving acknowledged count", async () => {
  const before = fixture(),
    beforePlan = await before.prepare();
  before.faults.publishRead = 2;
  await assert.rejects(
    before.execute(beforePlan),
    codeIs("LISTING_STILL_PUBLISHED"),
  );
  assert.equal(before.events.includes("consume"), false);
  const during = fixture(),
    duringPlan = await during.prepare();
  during.faults.changedRead = 4;
  await assert.rejects(
    during.execute(duringPlan),
    codeIs("PLAN_STATE_CHANGED", 1),
  );
  assert.equal(
    during.events.filter((event) => event.startsWith("purge:")).length,
    1,
  );
});
test("unsafe IDs, paths, ownership, MIME and private bucket metadata are rejected", async () => {
  for (const mutate of [
    (f: ReturnType<typeof fixture>) => {
      f.snapshot.media[0].id = "../source";
    },
    (f: ReturnType<typeof fixture>) => {
      f.snapshot.media[0].object_key = "scene-sources/a.pdf";
    },
    (f: ReturnType<typeof fixture>) => {
      f.snapshot.media[0].object_key = "private-exports/a.zip";
    },
    (f: ReturnType<typeof fixture>) => {
      f.snapshot.media[0].listing_id = randomUUID();
    },
    (f: ReturnType<typeof fixture>) => {
      f.snapshot.media[0].owner_id = randomUUID();
    },
    (f: ReturnType<typeof fixture>) => {
      Object.assign(f.snapshot.media[0], { mime: "application/pdf" });
    },
    (f: ReturnType<typeof fixture>) => {
      Object.assign(f.snapshot.media[0], { bucket: "private-uploads" });
    },
    (f: ReturnType<typeof fixture>) => {
      f.snapshot.media.push(f.snapshot.media[0]);
    },
  ]) {
    const f = fixture();
    mutate(f);
    await assert.rejects(
      f.prepare(),
      (error: unknown) => error instanceof MediaCachePurgeError,
    );
    assert.equal(
      f.events.some((event) => event.startsWith("purge:")),
      false,
    );
  }
  const f = fixture();
  await assert.rejects(
    prepareMediaCachePurge(f.adapter, "not-a-uuid", projectFingerprint),
    codeIs("INVALID_LISTING_ID"),
  );
  assert.deepEqual(f.events, []);
});
test("execution is bounded by the current 120-media aggregate limit, with no empty plan", async () => {
  const full = fixture(120);
  assert.equal((await full.prepare()).plan.snapshot.media.length, 120);
  for (const count of [0, 121]) {
    const f = fixture(count);
    await assert.rejects(
      f.prepare(),
      codeIs("UNSAFE_OR_INCOMPLETE_MEDIA_SNAPSHOT"),
    );
  }
});
test("unsupported SDK/endpoint and forbidden plan stop without any deletion fallback", async () => {
  for (const [outcome, code] of [
    ["unsupported", "CDN_PURGE_UNSUPPORTED"],
    ["forbidden", "CDN_PURGE_FORBIDDEN_CHECK_SECRET_AND_PLAN"],
    ["failed", "CDN_PURGE_ACKNOWLEDGEMENT_UNCONFIRMED"],
  ] as const) {
    const f = fixture(),
      prepared = await f.prepare();
    f.faults.outcome = outcome;
    await assert.rejects(f.execute(prepared), codeIs(code));
    assert.equal(
      f.events.filter((event) => event.startsWith("purge:")).length,
      1,
    );
    await assert.rejects(
      f.execute(prepared),
      codeIs("PLAN_ALREADY_USED_OR_RECEIPT_UNAVAILABLE"),
    );
  }
});
test("retry requires a new dry-run/hash and the execution reason again", async () => {
  const f = fixture(),
    first = await f.prepare();
  f.faults.throwPurge = true;
  await assert.rejects(
    f.execute(first),
    codeIs("CDN_PURGE_ACKNOWLEDGEMENT_UNCONFIRMED"),
  );
  await assert.rejects(
    f.execute(first),
    codeIs("PLAN_ALREADY_USED_OR_RECEIPT_UNAVAILABLE"),
  );
  const second = await f.prepare();
  assert.notEqual(second.planHash, first.planHash);
  await assert.rejects(
    f.execute(second, { reason: undefined }),
    codeIs("EXECUTION_REASON_REQUIRED"),
  );
  f.faults.throwPurge = false;
  assert.equal((await f.execute(second)).queuedCount, 2);
});
test("raw network errors never leak their URL/token through workflow errors", async () => {
  const f = fixture(),
    prepared = await f.prepare();
  f.faults.throwPurge = true;
  await assert.rejects(f.execute(prepared), (error: unknown) => {
    assert.ok(error instanceof MediaCachePurgeError);
    assert.doesNotMatch(
      JSON.stringify(error),
      /private\.invalid|token=|secret/,
    );
    return true;
  });
  const read = fixture();
  read.faults.failRead = true;
  await assert.rejects(read.prepare(), codeIs("PREFLIGHT_READ_FAILED"));
});
test("operator configuration never falls back to browser keys or accepts a URL with credentials", () => {
  const key = `sb_secret_${"x".repeat(32)}`;
  for (const env of [
    {
      NEXT_PUBLIC_SUPABASE_URL: "https://inert.invalid",
      NEXT_PUBLIC_SUPABASE_ANON_KEY: key,
    },
    {
      GP_MEDIA_OPERATOR_SUPABASE_URL: "https://inert.invalid",
      GP_MEDIA_OPERATOR_SECRET_KEY: "legacy.jwt",
    },
    {
      GP_MEDIA_OPERATOR_SUPABASE_URL: "https://user:password@inert.invalid",
      GP_MEDIA_OPERATOR_SECRET_KEY: key,
    },
    {
      GP_MEDIA_OPERATOR_SUPABASE_URL: "https://inert.invalid?token=secret",
      GP_MEDIA_OPERATOR_SECRET_KEY: key,
    },
    {
      GP_MEDIA_OPERATOR_SUPABASE_URL: "http://inert.invalid",
      GP_MEDIA_OPERATOR_SECRET_KEY: key,
    },
  ])
    assert.throws(() => mediaOperatorConfiguration(env));
  const valid = mediaOperatorConfiguration({
    GP_MEDIA_OPERATOR_SUPABASE_URL: "https://inert.invalid/",
    GP_MEDIA_OPERATOR_SECRET_KEY: key,
  });
  assert.equal(
    valid.projectFingerprint,
    mediaCacheDigest("https://inert.invalid"),
  );
});
test("SDK errors use HTTP status even when statusCode contains a textual error code", () => {
  assert.equal(
    mediaPurgeOutcome({
      data: null,
      error: { status: 403, statusCode: "AccessDenied" },
    }),
    "forbidden",
  );
  assert.equal(
    mediaPurgeOutcome({ data: null, error: { statusCode: "401" } }),
    "forbidden",
  );
  assert.equal(
    mediaPurgeOutcome({ data: null, error: { status: 501 } }),
    "unsupported",
  );
  assert.equal(
    mediaPurgeOutcome({ data: null, error: { status: 503 } }),
    "failed",
  );
  assert.equal(mediaPurgeOutcome({ data: null, error: null }), "failed");
  assert.equal(
    mediaPurgeOutcome({ data: { message: "success" }, error: null }),
    "queued",
  );
});
