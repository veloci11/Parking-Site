import { after, test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { db, personas, resetDbForTests } from "../src/server/db";
import { handleApi } from "../src/server/api";
import { sessionCookie } from "../src/server/security";
import { linkTestListing } from "./helpers/registry";
const dir = mkdtempSync(join(tmpdir(), "gp-transactions-"));
process.env.GP_DATABASE_PATH = join(dir, "db.sqlite");
process.env.GP_FORCE_LOCAL_DEMO = "true";
process.env.GP_LOCAL_DEMO = "true";
const origin = "http://127.0.0.1:3000";
async function api(
  path: string,
  method = "GET",
  value?: unknown,
  cookie?: string,
) {
  const response = await handleApi(
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
  return { status: response.status, ...(await response.json()) };
}
after(() => {
  resetDbForTests();
  rmSync(dir, { recursive: true, force: true });
});
test("sale and whole-lot monthly rent are exclusive, versioned and filtered before pagination", async () => {
  db();
  const seller = sessionCookie(personas.seller),
    moderator = sessionCookie(personas.moderator);
  const legacy = await api("listings");
  assert.equal(legacy.data.length, 7);
  assert.ok(
    legacy.data.every((value: any) => value.transactionType === "sale"),
  );
  assert.equal(
    (await api("listings", "POST", { transactionType: "both" }, seller)).status,
    400,
  );
  assert.equal(
    (await api("listings", "POST", { transactionType: null }, seller)).status,
    400,
  );
  const made = await api(
      "listings",
      "POST",
      { transactionType: "rent" },
      seller,
    ),
    id = made.data.id;
  assert.equal(made.status, 201);
  assert.equal(made.data.transactionType, "rent");
  const edited = await api(
    "listings/" + id,
    "PATCH",
    {
      version: 1,
      title: "Location mensuelle du lot de deux places",
      description:
        "Description factuelle du lot, des dimensions et de ses accès. ".repeat(
          4,
        ),
      district: "Test",
      priceCents: 15000,
      spaces: [1, 2].map((number) => ({
        id: randomUUID(),
        number: String(number),
        level: -1,
        areaM2: 12,
        lengthM: 5,
        widthM: 2.4,
        clearanceM: 2.1,
      })),
      photos: ["/demo/covered.png", "/demo/box.png", "/demo/outdoor.png"],
    },
    seller,
  );
  assert.equal(edited.status, 200);
  assert.equal(
    (
      await api(
        "listings/" + id,
        "PATCH",
        { version: 2, locationConfirmedAt: new Date().toISOString() },
        seller,
      )
    ).status,
    200,
  );
  const submitted = await api(
    "listings/" + id + "/submit",
    "POST",
    { version: 3, ownershipAttested: true },
    seller,
  );
  assert.equal(submitted.status, 200);
  const version = linkTestListing(id);
  const approved = await api(
    "admin/revisions/" + id + "/decision",
    "POST",
    { version, decision: "approve" },
    moderator,
  );
  assert.equal(approved.status, 200);
  const published = await api("listings/" + id);
  assert.equal(published.data.transactionType, "rent");
  assert.equal(
    published.data.priceCents,
    15000,
    "monthly price is for the whole lot; no division by two",
  );
  assert.equal(published.data.spaces.length, 2);
  const seededId = "10000000-0000-4000-8000-000000000001";
  const seeded = JSON.parse(
    String(
      db().prepare("SELECT public_json FROM listings WHERE id=?").get(seededId)!
        .public_json,
    ),
  );
  db()
    .prepare("UPDATE listings SET public_json=? WHERE id=?")
    .run(
      JSON.stringify({ ...seeded, transactionType: "rent", priceCents: 22000 }),
      seededId,
    );
  const rentals = await api(
    "listings?transactionType=rent&sort=price_asc&limit=1",
  );
  assert.equal(rentals.total, 2);
  assert.equal(rentals.data.length, 1);
  assert.equal(rentals.data[0].id, id);
  assert.ok(rentals.nextCursor);
  const next = await api(
    "listings?transactionType=rent&sort=price_asc&limit=1&cursor=" +
      rentals.nextCursor,
  );
  assert.deepEqual(
    next.data.map((value: any) => value.id),
    [seededId],
  );
  assert.equal(
    (
      await api(
        "listings?transactionType=sale&sort=price_asc&limit=1&cursor=" +
          rentals.nextCursor,
      )
    ).code,
    "INVALID_CURSOR",
  );
  assert.equal(
    (await api("listings?transactionType=rent&transactionType=sale")).status,
    400,
  );
  assert.equal((await api("listings?transactionType=all")).status, 400);
  assert.equal((await api("listings")).total, 6);
  const amended = await api(
    "listings/" + id,
    "PATCH",
    {
      version: approved.data.version,
      transactionType: "sale",
      priceCents: 2200000,
    },
    seller,
  );
  assert.equal(amended.status, 200);
  assert.equal(amended.data.transactionType, "sale");
  assert.equal((await api("listings/" + id)).data.transactionType, "rent");
  assert.equal((await api("listings/" + id)).data.priceCents, 15000);
  const preview = await api(
    "listings/" + id + "/preview",
    "GET",
    undefined,
    seller,
  );
  assert.equal(preview.data.transactionType, "sale");
  assert.equal(preview.data.priceCents, 2200000);
});
