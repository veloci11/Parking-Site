import { test, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import sharp from "sharp";
import { db, personas, resetDbForTests } from "../src/server/db";
import { handleApi } from "../src/server/api";
import { handleEntitlements } from "../src/server/entitlements";
import {
  localConsumeUpload,
  rateLimit,
  sessionCookie,
  ApiError,
} from "../src/server/security";
import {
  localEntitlements,
  localLimits,
} from "../src/server/entitlement-store";
import { DEFAULT_LIMITS } from "../src/lib/entitlements";
const dir = mkdtempSync(join(tmpdir(), "gp-entitlements-"));
process.env.GP_DATABASE_PATH = join(dir, "db.sqlite");
process.env.GP_MEDIA_PATH = join(dir, "media");
process.env.GP_FORCE_LOCAL_DEMO = "true";
process.env.GP_LOCAL_DEMO = "true";
const origin = "http://127.0.0.1:3000";
async function api(
  path: string,
  method = "GET",
  value?: unknown,
  cookie?: string,
) {
  const handler = /^(entitlements|admin\/entitlements)/.test(path)
    ? handleEntitlements
    : handleApi;
  const response = await handler(
    new Request(origin + "/api/" + path, {
      method,
      headers: {
        origin,
        "Content-Type": "application/json",
        ...(cookie ? { cookie } : {}),
      },
      body: value ? JSON.stringify(value) : undefined,
    }),
  );
  return {
    status: response.status,
    ...(await response.json()),
    retryAfter: response.headers.get("Retry-After"),
  };
}
after(() => {
  resetDbForTests();
  rmSync(dir, { recursive: true, force: true });
});
test("own usage is real, bounded administration has no role escalation and overrides expire", async () => {
  db();
  const adminId = randomUUID();
  db()
    .prepare(
      "INSERT INTO users(id,name,email,role,verified,created_at) VALUES(?,?,?,'admin',1,?)",
    )
    .run(
      adminId,
      "QA Admin",
      "quota-admin@test.invalid",
      new Date().toISOString(),
    );
  const admin = sessionCookie(adminId),
    seller = sessionCookie(personas.seller),
    buyer = sessionCookie(personas.buyer);
  assert.equal((await api("entitlements")).status, 401);
  const own = await api("entitlements", "GET", undefined, seller);
  assert.equal(own.status, 200);
  assert.equal(own.data.usage.activeListings.used, 6);
  assert.equal(own.data.usage.activeListings.remaining, 4);
  assert.deepEqual(own.data.limits, DEFAULT_LIMITS);
  assert.equal(own.data.billingEnabled, false);
  assert.equal(
    (await api("admin/entitlements", "GET", undefined, seller)).status,
    403,
  );
  const free = await api(
    "admin/entitlements",
    "POST",
    {
      action: "set_free_limits",
      version: 1,
      limits: { ...DEFAULT_LIMITS, draftsPerDay: 1 },
      reason: "Limite ajustée pour la recette isolée.",
    },
    admin,
  );
  assert.equal(free.status, 200);
  assert.equal(free.data.freePlan.version, 2);
  assert.equal((await api("listings", "POST", {}, buyer)).status, 201);
  const blockedDraft = await api("listings", "POST", {}, buyer);
  assert.equal(blockedDraft.status, 429);
  assert.ok(Number(blockedDraft.retryAfter) > 3600);
  const usage = await api("entitlements", "GET", undefined, buyer);
  assert.equal(usage.data.usage.drafts.used, 1);
  assert.equal(usage.data.usage.drafts.remaining, 0);
  assert.ok(Date.parse(usage.data.usage.drafts.resetsAt) > Date.now());
  assert.equal(
    (
      await api(
        "admin/entitlements",
        "POST",
        {
          action: "set_free_limits",
          version: 1,
          limits: DEFAULT_LIMITS,
          reason: "Version périmée pour la recette isolée.",
        },
        admin,
      )
    ).status,
    409,
  );
  const override = {
    action: "set_user_override",
    userId: personas.buyer,
    version: 0,
    limits: { draftsPerDay: 2, uploadBytesPerDay: 100 },
    expiresAt: new Date(Date.now() + 86400000).toISOString(),
    reason: "Dérogation temporaire de recette motivée.",
  };
  assert.equal(
    (
      await api(
        "admin/entitlements",
        "POST",
        { ...override, role: "admin" },
        admin,
      )
    ).status,
    400,
  );
  assert.equal(
    (
      await api(
        "admin/entitlements",
        "POST",
        {
          ...override,
          expiresAt: new Date(Date.now() + 91 * 86400000).toISOString(),
        },
        admin,
      )
    ).status,
    400,
  );
  const changed = await api("admin/entitlements", "POST", override, admin);
  assert.equal(changed.status, 200);
  assert.equal(changed.data.user.override.version, 1);
  assert.equal(changed.data.user.usage.drafts.remaining, 1);
  assert.equal((await api("listings", "POST", {}, buyer)).status, 201);
  assert.equal(
    db().prepare("SELECT role FROM users WHERE id=?").get(personas.buyer)!.role,
    "member",
  );
  localConsumeUpload(personas.buyer, 60);
  const before = localEntitlements(personas.buyer);
  assert.throws(
    () => localConsumeUpload(personas.buyer, 50),
    (error: unknown) => error instanceof ApiError && error.status === 429,
  );
  const afterBytes = localEntitlements(personas.buyer);
  assert.equal(afterBytes.usage.uploads.used, before.usage.uploads.used);
  assert.equal(afterBytes.usage.uploadBytes.used, 60);
  assert.equal(afterBytes.usage.uploadBytes.remaining, 40);
  assert.equal(
    (
      await api(
        "admin/entitlements",
        "POST",
        {
          ...override,
          version: 1,
          limits: { uploadBytesPerDay: 60 },
        },
        admin,
      )
    ).status,
    200,
  );
  const image = await sharp({
    create: { width: 32, height: 32, channels: 3, background: "#336699" },
  })
    .png()
    .toBuffer();
  const form = new FormData();
  form.set(
    "listingId",
    String(
      db()
        .prepare("SELECT id FROM listings WHERE seller_id=? LIMIT 1")
        .get(personas.buyer)!.id,
    ),
  );
  form.set(
    "file",
    new File([new Uint8Array(image)], "quota.png", { type: "image/png" }),
  );
  const upload = await handleApi(
    new Request(origin + "/api/uploads", {
      method: "POST",
      headers: { origin, cookie: buyer },
      body: form,
    }),
  );
  assert.equal(
    upload.status,
    429,
    "the actual image API enforces the byte cap",
  );
  assert.equal(localEntitlements(personas.buyer).usage.uploads.used, 1);
  db()
    .prepare(
      "UPDATE entitlement_overrides SET starts_at=?,expires_at=? WHERE user_id=?",
    )
    .run(
      new Date(Date.now() - 86400000).toISOString(),
      new Date(Date.now() - 1000).toISOString(),
      personas.buyer,
    );
  assert.equal(localLimits(personas.buyer).limits.draftsPerDay, 1);
  assert.equal(localEntitlements(personas.buyer).override!.active, false);
});
test("message burst and idempotent retries share actual counters and expired windows reset", async () => {
  const buyer = sessionCookie(personas.buyer);
  const convo = await api(
    "conversations",
    "POST",
    { listingId: "10000000-0000-4000-8000-000000000001" },
    buyer,
  );
  assert.equal(convo.status, 201);
  const requests = Array.from({ length: 5 }, () => randomUUID());
  for (const clientRequestId of requests)
    assert.equal(
      (
        await api(
          "conversations/" + convo.data.id + "/messages",
          "POST",
          { body: "Message de recette", clientRequestId },
          buyer,
        )
      ).status,
      201,
    );
  const full = localEntitlements(personas.buyer);
  assert.equal(full.usage.messages.used, 5);
  assert.equal(full.usage.messageBurst.used, 5);
  const retry = await api(
    "conversations/" + convo.data.id + "/messages",
    "POST",
    { body: "Message de recette", clientRequestId: requests[0] },
    buyer,
  );
  assert.equal(retry.status, 200);
  assert.equal(localEntitlements(personas.buyer).usage.messages.used, 5);
  const blocked = await api(
    "conversations/" + convo.data.id + "/messages",
    "POST",
    { body: "Sixième message", clientRequestId: randomUUID() },
    buyer,
  );
  assert.equal(blocked.status, 429);
  assert.ok(Number(blocked.retryAfter) <= 5);
  assert.equal(localEntitlements(personas.buyer).usage.messages.used, 5);
  db()
    .prepare("UPDATE rate_limits SET reset_at=? WHERE bucket=?")
    .run(Date.now() - 1, "message_burst:" + personas.buyer);
  rateLimit("message:" + personas.buyer, 30, 60);
  assert.equal(localEntitlements(personas.buyer).usage.messages.used, 6);
  assert.equal(localEntitlements(personas.buyer).usage.messageBurst.used, 1);
});
