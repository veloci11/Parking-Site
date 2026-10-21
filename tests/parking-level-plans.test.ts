import { after, test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { db, personas, resetDbForTests, userDTO } from "../src/server/db";
import {
  localRegistryCommand,
  localPublicParking,
  localRegistryAdmin,
} from "../src/server/parking-registry";
import { sceneDB } from "../src/server/scenes/local";
import { getLocalPublicScene } from "../src/server/scenes/local";
import { getPublicListing, loadPublicListing } from "../src/server/catalog";
import { parsePageQuery, localCatalogPage } from "../src/server/pagination";
import { handleApi } from "../src/server/api";
import {
  parkingSceneGroup,
  registryCommandSchema,
  type RegistryCommand,
} from "../src/lib/parking-registry";
import type { Listing } from "../src/lib/types";
import type { SceneManifest } from "../src/lib/scene-contract";

const dir = mkdtempSync(join(tmpdir(), "gp-common-floor-"));
process.env.GP_DATABASE_PATH = join(dir, "db.sqlite");
process.env.GP_FORCE_LOCAL_DEMO = "true";
process.env.GP_LOCAL_DEMO = "true";
after(() => {
  resetDbForTests();
  rmSync(dir, { recursive: true, force: true });
});

test("shared demo has only its two related listings, three public units and two honest schematic floors", () => {
  const parking = localPublicParking(
    undefined,
    "10000000-0000-4000-8000-000000000001",
  )!;
  assert.equal(parking.listings.length, 2);
  assert.deepEqual(
    parking.levels.map((l) => l.number),
    [-1, -2],
  );
  const group = parkingSceneGroup(parking);
  assert.deepEqual(
    group.levels.map((l) => [l.spaces.length, l.scene?.manifest.spaces.length]),
    [
      [2, 2],
      [1, 1],
    ],
  );
  assert.ok(
    group.levels.every(
      (l) => l.scene?.isDemo && l.scene.fidelity === "schematic",
    ),
  );
  assert.equal(
    localPublicParking(undefined, "10000000-0000-4000-8000-000000000002"),
    null,
  );
  assert.ok(
    group.levels.every((l) =>
      l.spaces.every((u) =>
        group.listings.some(
          (a) =>
            a.id === u.listingId &&
            a.spaces.some((s) => s.id === u.listingUnitId),
        ),
      ),
    ),
  );
});

test("one administered frame maps every physical unit, filters private offers and withdraws stale/missing-source plans", async () => {
  const sql = db(),
    adminId = randomUUID(),
    now = new Date().toISOString();
  sql
    .prepare(
      "INSERT INTO users(id,name,email,role,verified,created_at) VALUES(?,?,?,'admin',1,?)",
    )
    .run(adminId, "Common Plan QA", "plan@test.invalid", now);
  const actor = userDTO(
    sql.prepare("SELECT * FROM users WHERE id=?").get(adminId)!,
  );
  const command = (c: RegistryCommand) =>
    localRegistryCommand(actor, registryCommandSchema.parse(c));
  const site = command({
    action: "create_site",
    publicName: "Parking commun QA",
    internalReference: "PRIVATE-ONLY",
  }).id!;
  const level1 = command({
    action: "add_level",
    siteId: site,
    code: "SS1",
    label: "Sous-sol 1",
    number: -1,
    sortOrder: 0,
  }).id!;
  const level2 = command({
    action: "add_level",
    siteId: site,
    code: "SS2",
    label: "Sous-sol 2",
    number: -2,
    sortOrder: 1,
  }).id!;
  const physical = (levelId: string) =>
    command({
      action: "add_space",
      levelId,
      number: "PRIVATE-PHYSICAL-NUMBER",
      privateLotReference: "PRIVATE-LOT",
      areaM2: 12,
      lengthM: 5,
      widthM: 2.4,
      clearanceM: 2.1,
    }).id!;
  const ids = [
    physical(level1),
    physical(level1),
    physical(level2),
    physical(level1),
  ];
  const base = JSON.parse(
    String(
      sql
        .prepare("SELECT public_json FROM listings WHERE id=?")
        .get("10000000-0000-4000-8000-000000000001")!.public_json,
    ),
  ) as Listing;
  const make = (
    places: { n: number; p: string }[],
    precision: Listing["locationPrecision"] = "exact_opt_in",
  ) => {
    const id = randomUUID(),
      listing: Listing = {
        ...base,
        id,
        isDemo: false,
        locationPrecision: precision,
        spaces: places.map(({ n }, i) => ({
          ...base.spaces[0],
          id: randomUUID(),
          number: String(i + 20),
          level: n,
        })),
        version: 1,
      };
    sql
      .prepare(
        "INSERT INTO listings(id,seller_id,draft_json,public_json,status,version,created_at,updated_at,published_at) VALUES(?,?,?,?, 'published',1,?,?,?)",
      )
      .run(
        id,
        personas.seller,
        JSON.stringify(listing),
        JSON.stringify(listing),
        now,
        now,
        now,
      );
    command({
      action: "link_listing",
      listingId: id,
      version: 1,
      siteId: site,
      units: listing.spaces.map((u, i) => ({
        unitId: u.id,
        spaceId: places[i].p,
      })),
      reason: "Rapprochement physique indépendant de recette.",
    });
    return listing;
  };
  const first = make([{ n: -1, p: ids[0] }]),
    second = make([
      { n: -1, p: ids[1] },
      { n: -2, p: ids[2] },
    ]),
    privateOffer = make([{ n: -1, p: ids[3] }], "area");
  const scenePage = (cursor?: string) => {
    const q = parsePageQuery(
      new URL(
        `http://127.0.0.1/api/listings?scene=1&ids=${first.id},${second.id}&limit=1${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ""}`,
      ),
    );
    return localCatalogPage(q.filters, q.limit, q.cursor);
  };
  const before = localPublicParking(undefined, first.id)!;
  assert.equal(before.listings.length, 2);
  assert.ok(before.levels.every((l) => l.commonPlan === null));
  assert.equal(localPublicParking(undefined, privateOffer.id), null);
  const evidence = randomUUID(),
    file = join(dir, "inert-source.pdf");
  writeFileSync(file, "Inert controlled fixture, no renderer invoked.");
  sceneDB()
    .prepare(
      "INSERT INTO scene_sources(id,listing_id,owner_id,uploader_id,object_key,mime,byte_size,sha256,created_at,processing_state) VALUES(?,?,?,?,?,'application/pdf',100,?,?,'ready')",
    )
    .run(
      evidence,
      first.id,
      personas.seller,
      personas.seller,
      file,
      "a".repeat(64),
      now,
    );
  const manifest: SceneManifest = {
    schemaVersion: "gp-parametric-1.1",
    unit: "m",
    upAxis: "Y",
    level: -1,
    floor: {
      footprintXZ: [
        [0, 0],
        [20, 0],
        [20, 15],
        [0, 15],
      ],
      thicknessM: 0.2,
    },
    spaces: [ids[0], ids[1], ids[3]].map((id, i) => ({
      spaceId: id,
      displayNumber: "PRIVATE-PHYSICAL-NUMBER",
      footprintXZ: [
        [i * 4 + 1, 1],
        [i * 4 + 3.4, 1],
        [i * 4 + 3.4, 6],
        [i * 4 + 1, 6],
      ],
      dimensions: { lengthM: 5, widthM: 2.4, clearanceM: 2.1 },
      source: "plan_derived",
    })),
    contextSpaces: [],
    obstacles: [],
    observations: [],
    provenance: {
      calibrated: true,
      accuracyM: 0.05,
      controlDistances: [
        { fromXZ: [0, 0], toXZ: [20, 0], measuredM: 20 },
        { fromXZ: [0, 0], toXZ: [0, 15], measuredM: 15 },
      ],
      observedAt: now,
      publicSummary: "Repère commun contrôlé sur document autorisé.",
      geometrySource: "plan_derived",
      geometryEvidenceIds: [evidence],
    },
  };
  const publish: Extract<RegistryCommand, { action: "publish_level_plan" }> = {
    action: "publish_level_plan",
    levelId: level1,
    version: 0,
    manifest,
    evidenceIds: [evidence],
    rightsAttested: true,
    checks: {
      coordinateFrameConfirmed: true,
      mappingChecked: true,
      sourcesChecked: true,
    },
    reason: "Repère unique et toutes les dimensions vérifiés.",
  };
  // An approved individual model must not bypass the group's missing common frame.
  const individual = {
    ...manifest,
    spaces: [
      {
        ...manifest.spaces[0],
        spaceId: first.spaces[0].id,
        displayNumber: first.spaces[0].number,
      },
    ],
  };
  sceneDB()
    .prepare(
      "INSERT INTO scene_models(id,listing_id,owner_id,creator_id,manifest,evidence_ids,state,approved_mapping,reviewed_at,created_at,updated_at) VALUES(?,?,?,?,?,?,'approved',?,?,?,?)",
    )
    .run(
      randomUUID(),
      first.id,
      personas.seller,
      personas.seller,
      JSON.stringify(individual),
      JSON.stringify([evidence]),
      JSON.stringify(first.spaces),
      now,
      now,
      now,
    );
  assert.ok(getLocalPublicScene(first.id));
  assert.equal(getPublicListing(first.id)!.sceneAvailable, false);
  assert.equal(scenePage().total, 0);
  assert.throws(
    () =>
      command({
        ...publish,
        manifest: { ...manifest, spaces: manifest.spaces.slice(0, 2) },
      }),
    /rapprochés/,
  );
  assert.throws(
    () =>
      command({
        ...publish,
        manifest: {
          ...manifest,
          spaces: manifest.spaces.map((s, i) =>
            i === 1 ? { ...s, footprintXZ: manifest.spaces[0].footprintXZ } : s,
          ),
        },
      }),
    /rapprochés/,
  );
  assert.throws(
    () => command({ ...publish, evidenceIds: [randomUUID()] }),
    /Sources prêtes/,
  );
  assert.equal(command(publish).version, 1);
  assert.throws(() => command(publish), /version/);
  const parking = localPublicParking(undefined, first.id)!,
    plan = parking.levels.find((l) => l.number === -1)!.commonPlan!;
  assert.ok(parking.listings.every((l) => l.sceneAvailable));
  assert.equal(getPublicListing(first.id)!.sceneAvailable, true);
  assert.equal((await loadPublicListing(second.id))!.sceneAvailable, true);
  const direct = await handleApi(
    new Request(`http://127.0.0.1:3000/api/listings/${second.id}`),
  );
  assert.equal((await direct.json()).data.sceneAvailable, true);
  const page = scenePage();
  assert.equal(page.total, 2);
  assert.equal(page.items.length, 1);
  assert.ok(page.nextCursor);
  const next = scenePage(page.nextCursor!);
  assert.equal(next.total, 2);
  assert.equal(next.items.length, 1);
  assert.notEqual(page.items[0].id, next.items[0].id);
  assert.equal(plan.manifest.spaces.length, 2);
  assert.equal(parking.levels.find((l) => l.number === -2)!.commonPlan, null);
  const serialized = JSON.stringify(parking);
  for (const secret of [
    ...ids,
    evidence,
    "PRIVATE-PHYSICAL-NUMBER",
    "PRIVATE-LOT",
    file,
  ])
    assert.ok(!serialized.includes(secret), secret);
  assert.ok(
    plan.manifest.spaces.every((u) =>
      parking.levels[0].spaces.some((ref) => ref.id === u.id),
    ),
  );
  assert.equal(parkingSceneGroup(parking).levels[0].spaces.length, 2);
  const state = localRegistryAdmin(first.id).sites.find((s) => s.id === site)!;
  assert.equal(state.levels[0].planVersion, 1);
  sql
    .prepare("UPDATE scene_sources SET processing_state='failed' WHERE id=?")
    .run(evidence);
  assert.equal(
    localPublicParking(undefined, first.id)!.levels[0].commonPlan,
    null,
  );
  assert.equal(scenePage().total, 0);
  sql
    .prepare("UPDATE scene_sources SET processing_state='ready' WHERE id=?")
    .run(evidence);
  assert.equal(
    command({
      action: "withdraw_level_plan",
      levelId: level1,
      version: 1,
      reason: "Retrait du plan commun pour nouvelle vérification.",
    }).version,
    2,
  );
  assert.equal(
    localPublicParking(undefined, second.id)!.levels[0].commonPlan,
    null,
  );
  assert.equal(getPublicListing(first.id)!.sceneAvailable, false);
  assert.equal((await loadPublicListing(second.id))!.sceneAvailable, false);
  assert.equal(scenePage().total, 0);
});

test("an ungrouped approved individual scene remains available only while its source, mapping and consent are valid", () => {
  const sql = db(),
    now = new Date().toISOString(),
    id = randomUUID(),
    unitId = randomUUID(),
    evidence = randomUUID(),
    file = join(dir, "legacy-source.pdf");
  writeFileSync(file, "Controlled inert source fixture.");
  const base = JSON.parse(
    String(
      sql
        .prepare("SELECT public_json FROM listings WHERE id=?")
        .get("10000000-0000-4000-8000-000000000001")!.public_json,
    ),
  ) as Listing;
  const listing: Listing = {
    ...base,
    id,
    isDemo: false,
    spaces: [{ ...base.spaces[0], id: unitId }],
    sceneAvailable: true,
  };
  sql
    .prepare(
      "INSERT INTO listings(id,seller_id,draft_json,public_json,status,version,created_at,updated_at,published_at) VALUES(?,?,?,?, 'published',1,?,?,?)",
    )
    .run(
      id,
      personas.seller,
      JSON.stringify(listing),
      JSON.stringify(listing),
      now,
      now,
      now,
    );
  sceneDB()
    .prepare(
      "INSERT INTO scene_sources(id,listing_id,owner_id,uploader_id,object_key,mime,byte_size,sha256,created_at,processing_state) VALUES(?,?,?,?,?,'application/pdf',100,?,?,'ready')",
    )
    .run(
      evidence,
      id,
      personas.seller,
      personas.seller,
      file,
      "a".repeat(64),
      now,
    );
  const manifest: SceneManifest = {
    schemaVersion: "gp-parametric-1.1",
    unit: "m",
    upAxis: "Y",
    level: -1,
    floor: {
      footprintXZ: [
        [0, 0],
        [10, 0],
        [10, 10],
        [0, 10],
      ],
      thicknessM: 0.2,
    },
    spaces: [
      {
        spaceId: unitId,
        displayNumber: listing.spaces[0].number,
        footprintXZ: [
          [1, 1],
          [3.4, 1],
          [3.4, 6],
          [1, 6],
        ],
        dimensions: { lengthM: 5, widthM: 2.4, clearanceM: 2.1 },
        source: "plan_derived",
      },
    ],
    contextSpaces: [],
    obstacles: [],
    observations: [],
    provenance: {
      calibrated: true,
      accuracyM: 0.05,
      controlDistances: [
        { fromXZ: [0, 0], toXZ: [10, 0], measuredM: 10 },
        { fromXZ: [0, 0], toXZ: [0, 10], measuredM: 10 },
      ],
      observedAt: now,
      publicSummary: "Scène individuelle historique contrôlée.",
      geometrySource: "plan_derived",
      geometryEvidenceIds: [evidence],
    },
  };
  sceneDB()
    .prepare(
      "INSERT INTO scene_models(id,listing_id,owner_id,creator_id,manifest,evidence_ids,state,approved_mapping,reviewed_at,created_at,updated_at) VALUES(?,?,?,?,?,?,'approved',?,?,?,?)",
    )
    .run(
      randomUUID(),
      id,
      personas.seller,
      personas.seller,
      JSON.stringify(manifest),
      JSON.stringify([evidence]),
      JSON.stringify(listing.spaces),
      now,
      now,
      now,
    );
  assert.equal(localPublicParking(undefined, id), null);
  assert.equal(getPublicListing(id)!.sceneAvailable, true);
  sql
    .prepare("UPDATE scene_sources SET processing_state='rejected' WHERE id=?")
    .run(evidence);
  assert.equal(getPublicListing(id)!.sceneAvailable, false);
  sql
    .prepare("UPDATE scene_sources SET processing_state='ready' WHERE id=?")
    .run(evidence);
  const changed = {
    ...listing,
    spaces: [{ ...listing.spaces[0], widthM: 2.8 }],
  };
  sql
    .prepare("UPDATE listings SET public_json=? WHERE id=?")
    .run(JSON.stringify(changed), id);
  assert.equal(getPublicListing(id)!.sceneAvailable, false);
  sql
    .prepare("UPDATE listings SET public_json=? WHERE id=?")
    .run(JSON.stringify({ ...listing, locationPrecision: "area" }), id);
  assert.equal(getPublicListing(id)!.sceneAvailable, false);
  sql.prepare("UPDATE listings SET public_json=? WHERE id=?").run(
    JSON.stringify({
      ...listing,
      availabilityExpiresAt: new Date(Date.now() - 1000).toISOString(),
    }),
    id,
  );
  assert.equal(getPublicListing(id), null);
  const expiredQuery = parsePageQuery(
    new URL(`http://127.0.0.1/api/listings?ids=${id}&scene=1&limit=1`),
  );
  assert.equal(
    localCatalogPage(
      expiredQuery.filters,
      expiredQuery.limit,
      expiredQuery.cursor,
    ).total,
    0,
  );
  sql
    .prepare("UPDATE listings SET public_json=?,status='paused' WHERE id=?")
    .run(JSON.stringify(listing), id);
  assert.equal(getPublicListing(id), null);
});
