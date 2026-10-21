import { after, test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { db, personas, resetDbForTests } from "../src/server/db";
import { handleApi } from "../src/server/api";
import { handleParkingRegistry } from "../src/server/parking-registry";
import { sessionCookie } from "../src/server/security";

const dir = mkdtempSync(join(tmpdir(), "gp-registry-"));
process.env.GP_DATABASE_PATH = join(dir, "db.sqlite");
process.env.GP_FORCE_LOCAL_DEMO = "true";
process.env.GP_LOCAL_DEMO = "true";
const origin = "http://127.0.0.1:3000";
async function api(
  path: string,
  method = "GET",
  body?: unknown,
  cookie?: string,
) {
  const handler = /^(admin\/parking-registry|parking-registry|parkings)/.test(
    path,
  )
    ? handleParkingRegistry
    : handleApi;
  const response = await handler(
    new Request(origin + "/api/" + path, {
      method,
      headers: {
        origin,
        "Content-Type": "application/json",
        ...(cookie ? { cookie } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    }),
  );
  return {
    status: response.status,
    ...(await response.json()),
    cache: response.headers.get("Cache-Control"),
  };
}
after(() => {
  resetDbForTests();
  rmSync(dir, { recursive: true, force: true });
});

test("canonical registry requires administered complete links, isolates conflicts and publishes only exact active aliases", async () => {
  db();
  const adminId = randomUUID();
  db()
    .prepare(
      "INSERT INTO users(id,name,email,role,verified,created_at) VALUES(?,?,?,'admin',1,?)",
    )
    .run(
      adminId,
      "Registry QA",
      "registry@test.invalid",
      new Date().toISOString(),
    );
  const admin = sessionCookie(adminId),
    seller = sessionCookie(personas.seller),
    buyer = sessionCookie(personas.buyer),
    moderator = sessionCookie(personas.moderator);
  async function command(value: unknown) {
    const result = await api("admin/parking-registry", "POST", value, admin);
    assert.equal(result.status, 200, JSON.stringify(result));
    return result.data;
  }
  const site = await command({
    action: "create_site",
    publicName: "Parking partagé QA",
    internalReference: "INTERNAL-ONLY",
    exactAddress: "REGISTRY-PRIVATE-ADDRESS",
    coordinates: [4.85, 45.76],
  });
  const siteId = site.id;
  const levelId = (
    await command({
      action: "add_level",
      siteId,
      code: "SS1",
      label: "Sous-sol",
      number: -1,
    })
  ).id;
  async function physical(number: string) {
    return (
      await command({
        action: "add_space",
        levelId,
        number,
        privateLotReference: "PRIVATE-LOT",
        areaM2: 12,
        lengthM: 5,
        widthM: 2.4,
        clearanceM: 2.1,
      })
    ).id;
  }
  const firstSpace = await physical("CANONICAL-PRIVATE-NUMBER"),
    secondSpace = await physical("2"),
    areaSpace = await physical("3");
  const state = (await api("admin/parking-registry", "GET", undefined, admin))
    .data;
  const alias = state.sites[0].publicAlias;
  assert.notEqual(alias, siteId);
  assert.equal(
    (await api("admin/parking-registry", "GET", undefined, seller)).status,
    403,
  );
  assert.equal(
    (
      await api(
        "admin/parking-registry",
        "POST",
        {
          action: "create_site",
          publicName: "Usurpation",
          internalReference: "x",
          sellerId: adminId,
        },
        seller,
      )
    ).status,
    403,
  );
  assert.equal(
    (await api("admin/parking-registry", "GET", undefined, moderator)).status,
    403,
  );
  await command({
    action: "set_contributor",
    siteId,
    userId: personas.buyer,
    scope: "common_reference",
  });
  const mine = await api("parking-registry/mine", "GET", undefined, buyer);
  assert.equal(mine.data.length, 1);
  assert.equal(mine.data[0].levels[0].spaces, undefined);
  assert.equal(mine.data[0].exactAddress, undefined);
  assert.equal(mine.data[0].internalReference, undefined);
  assert.deepEqual(
    (await api("parking-registry/mine", "GET", undefined, seller)).data,
    [],
  );
  assert.equal((await api("parking-registry/mine")).status, 401);

  async function pending(cookie: string, precision = "exact_opt_in") {
    const created = await api("listings", "POST", {}, cookie),
      id = created.data.id,
      unitId = randomUUID();
    const edited = await api(
      "listings/" + id,
      "PATCH",
      {
        version: 1,
        title: "Place physique de recette complète",
        description:
          "Description factuelle de la place et de ses contraintes. ".repeat(4),
        city: "Lyon",
        district: "Test",
        priceCents: 2000000,
        type: "covered",
        spaces: [
          {
            id: unitId,
            number: "",
            level: -1,
            areaM2: 12,
            lengthM: 5,
            widthM: 2.4,
            clearanceM: 2.1,
          },
        ],
        photos: ["/demo/covered.png", "/demo/box.png", "/demo/outdoor.png"],
        locationPrecision: precision,
        coordinates: [4.85, 45.76],
        address: "Adresse choisie par le vendeur",
      },
      cookie,
    );
    assert.equal(edited.status, 200, JSON.stringify(edited));
    assert.equal(
      (
        await api(
          "listings/" + id,
          "PATCH",
          { version: 2, locationConfirmedAt: new Date().toISOString() },
          cookie,
        )
      ).status,
      200,
    );
    const submitted = await api(
      "listings/" + id + "/submit",
      "POST",
      { version: 3, ownershipAttested: true },
      cookie,
    );
    assert.equal(submitted.status, 200, JSON.stringify(submitted));
    return { id, unitId, version: submitted.data.version };
  }
  const first = await pending(seller);
  assert.equal(
    (await api("listings/" + first.id + "?draft=1", "GET", undefined, buyer))
      .status,
    404,
  );
  const missing = await api(
    "admin/revisions/" + first.id + "/decision",
    "POST",
    { version: first.version, decision: "approve" },
    moderator,
  );
  assert.equal(missing.status, 409);
  assert.equal(missing.code, "REGISTRY_LINK_REQUIRED");
  assert.equal((await api("listings/" + first.id)).status, 404);
  const link = (listing: typeof first, spaceId: string) => ({
    action: "link_listing",
    listingId: listing.id,
    version: listing.version,
    siteId,
    units: [{ unitId: listing.unitId, spaceId }],
    reason: "Rapprochement vérifié de la place physique.",
  });
  assert.equal(
    (
      await api(
        "admin/parking-registry",
        "POST",
        { ...link(first, firstSpace), units: [] },
        admin,
      )
    ).status,
    400,
  );
  assert.equal(
    (
      await api(
        "admin/parking-registry",
        "POST",
        { ...link(first, firstSpace), version: 1 },
        admin,
      )
    ).status,
    409,
  );
  first.version = (await command(link(first, firstSpace))).version;
  const approved = await api(
    "admin/revisions/" + first.id + "/decision",
    "POST",
    { version: first.version, decision: "approve" },
    moderator,
  );
  assert.equal(approved.status, 200, JSON.stringify(approved));
  first.version = approved.data.version;
  const duplicate = await pending(seller);
  const sameSeller = await api(
    "admin/parking-registry",
    "POST",
    link(duplicate, firstSpace),
    admin,
  );
  assert.equal(sameSeller.status, 409);
  assert.equal(sameSeller.error.code, "REGISTRY_DUPLICATE_SAME_SELLER");
  const rival = await pending(buyer);
  const conflict = await command(link(rival, firstSpace));
  assert.equal(conflict.status, "conflict");
  assert.equal(JSON.stringify(conflict).includes(first.id), false);
  assert.equal(
    db()
      .prepare("SELECT COUNT(*) n FROM registry_conflicts WHERE listing_id=?")
      .get(rival.id)!.n,
    1,
  );
  assert.equal(
    db()
      .prepare(
        "SELECT COUNT(*) n FROM registry_listing_units WHERE listing_id=?",
      )
      .get(rival.id)!.n,
    0,
  );
  assert.equal(
    (
      await api(
        "admin/parking-registry?listingId=" + first.id,
        "GET",
        undefined,
        buyer,
      )
    ).status,
    403,
  );
  rival.version = (await command(link(rival, secondSpace))).version;
  const rivalApproved = await api(
    "admin/revisions/" + rival.id + "/decision",
    "POST",
    { version: rival.version, decision: "approve" },
    moderator,
  );
  assert.equal(rivalApproved.status, 200);
  const area = await pending(seller, "area");
  area.version = (await command(link(area, areaSpace))).version;
  assert.equal(
    (
      await api(
        "admin/revisions/" + area.id + "/decision",
        "POST",
        { version: area.version, decision: "approve" },
        moderator,
      )
    ).status,
    200,
  );
  assert.equal((await api("parkings?listingId=" + area.id)).status, 404);
  const publicView = await api("parkings/" + alias);
  assert.equal(publicView.status, 200);
  assert.equal(publicView.data.listings.length, 2);
  assert.equal(publicView.data.levels[0].spaces[0].number, "");
  const json = JSON.stringify(publicView.data);
  for (const secret of [
    siteId,
    levelId,
    firstSpace,
    secondSpace,
    areaSpace,
    first.unitId,
    rival.unitId,
    area.id,
    "INTERNAL-ONLY",
    "REGISTRY-PRIVATE-ADDRESS",
    "PRIVATE-LOT",
    "CANONICAL-PRIVATE-NUMBER",
  ])
    assert.equal(json.includes(secret), false, secret);
  assert.equal((await api("parkings/" + siteId)).status, 404);
  assert.ok(publicView.cache.includes("no-store"));
  const paused = await api(
    "listings/" + first.id + "/lifecycle",
    "POST",
    { version: first.version, action: "pause" },
    seller,
  );
  assert.equal(paused.status, 200);
  assert.equal(
    db()
      .prepare(
        "SELECT COUNT(*) n FROM canonical_space_claims WHERE listing_id=?",
      )
      .get(first.id)!.n,
    0,
  );
  assert.equal((await api("parkings?listingId=" + first.id)).status, 404);
  const resumed = await api(
    "listings/" + first.id + "/lifecycle",
    "POST",
    { version: paused.data.version, action: "resume" },
    seller,
  );
  assert.equal(resumed.status, 200, JSON.stringify(resumed));
  assert.equal(
    db()
      .prepare(
        "SELECT COUNT(*) n FROM canonical_space_claims WHERE listing_id=?",
      )
      .get(first.id)!.n,
    1,
  );
  assert.equal((await api("parkings?listingId=" + first.id)).status, 200);
  assert.ok(
    Number(
      db()
        .prepare(
          "SELECT COUNT(*) n FROM registry_identity_history WHERE listing_id=?",
        )
        .get(first.id)!.n,
    ) >= 3,
  );
  const pausedAgain = await api(
    "listings/" + first.id + "/lifecycle",
    "POST",
    { version: resumed.data.version, action: "pause" },
    seller,
  );
  rival.version = rivalApproved.data.version;
  assert.equal((await command(link(rival, firstSpace))).status, "saved");
  const blockedResume = await api(
    "listings/" + first.id + "/lifecycle",
    "POST",
    { version: pausedAgain.data.version, action: "resume" },
    seller,
  );
  assert.equal(blockedResume.status, 200);
  assert.equal(blockedResume.data.status, "changes_requested");
  assert.equal(JSON.stringify(blockedResume.data).includes(rival.id), false);
  assert.equal((await api("listings/" + first.id)).status, 404);
  assert.equal((await api("parkings?listingId=" + first.id)).status, 404);
  assert.equal(
    db()
      .prepare("SELECT listing_id FROM canonical_space_claims WHERE space_id=?")
      .get(firstSpace)!.listing_id,
    rival.id,
  );
  assert.equal(
    (await api("listings/10000000-0000-4000-8000-000000000001")).status,
    200,
    "legacy publication remains readable",
  );
});
