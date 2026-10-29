import { test, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { randomUUID } from "node:crypto";
import { db, personas, userDTO, resetDbForTests } from "../src/server/db";
import { sessionCookie, passwordHash } from "../src/server/security";
import {
  handleModelingRequests,
  localDecideModelingRequest,
} from "../src/server/modeling-requests";
import {
  localPrivacyExport,
  handlePrivacyCommands,
} from "../src/server/privacy-commands";
import { getPublicListing } from "../src/server/catalog";
const dir = mkdtempSync(join(tmpdir(), "gp-modeling031-"));
process.env.GP_DATABASE_PATH = join(dir, "modeling.sqlite");
process.env.GP_FORCE_LOCAL_DEMO = "true";
process.env.GP_LOCAL_DEMO = "true";
after(() => {
  resetDbForTests();
  rmSync(dir, { recursive: true, force: true });
});
const id = "10000000-0000-4000-8000-000000000002",
  otherId = "10000000-0000-4000-8000-000000000003";
const origin = "http://127.0.0.1:3000";
function request(
  path: string,
  method = "GET",
  value?: unknown,
  cookie?: string,
  from = origin,
) {
  return new Request(origin + "/api/" + path, {
    method,
    headers: {
      origin: from,
      "Content-Type": "application/json",
      ...(cookie ? { cookie } : {}),
    },
    body: value === undefined ? undefined : JSON.stringify(value),
  });
}
async function own(
  listingId: string,
  method = "GET",
  value?: unknown,
  cookie?: string,
  from = origin,
) {
  const r = await handleModelingRequests(
    request(
      `listings/${listingId}/modeling-request`,
      method,
      value,
      cookie,
      from,
    ),
    listingId,
  );
  return { status: r.status, headers: r.headers, ...(await r.json()) };
}
async function admin(
  method = "GET",
  value?: unknown,
  cookie?: string,
  query = "",
) {
  const r = await handleModelingRequests(
    request("admin/modeling-requests" + query, method, value, cookie),
  );
  return { status: r.status, ...(await r.json()) };
}
const actor = (id: string) =>
  userDTO(db().prepare("SELECT * FROM users WHERE id=?").get(id)!);
function freshOwner(verified = true) {
  const user = randomUUID(),
    listingId = randomUUID(),
    date = new Date().toISOString(),
    password = "Fictitious-modeling-only-031!";
  db()
    .prepare(
      "INSERT INTO users(id,name,email,password,role,verified,created_at) VALUES(?,?,?,?,'member',?,?)",
    )
    .run(
      user,
      "Modeling owner fixture",
      user + "@test.invalid",
      passwordHash(password),
      verified ? 1 : 0,
      date,
    );
  const value = {
    ...JSON.parse(
      String(
        db().prepare("SELECT draft_json FROM listings WHERE id=?").get(id)!
          .draft_json,
      ),
    ),
    id: listingId,
    status: "draft",
    version: 1,
  };
  db()
    .prepare(
      "INSERT INTO listings(id,seller_id,draft_json,status,created_at,updated_at) VALUES(?,?,?,'draft',?,?)",
    )
    .run(listingId, user, JSON.stringify(value), date, date);
  return { user, listingId, password };
}
let ownerCookie: string, adminCookie: string;
test("manual request is owner-only, bounded and idempotent without note/status attribution from the client", async () => {
  db();
  ownerCookie = sessionCookie(personas.seller);
  adminCookie = sessionCookie(personas.admin);
  const buyer = sessionCookie(personas.buyer);
  assert.equal((await own(id)).status, 401);
  assert.equal((await own(id, "GET", undefined, buyer)).status, 404);
  assert.equal(
    (await own(id, "POST", { note: "Plan tiers" }, buyer)).status,
    404,
  );
  assert.equal((await own(id, "GET", undefined, ownerCookie)).data, null);
  const unverified = freshOwner(false);
  assert.equal(
    (
      await own(
        unverified.listingId,
        "POST",
        {},
        sessionCookie(unverified.user),
      )
    ).code,
    "EMAIL_UNVERIFIED",
  );
  for (const value of [
    { note: "x".repeat(2001) },
    { note: "Plans", status: "ready" },
    { ownerId: personas.buyer },
    { actorId: personas.admin },
    { note: 31 },
  ])
    assert.equal((await own(id, "POST", value, ownerCookie)).status, 400);
  assert.equal(
    (
      await own(
        id,
        "POST",
        { note: "Plans" },
        ownerCookie,
        "https://outside.invalid",
      )
    ).status,
    403,
  );
  const initial = await own(
    id,
    "POST",
    { note: "  Plans privés à discuter avec l’opérateur.  " },
    ownerCookie,
  );
  assert.equal(initial.status, 200);
  assert.equal(initial.data.status, "requested");
  assert.equal(initial.data.note, "Plans privés à discuter avec l’opérateur.");
  assert.equal(initial.data.version, 1);
  assert.equal(initial.headers.get("Cache-Control"), "private, no-store");
  assert.equal(initial.data.actorId, undefined);
  assert.equal(initial.data.ownerId, undefined);
  const replay = await own(
    id,
    "POST",
    { note: "Replacement must not overwrite the initial request" },
    ownerCookie,
  );
  assert.deepEqual(replay.data, initial.data);
  assert.equal(
    db()
      .prepare(
        "SELECT count(*) n FROM audit WHERE action='modeling.requested' AND target_id=?",
      )
      .get(id)!.n,
    1,
  );
});
test("admin queue is role-protected, paginated and versioned; ready never creates a source, publishes a scene or mutates the listing", async () => {
  const moderator = sessionCookie(personas.moderator);
  assert.equal((await admin("GET", undefined, ownerCookie)).status, 403);
  assert.equal((await admin("GET", undefined, moderator)).status, 403);
  assert.equal(
    (await admin("GET", undefined, adminCookie, "?limit=101")).status,
    400,
  );
  assert.equal(
    (await admin("GET", undefined, adminCookie, "?status=generated")).status,
    400,
  );
  await own(otherId, "POST", { note: "Second private request" }, ownerCookie);
  const first = await admin("GET", undefined, adminCookie, "?limit=1");
  assert.equal(first.data.total, 2);
  assert.equal(first.data.requests.length, 1);
  assert.equal(first.data.hasMore, true);
  assert.equal(first.data.requests[0].ownerId, personas.seller);
  assert.equal(first.data.requests[0].ownerName, actor(personas.seller).name);
  assert.equal(first.data.requests[0].email, undefined);
  const page2 = await admin("GET", undefined, adminCookie, "?limit=1&offset=1");
  assert.equal(page2.data.requests.length, 1);
  assert.notEqual(
    page2.data.requests[0].listingId,
    first.data.requests[0].listingId,
  );
  assert.equal(page2.data.hasMore, false);
  assert.equal(
    (
      await admin(
        "PATCH",
        {
          listingId: id,
          status: "in_progress",
          version: 1,
          note: "Do not overwrite",
        },
        adminCookie,
      )
    ).status,
    400,
  );
  getPublicListing(id);
  const publication = db()
    .prepare("SELECT draft_json,public_json,version FROM listings WHERE id=?")
    .get(id)!;
  const outbox = db().prepare("SELECT count(*) n FROM outbox").get()!.n;
  const sources = db().prepare("SELECT count(*) n FROM scene_sources").get()!.n,
    scenes = db().prepare("SELECT count(*) n FROM scene_models").get()!.n;
  const progress = await admin(
    "PATCH",
    { listingId: id, status: "in_progress", version: 1 },
    adminCookie,
  );
  assert.equal(progress.status, 200);
  assert.equal(progress.data.version, 2);
  assert.equal(
    (
      await admin(
        "PATCH",
        { listingId: id, status: "ready", version: 1 },
        adminCookie,
      )
    ).code,
    "VERSION_CONFLICT",
  );
  const ready = await admin(
    "PATCH",
    { listingId: id, status: "ready", version: 2 },
    adminCookie,
  );
  assert.equal(ready.data.version, 3);
  assert.equal(ready.data.status, "ready");
  assert.equal(
    (await own(id, "POST", { note: "retry" }, ownerCookie)).data.status,
    "ready",
  );
  assert.equal(
    db()
      .prepare(
        "SELECT actor_id FROM parking_modeling_requests WHERE listing_id=?",
      )
      .get(id)!.actor_id,
    personas.admin,
  );
  assert.deepEqual(
    db()
      .prepare("SELECT draft_json,public_json,version FROM listings WHERE id=?")
      .get(id),
    publication,
  );
  assert.equal(db().prepare("SELECT count(*) n FROM outbox").get()!.n, outbox);
  assert.equal(
    db().prepare("SELECT count(*) n FROM scene_sources").get()!.n,
    sources,
  );
  assert.equal(
    db().prepare("SELECT count(*) n FROM scene_models").get()!.n,
    scenes,
  );
  assert.equal(getPublicListing(id)!.sceneAvailable, false);
  assert.ok(!JSON.stringify(getPublicListing(id)).includes("Plans privés"));
  const filtered = await admin("GET", undefined, adminCookie, "?status=ready");
  assert.equal(filtered.data.total, 1);
  assert.equal(filtered.data.requests[0].listingId, id);
});
test("own modeling data is exported without staff attribution and purged by a confirmed account deletion", async () => {
  const extra = freshOwner();
  const cookie = sessionCookie(extra.user);
  await own(
    extra.listingId,
    "POST",
    { note: "Private request belonging to another account" },
    cookie,
  );
  const exported = localPrivacyExport(actor(extra.user));
  assert.equal(exported.modelingRequests.length, 1);
  assert.equal(exported.modelingRequests[0].listingId, extra.listingId);
  assert.equal(exported.modelingRequests[0].actor_id, undefined);
  assert.ok(
    !JSON.stringify(exported.modelingRequests).includes("Plans privés"),
  );
  const sellerExport = localPrivacyExport(actor(personas.seller));
  assert.equal(sellerExport.modelingRequests.length, 2);
  assert.ok(
    !JSON.stringify(sellerExport.modelingRequests).includes("another account"),
  );
  const deletion = await handlePrivacyCommands(
    request(
      "privacy/delete",
      "POST",
      { password: extra.password, confirmation: "SUPPRIMER" },
      cookie,
    ),
  );
  assert.equal(deletion.status, 201);
  assert.equal(
    db()
      .prepare(
        "SELECT count(*) n FROM parking_modeling_requests WHERE owner_id=?",
      )
      .get(extra.user)!.n,
    0,
  );
  assert.equal(
    db()
      .prepare(
        "SELECT count(*) n FROM parking_modeling_requests WHERE owner_id=?",
      )
      .get(personas.seller)!.n,
    2,
  );
  assert.equal(
    (await own(extra.listingId, "GET", undefined, cookie)).status,
    401,
  );
});
test("request persists across database reopen; listing cleanup cascades and staff deletion only clears attribution", async () => {
  resetDbForTests();
  assert.equal(
    (await own(id, "GET", undefined, ownerCookie)).data.status,
    "ready",
  );
  const fresh = freshOwner();
  const cookie = sessionCookie(fresh.user);
  await own(
    fresh.listingId,
    "POST",
    { note: "Disposable listing request" },
    cookie,
  );
  db().prepare("DELETE FROM listings WHERE id=?").run(fresh.listingId);
  assert.equal(
    db()
      .prepare(
        "SELECT count(*) n FROM parking_modeling_requests WHERE listing_id=?",
      )
      .get(fresh.listingId)!.n,
    0,
  );
  const staff = randomUUID();
  db()
    .prepare(
      "INSERT INTO users(id,name,email,role,verified,created_at) VALUES(?,?,?,'admin',1,?)",
    )
    .run(
      staff,
      "Temporary staff fixture",
      staff + "@test.invalid",
      new Date().toISOString(),
    );
  localDecideModelingRequest(actor(staff), {
    listingId: otherId,
    status: "declined",
    version: 1,
  });
  db().prepare("DELETE FROM users WHERE id=?").run(staff);
  const retained = db()
    .prepare(
      "SELECT note,status,actor_id FROM parking_modeling_requests WHERE listing_id=?",
    )
    .get(otherId)!;
  assert.equal(retained.note, "Second private request");
  assert.equal(retained.status, "declined");
  assert.equal(retained.actor_id, null);
});
