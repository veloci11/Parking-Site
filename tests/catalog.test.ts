import { after, test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { db, personas, resetDbForTests } from "../src/server/db";
import {
  publicProjection,
  listPublicListings,
  getPublicListing,
} from "../src/server/catalog";
import { areaLabel, type Listing, type Space } from "../src/lib/types";

const directory = mkdtempSync(join(tmpdir(), "gp-catalog-"));
process.env.GP_DATABASE_PATH = join(directory, "catalog.sqlite");
process.env.GP_LOCAL_DEMO = "true";
after(() => {
  resetDbForTests();
  rmSync(directory, { recursive: true, force: true });
});
const physicalId = randomUUID();
const makeSpace = (areaM2: number | null, number = "12"): Space => ({
  id: physicalId,
  number,
  level: -1,
  areaM2,
  lengthM: null,
  widthM: null,
  clearanceM: null,
});
function listing(overrides: Partial<Listing> = {}): Listing {
  return {
    id: randomUUID(),
    slug: "bien-de-test",
    title: "Un lot de deux places",
    description: "Bien de test ; aucune annonce réelle.",
    city: "Ville de recette",
    district: "Secteur privé",
    priceCents: 3100000,
    type: "covered",
    spaces: [makeSpace(12, "12"), makeSpace(14, "13")],
    photos: ["/demo/covered.png"],
    quality: {
      floor: "Inconnu",
      lighting: "Inconnu",
      humidity: "Inconnue",
      access: "À documenter",
      maneuver: "À documenter",
      observations: "",
    },
    locationPrecision: "area",
    coordinates: [4.859723, 45.761234],
    address: "Adresse exacte privée",
    sceneAvailable: true,
    isDemo: true,
    status: "published",
    version: 1,
    sellerName: "Vendeur de recette",
    createdAt: "2026-10-21T10:00:00.000Z",
    updatedAt: "2026-10-21T10:00:00.000Z",
    ...overrides,
  };
}
function insert(value: Listing, state = "published") {
  db()
    .prepare(
      "INSERT INTO listings(id,seller_id,draft_json,public_json,status,created_at,updated_at) VALUES(?,?,?,?,?,?,?)",
    )
    .run(
      value.id,
      personas.seller,
      JSON.stringify(value),
      JSON.stringify(value),
      state,
      value.createdAt,
      value.updatedAt,
    );
  return value;
}

test("un filtre de budget porte sur le prix total du lot, jamais une moyenne par place", () => {
  const bundle = insert(listing());
  assert.equal(bundle.spaces.length, 2);
  assert.equal(
    listPublicListings({ ids: [bundle.id], maxPrice: 2000000 }).length,
    0,
  );
  assert.equal(
    listPublicListings({ ids: [bundle.id], maxPrice: 3100000 })[0]?.priceCents,
    3100000,
  );
});

test("la surface minimale s’applique à chaque place et exclut toute surface inconnue", () => {
  const valid = insert(listing());
  const smaller = insert(
    listing({ spaces: [makeSpace(12), makeSpace(11, "13")] }),
  );
  const unknown = insert(
    listing({ spaces: [makeSpace(12), makeSpace(null, "13")] }),
  );
  const ids = [valid.id, smaller.id, unknown.id];
  assert.deepEqual(
    listPublicListings({ ids, minArea: 12 }).map((item) => item.id),
    [valid.id],
  );
  assert.equal(listPublicListings({ ids }).length, 3);
  assert.equal(getPublicListing(unknown.id)?.spaces[1].areaM2, null);
  assert.equal(
    areaLabel(unknown.spaces),
    "12 m² / place · 1/2 surfaces renseignées",
  );
  assert.equal(areaLabel([makeSpace(null)]), "Surface à préciser");
});

test("la projection de secteur retire adresse, scène et identifiants physiques partagés", () => {
  const first = listing();
  const second = listing();
  const a = publicProjection(first),
    b = publicProjection(second);
  assert.equal(a.address, undefined);
  assert.equal(a.sceneAvailable, false);
  assert.deepEqual(a.coordinates, [4.86, 45.76]);
  assert.notEqual(a.spaces[0].id, physicalId);
  assert.notEqual(a.spaces[0].id, b.spaces[0].id);
  assert.equal(a.spaces[0].lengthM, null);
  assert.equal(a.spaces[0].clearanceM, null);
});

test("une projection publique ignore les futurs champs privés, y compris imbriqués", () => {
  const source = listing();
  const enriched = {
    ...source,
    sellerId: "private-seller",
    email: "private@example.invalid",
    privatePlanKey: "private/plans/site.pdf",
    exactCoordinates: [4.859723, 45.761234],
    rejectionReason: "Décision privée",
    quality: { ...source.quality, privateInspectorNote: "À ne pas publier" },
    spaces: source.spaces.map((space) => ({
      ...space,
      privateLotReference: "LOT-SECRET",
    })),
  } as Listing;
  const output = JSON.stringify(publicProjection(enriched));
  for (const secret of [
    "private-seller",
    "private@example.invalid",
    "private/plans/site.pdf",
    "exactCoordinates",
    "Décision privée",
    "privateInspectorNote",
    "LOT-SECRET",
  ])
    assert.ok(!output.includes(secret), `champ privé divulgué : ${secret}`);
});

test("le consentement exact révèle uniquement la localisation autorisée, pas les décisions privées", () => {
  const source = listing({
    locationPrecision: "exact_opt_in",
    rejectionReason: "Décision interne",
  });
  const projected = publicProjection(source);
  assert.equal(projected.address, source.address);
  assert.deepEqual(projected.coordinates, source.coordinates);
  assert.equal(projected.rejectionReason, undefined);
  assert.equal(projected.sceneAvailable, true);
});

test("le tri au prix reste déterministe lorsque deux annonces ont le même prix", () => {
  const first = insert(listing({ priceCents: 1700000 })),
    second = insert(listing({ priceCents: 1700000 }));
  const third = insert(listing({ priceCents: 1800000 }));
  const ids = [third.id, second.id, first.id];
  const tied = [first.id, second.id].sort();
  assert.deepEqual(
    listPublicListings({ ids, sort: "price_asc" }).map((item) => item.id),
    [...tied, third.id],
  );
  assert.deepEqual(
    listPublicListings({ ids, sort: "price_desc" }).map((item) => item.id),
    [third.id, ...tied],
  );
});

test("la publication courante reste visible pendant révision, puis disparaît dès le retrait", () => {
  const pendingRevision = insert(listing(), "pending");
  assert.equal(getPublicListing(pendingRevision.id)?.priceCents, 3100000);
  for (const state of ["paused", "sold", "withdrawn"]) {
    db()
      .prepare("UPDATE listings SET status=? WHERE id=?")
      .run(state, pendingRevision.id);
    assert.equal(getPublicListing(pendingRevision.id), null);
  }
});
