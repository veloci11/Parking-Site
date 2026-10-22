import { test, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { db, personas, resetDbForTests } from "../src/server/db";
import { handleApi } from "../src/server/api";
import {
  emptyCommercialDetails,
  emptyUnitDetails,
} from "../src/lib/commercial-details";
import { publicProjection } from "../src/server/catalog";
import { matchesPageFilters, parsePageQuery } from "../src/server/pagination";
import { linkTestListing } from "./helpers/registry";
const dir = mkdtempSync(join(tmpdir(), "gp-commercial-"));
process.env.GP_DATABASE_PATH = join(dir, "db.sqlite");
process.env.GP_FORCE_LOCAL_DEMO = "true";
const origin = "http://127.0.0.1:3000";
async function api(
  path: string,
  method = "GET",
  value?: unknown,
  cookie?: string,
) {
  const r = await handleApi(
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
    status: r.status,
    ...(await r.json()),
    cookie: r.headers.get("set-cookie")?.split(";")[0],
  };
}
after(() => {
  resetDbForTests();
  rmSync(dir, { recursive: true, force: true });
});
test("location consent is server-attributed, cleared by effective changes and required before new submission", async () => {
  const s = (await api("auth/demo", "POST", { persona: "seller" })).cookie!;
  const b = (await api("auth/demo", "POST", { persona: "buyer" })).cookie!;
  const id = "10000000-0000-4000-8000-000000000001";
  const patch = await api(
    "listings/" + id,
    "PATCH",
    {
      version: 1,
      locationPrecision: "area",
      publicCoordinates: [2.38, 48.85],
      locationConfirmedAt: "2000-01-01T00:00:00Z",
    },
    s,
  );
  assert.equal(patch.status, 200);
  assert.equal(patch.data.locationConfirmedAt, null);
  const confirmed = await api(
    "listings/" + id,
    "PATCH",
    { version: 2, locationConfirmedAt: "2000-01-01T00:00:00Z" },
    s,
  );
  assert.equal(confirmed.status, 200);
  assert.ok(
    Date.parse(confirmed.data.locationConfirmedAt) > Date.now() - 10000,
  );
  const preview = await api("listings/" + id + "/preview", "GET", undefined, s);
  assert.equal(preview.status, 200);
  assert.deepEqual(preview.data.coordinates, [2.38, 48.85]);
  assert.equal(preview.data.address, undefined);
  assert.equal(preview.data.location_confirmation_hash, undefined);
  assert.equal(
    (await api("listings/" + id + "/preview", "GET", undefined, b)).status,
    404,
  );
  const moved = await api(
    "listings/" + id,
    "PATCH",
    {
      version: 3,
      address: "Adresse modifiée",
      locationConfirmedAt: confirmed.data.locationConfirmedAt,
    },
    s,
  );
  assert.equal(moved.data.locationConfirmedAt, null);
  const refused = await api(
    "listings/" + id + "/submit",
    "POST",
    { version: 4, ownershipAttested: true },
    s,
  );
  assert.equal(refused.status, 400);
});
test("commercial details preserve private sources and lot references while preview only shows aliases and public values", async () => {
  const s = (await api("auth/demo", "POST", { persona: "seller" })).cookie!;
  const id = "10000000-0000-4000-8000-000000000002";
  const original = JSON.parse(
    String(
      db().prepare("SELECT draft_json FROM listings WHERE id=?").get(id)!
        .draft_json,
    ),
  );
  const first = original.spaces[0].id,
    second = randomUUID();
  const details = emptyCommercialDetails();
  details.postalCode = "92100";
  details.units = {
    [first]: {
      ...emptyUnitDetails(),
      type: "covered",
      privateLotReference: "LOT-SECRET-123",
      dimensionSource: "plan_derived",
    },
    [second]: { ...emptyUnitDetails(), type: "outdoor" },
  };
  const saved = await api(
    "listings/" + id,
    "PATCH",
    {
      version: 1,
      type: "mixed",
      spaces: [
        ...original.spaces,
        { ...original.spaces[0], id: second, number: "B" },
      ],
      commercialDetails: details,
    },
    s,
  );
  assert.equal(saved.status, 200);
  const preview = await api("listings/" + id + "/preview", "GET", undefined, s);
  assert.equal(preview.data.type, "mixed");
  assert.equal(
    preview.data.commercialDetails.units[id + ":unit:1"].privateLotReference,
    undefined,
  );
  assert.equal(
    preview.data.commercialDetails.units[id + ":unit:1"].sourceDocumentIds,
    undefined,
  );
  assert.equal(JSON.stringify(preview.data).includes("LOT-SECRET-123"), false);
  assert.equal(
    (
      await api(
        "listings/" + id,
        "PATCH",
        {
          version: 2,
          commercialDetails: {
            ...details,
            chargesSource: {
              ...details.chargesSource,
              sourceDocumentIds: [randomUUID()],
            },
          },
        },
        s,
      )
    ).status,
    400,
  );
  const input = JSON.parse(JSON.stringify(saved.data));
  input.commercialDetails.access.privateSecret = "must-not-leak";
  input.commercialDetails.rentalIncome = {
    amountCents: 10000,
    period: "month",
    observedAt: null,
    sourceKind: "seller_declared",
    sourceDocumentIds: [],
    privateSecret: "must-not-leak",
  };
  const projected = publicProjection(input);
  assert.equal(JSON.stringify(projected).includes("must-not-leak"), false);
  assert.equal(
    matchesPageFilters(
      preview.data,
      parsePageQuery(new URL(origin + "?covered=1")).filters,
    ),
    false,
  );
  assert.equal(
    matchesPageFilters(
      preview.data,
      parsePageQuery(new URL(origin + "?covered=0")).filters,
    ),
    true,
  );
});
test("dimensions reject over-millimetre precision even without commercial details", async () => {
  const s = (await api("auth/demo", "POST", { persona: "seller" })).cookie!;
  const id = "10000000-0000-4000-8000-000000000003";
  const row = JSON.parse(
    String(
      db().prepare("SELECT draft_json FROM listings WHERE id=?").get(id)!
        .draft_json,
    ),
  );
  assert.equal(
    (
      await api(
        "listings/" + id,
        "PATCH",
        {
          version: 1,
          spaces: row.spaces.map((x: any) => ({ ...x, widthM: 2.34567 })),
        },
        s,
      )
    ).status,
    400,
  );
});

test("public place number is optional and allows forty characters without persisting legacy placeholders", async () => {
  const seller = (await api("auth/demo", "POST", { persona: "seller" }))
    .cookie!;
  const moderator = (await api("auth/demo", "POST", { persona: "moderator" }))
    .cookie!;
  const draft = await api("listings", "POST", {}, seller);
  const id = draft.data.id;
  const unit = {
    id: randomUUID(),
    number: "",
    level: 0,
    areaM2: 12,
    lengthM: 5,
    widthM: 2.4,
    clearanceM: null,
  };
  const edited = await api(
    "listings/" + id,
    "PATCH",
    {
      version: 1,
      title: "Deux places sans numéros publics requis",
      city: "Paris",
      coordinates: [2.3739, 48.8446],
      commercialDetails: { ...emptyCommercialDetails(), postalCode: "75012" },
      description: "Description factuelle du lot et de ses conditions. ".repeat(
        4,
      ),
      district: "Test",
      priceCents: 2000000,
      spaces: [unit, { ...unit, id: randomUUID(), number: "A".repeat(40) }],
      photos: ["/demo/covered.png", "/demo/box.png", "/demo/outdoor.png"],
    },
    seller,
  );
  assert.equal(edited.status, 200);
  const confirmed = await api(
    "listings/" + id,
    "PATCH",
    { version: 2, locationConfirmedAt: new Date().toISOString() },
    seller,
  );
  assert.equal(confirmed.status, 200);
  const submitted = await api(
    "listings/" + id + "/submit",
    "POST",
    { version: 3, ownershipAttested: true },
    seller,
  );
  assert.equal(submitted.status, 200);
  assert.equal(submitted.data.spaces[0].number, "");
  assert.equal(submitted.data.spaces[1].number.length, 40);
  const linkedVersion = linkTestListing(id);
  const approved = await api(
    "admin/revisions/" + id + "/decision",
    "POST",
    { version: linkedVersion, decision: "approve" },
    moderator,
  );
  assert.equal(approved.status, 200);
  const published = await api("listings/" + id);
  assert.equal(published.data.spaces[0].number, "");
  assert.equal(published.data.spaces[1].number.length, 40);
  assert.equal(
    String(
      db()
        .prepare("SELECT snapshot_json FROM revisions WHERE listing_id=?")
        .get(id)?.snapshot_json,
    ).includes("Unité"),
    false,
  );
});
