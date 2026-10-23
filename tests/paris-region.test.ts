import { after, test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import {
  idfListingProblem,
  idfGeocode,
  isIdfCoordinate,
} from "../src/lib/paris-region";
import { emptyCommercialDetails } from "../src/lib/commercial-details";
import { db, personas, resetDbForTests } from "../src/server/db";
import { migrateParisDemo } from "../src/server/demo-paris";
import { localPublicParking } from "../src/server/parking-registry";
import { getPublicListing, listPublicListings } from "../src/server/catalog";
import { localCatalogPage, parsePageQuery } from "../src/server/pagination";
import { handleApi } from "../src/server/api";
import { sessionCookie } from "../src/server/security";
import type { Listing } from "../src/lib/types";
const dir = mkdtempSync(join(tmpdir(), "gp-idf-"));
process.env.GP_DATABASE_PATH = join(dir, "db.sqlite");
process.env.GP_FORCE_LOCAL_DEMO = "true";
process.env.GP_LOCAL_DEMO = "true";
after(() => {
  resetDbForTests();
  rmSync(dir, { recursive: true, force: true });
});
const places: [string, string, [number, number]][] = [
  ["Paris", "75012", [2.3739, 48.8446]],
  ["Melun", "77000", [2.66, 48.54]],
  ["Versailles", "78000", [2.1362, 48.7963]],
  ["Évry-Courcouronnes", "91000", [2.429, 48.629]],
  ["Boulogne-Billancourt", "92100", [2.2402, 48.8331]],
  ["Saint-Denis", "93200", [2.3578, 48.9274]],
  ["Créteil", "94000", [2.4556, 48.7904]],
  ["Pontoise", "95000", [2.097, 49.051]],
];
test("official IDF communes/postal codes and departmental polygons agree; out-of-region and inconsistent claims fail", () => {
  for (const [city, postalCode, coordinates] of places)
    assert.equal(
      idfListingProblem(
        {
          city,
          coordinates,
          commercialDetails: { ...emptyCommercialDetails(), postalCode },
        },
        true,
      ),
      null,
      city,
    );
  for (const [city, postalCode, coordinates] of [
    ["Lyon", "69003", [4.859, 45.76]],
    ["Paris", "75012", [4.859, 45.76]],
    ["Paris", "92100", [2.3739, 48.8446]],
    ["Boulogne-Billancourt", "92100", [2.3739, 48.8446]],
    ["Paris", "75099", [2.3739, 48.8446]],
  ] as typeof places)
    assert.ok(
      idfListingProblem(
        {
          city,
          coordinates,
          commercialDetails: { ...emptyCommercialDetails(), postalCode },
        },
        true,
      ),
    );
  assert.equal(
    idfListingProblem(
      { city: "Paris 12e", coordinates: [2.3739, 48.8446] },
      false,
    ),
    null,
  );
  assert.ok(
    idfListingProblem({ city: "Paris", coordinates: [2.3739, 48.8446] }, true),
  );
  assert.equal(isIdfCoordinate([4.85, 45.76]), false);
  assert.equal(isIdfCoordinate([NaN, 48.8]), false);
  assert.ok(idfGeocode("paris").some((x) => x.city === "Paris"));
  assert.deepEqual(idfGeocode("lyon"), []);
  assert.deepEqual(idfGeocode("69003"), []);
  assert.ok(idfGeocode("92100").every((x) => x.postalCodes.includes("92100")));
});
test("seven fictitious IDF listings keep original IDs, shared floors and a separate passwordless demo administrator", () => {
  const listings = listPublicListings();
  assert.equal(listings.length, 7);
  assert.ok(listings.every((l) => !idfListingProblem(l, true)));
  const admin = db()
    .prepare("SELECT * FROM users WHERE id=?")
    .get(personas.admin)!;
  assert.equal(admin.email, "admin@demo.invalid");
  assert.equal(admin.role, "admin");
  assert.equal(admin.password, null);
  const group = localPublicParking(
    undefined,
    "10000000-0000-4000-8000-000000000001",
  )!;
  assert.equal(group.listings.length, 2);
  assert.deepEqual(
    group.levels.map((l) => l.number),
    [-1, -2],
  );
  assert.ok(group.publicName.includes("Paris"));
});
test("out-of-region drafts remain private and editable; submit, approval and resume reject them without deleting data", async () => {
  const sql = db(),
    base = JSON.parse(
      String(
        sql
          .prepare("SELECT public_json FROM listings WHERE id=?")
          .get("10000000-0000-4000-8000-000000000001")!.public_json,
      ),
    ) as Listing;
  const id = randomUUID(),
    outside: Listing = {
      ...base,
      id,
      isDemo: false,
      city: "Lyon",
      district: "Part-Dieu",
      coordinates: [4.859, 45.76],
      commercialDetails: { ...emptyCommercialDetails(), postalCode: "69003" },
      photos: [1, 2, 3].map(() => `/api/media/${randomUUID()}`),
      version: 1,
    };
  const now = new Date().toISOString();
  sql
    .prepare(
      "INSERT INTO listings(id,seller_id,draft_json,status,version,created_at,updated_at) VALUES(?,?,?,'draft',1,?,?)",
    )
    .run(id, personas.seller, JSON.stringify(outside), now, now);
  const call = async (path: string, body: unknown, actor: string) => {
    const r = await handleApi(
      new Request("http://127.0.0.1:3000/api/" + path, {
        method: "POST",
        headers: {
          origin: "http://127.0.0.1:3000",
          "Content-Type": "application/json",
          cookie: sessionCookie(actor),
        },
        body: JSON.stringify(body),
      }),
    );
    return { status: r.status, ...(await r.json()) };
  };
  let r = await call(
    `listings/${id}/submit`,
    { version: 1, ownershipAttested: true },
    personas.seller,
  );
  assert.equal(r.code, "REGION_OUTSIDE_IDF");
  sql.prepare("UPDATE listings SET status='pending' WHERE id=?").run(id);
  r = await call(
    `admin/revisions/${id}/decision`,
    { version: 1, decision: "approve" },
    personas.admin,
  );
  assert.equal(r.code, "REGION_OUTSIDE_IDF");
  sql
    .prepare("UPDATE listings SET status='paused',public_json=? WHERE id=?")
    .run(JSON.stringify(outside), id);
  r = await call(
    `listings/${id}/lifecycle`,
    { version: 1, action: "resume" },
    personas.seller,
  );
  assert.equal(r.code, "REGION_OUTSIDE_IDF");
  assert.ok(sql.prepare("SELECT id FROM listings WHERE id=?").get(id));
  assert.equal(
    JSON.parse(
      String(
        sql.prepare("SELECT draft_json FROM listings WHERE id=?").get(id)!
          .draft_json,
      ),
    ).city,
    "Lyon",
  );
});
test("region scope is enforced before count and limit, while legacy IDF stays visible and human snapshots stay unchanged", () => {
  const sql = db(),
    base = JSON.parse(
      String(
        sql
          .prepare("SELECT public_json FROM listings WHERE id=?")
          .get("10000000-0000-4000-8000-000000000001")!.public_json,
      ),
    ) as Listing;
  const id = randomUUID(),
    outside = {
      ...base,
      id,
      isDemo: false,
      city: "Lyon",
      coordinates: [4.859, 45.76],
      priceCents: 1,
      commercialDetails: { ...emptyCommercialDetails(), postalCode: "69003" },
    };
  const now = new Date().toISOString(),
    snapshot = JSON.stringify(outside);
  sql
    .prepare(
      "INSERT INTO listings(id,seller_id,draft_json,public_json,status,version,created_at,updated_at,published_at) VALUES(?,?,?,?, 'published',1,?,?,?)",
    )
    .run(id, personas.seller, snapshot, snapshot, now, now, now);
  const q = parsePageQuery(
    new URL(`http://127.0.0.1/api/listings?sort=price_asc&limit=1`),
  );
  const result = localCatalogPage(q.filters, q.limit, q.cursor);
  assert.equal(result.total, 7);
  assert.notEqual(result.items[0].id, id);
  assert.equal(getPublicListing(id), null);
  migrateParisDemo(sql);
  assert.equal(
    sql.prepare("SELECT draft_json FROM listings WHERE id=?").get(id)!
      .draft_json,
    snapshot,
  );
});

test("only the reserved, explicitly fictitious Lyon seed is relocated; a human-marked snapshot at the same ID is preserved", () => {
  const sql = db(),
    id = "10000000-0000-4000-8000-000000000001";
  const original = JSON.parse(
    String(
      sql.prepare("SELECT public_json FROM listings WHERE id=?").get(id)!
        .public_json,
    ),
  ) as Listing;
  const old = {
    ...original,
    city: "Lyon",
    district: "Part-Dieu",
    slug: "lyon-part-dieu",
    coordinates: [4.859, 45.76],
    commercialDetails: { ...emptyCommercialDetails(), postalCode: "69003" },
  };
  sql
    .prepare("UPDATE listings SET draft_json=?,public_json=? WHERE id=?")
    .run(JSON.stringify(old), JSON.stringify(old), id);
  migrateParisDemo(sql);
  const moved = JSON.parse(
    String(
      sql.prepare("SELECT public_json FROM listings WHERE id=?").get(id)!
        .public_json,
    ),
  ) as Listing;
  assert.equal(moved.city, "Paris");
  assert.equal(moved.commercialDetails?.postalCode, "75012");
  assert.deepEqual(moved.spaces, original.spaces);
  const human = JSON.stringify({ ...old, isDemo: false });
  sql
    .prepare("UPDATE listings SET draft_json=?,public_json=? WHERE id=?")
    .run(human, human, id);
  migrateParisDemo(sql);
  assert.equal(
    sql.prepare("SELECT public_json FROM listings WHERE id=?").get(id)!
      .public_json,
    human,
  );
  sql
    .prepare("UPDATE listings SET draft_json=?,public_json=? WHERE id=?")
    .run(JSON.stringify(original), JSON.stringify(original), id);
});
