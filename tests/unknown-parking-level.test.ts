import { after, test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { type Listing, type Space, spaceLevelLabel } from "../src/lib/types";
import { db, resetDbForTests } from "../src/server/db";
import { publicProjection } from "../src/server/catalog";
import { draftSchema } from "../src/server/validation";
import { catalogOfferMatch } from "../src/lib/listing-price";
import { contactSelectionContext } from "../src/lib/contact-draft";
import {
  writeInteriorSelection,
  readInteriorSelection,
} from "../src/lib/interior-view";
import {
  exampleSceneManifest,
  assertSceneMapping,
} from "../src/lib/scene-contract";
import { localRegistryPrepareApproval } from "../src/server/parking-registry";
import { handleApi } from "../src/server/api";

const dir = mkdtempSync(join(tmpdir(), "gp-unknown-floor-"));
process.env.GP_DATABASE_PATH = join(dir, "db.sqlite");
process.env.GP_FORCE_LOCAL_DEMO = "true";
process.env.GP_LOCAL_DEMO = "true";
after(() => {
  resetDbForTests();
  rmSync(dir, { recursive: true, force: true });
});
const unit = (): Space => ({
  id: randomUUID(),
  number: "",
  level: 0,
  levelKnown: false,
  areaM2: 15,
  lengthM: null,
  widthM: null,
  clearanceM: null,
  offer: { transactionType: "sale", priceCents: 1500000, status: "available" },
});
function listing() {
  const row = db()
    .prepare(
      "SELECT draft_json FROM listings WHERE id='10000000-0000-4000-8000-000000000001'",
    )
    .get()!;
  return {
    ...JSON.parse(String(row.draft_json)),
    pricingMode: "per_space",
    spaces: [unit()],
    priceCents: 1500000,
  } as Listing;
}

test("creating a draft without seller floor details defaults to unknown, never an advertised basement", async () => {
  const origin = "http://127.0.0.1:3000";
  const login = await handleApi(
    new Request(`${origin}/api/auth/demo`, {
      method: "POST",
      headers: { origin, "content-type": "application/json" },
      body: JSON.stringify({ persona: "seller" }),
    }),
  );
  assert.equal(login.status, 200);
  const cookie = login.headers.get("set-cookie")!.split(";")[0];
  const response = await handleApi(
    new Request(`${origin}/api/listings`, {
      method: "POST",
      headers: { origin, cookie, "content-type": "application/json" },
      body: "{}",
    }),
  );
  assert.equal(response.status, 201);
  const { data: created } = await response.json();
  assert.equal(created.spaces[0].levelKnown, false);
  assert.equal(created.spaces[0].level, 0);
  assert.equal(spaceLevelLabel(created.spaces[0]), "Non renseigné");
  assert.equal(draftSchema.safeParse({ spaces: created.spaces }).success, true);
});

test("unknown floors validate and remain explicit in public projections without advertising a model", () => {
  const source = listing();
  assert.equal(draftSchema.safeParse({ spaces: source.spaces }).success, true);
  assert.equal(
    draftSchema.safeParse({
      spaces: [{ ...source.spaces[0], levelKnown: "false" }],
    }).success,
    false,
  );
  assert.equal(
    draftSchema.safeParse({ spaces: [{ ...source.spaces[0], level: -1 }] })
      .success,
    false,
  );
  const projected = publicProjection({ ...source, sceneAvailable: true });
  assert.equal(projected.spaces[0].levelKnown, false);
  assert.equal(projected.sceneAvailable, false);
  assert.equal(spaceLevelLabel(projected.spaces[0]), "Non renseigné");
  assert.equal(spaceLevelLabel({ level: 0 }), "RDC");
  assert.equal(spaceLevelLabel({ level: -1 }), "−1");
});

test("unknown internal floor zero never matches RDC filters, appears in messages or creates a floor URL", () => {
  for (const pricingMode of ["per_space", "lot"] as const) {
    const source = { ...listing(), pricingMode };
    assert.ok(catalogOfferMatch(source, { transactionType: "sale" }));
    assert.equal(
      catalogOfferMatch(source, { transactionType: "sale", level: 0 }),
      null,
    );
    assert.equal(
      catalogOfferMatch(source, { transactionType: "sale", level: -1 }),
      null,
    );
    assert.doesNotMatch(
      contactSelectionContext(source, source.spaces[0]),
      /RDC|niveau 0/,
    );
    const query = writeInteriorSelection(
      "?floor=0",
      source,
      0,
      source.spaces[0].id,
    );
    assert.equal(query.has("floor"), false);
    assert.equal(
      readInteriorSelection(query.toString(), source).unit,
      source.spaces[0].id,
    );
  }
});

test("unknown floors cannot produce a sample scene or satisfy a measured scene mapping", () => {
  const source = listing();
  const known = {
    ...source,
    spaces: source.spaces.map((space) => ({
      ...space,
      number: "18",
      levelKnown: true,
    })),
  };
  const manifest = exampleSceneManifest(known);
  assert.throws(() => exampleSceneManifest(source), /Précisez les niveaux/);
  assert.throws(
    () => assertSceneMapping(manifest, source),
    /Toutes les places/,
  );
});

test("only fully unknown and unlinked listings may publish without invented physical registry entries", () => {
  const source = listing();
  db()
    .prepare("UPDATE listings SET draft_json=? WHERE id=?")
    .run(JSON.stringify(source), source.id);
  assert.equal(localRegistryPrepareApproval(source.id, "qa-admin"), null);
  const mixed = {
    ...source,
    spaces: [...source.spaces, { ...unit(), levelKnown: true }],
  };
  db()
    .prepare("UPDATE listings SET draft_json=? WHERE id=?")
    .run(JSON.stringify(mixed), source.id);
  assert.throws(
    () => localRegistryPrepareApproval(source.id, "qa-admin"),
    /rattacher chaque place/,
  );
});
