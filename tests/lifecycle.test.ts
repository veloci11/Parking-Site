import { test } from "node:test";
import assert from "node:assert/strict";
import { availabilityDates, availabilityAction } from "../src/server/lifecycle";
test("availability period is exactly 90 days and distinct from content edits", () => {
  assert.deepEqual(availabilityDates("2026-01-01T00:00:00Z"), {
    availabilityConfirmedAt: "2026-01-01T00:00:00.000Z",
    availabilityExpiresAt: "2026-04-01T00:00:00.000Z",
  });
  assert.throws(() => availabilityDates("invalid"));
});
test("deadline and reminders have deterministic inclusive thresholds", () => {
  const now = Date.parse("2026-01-01T00:00:00Z"),
    at = (days: number) => new Date(now + days * 86400000).toISOString();
  assert.equal(availabilityAction(at(15), now), null);
  assert.equal(availabilityAction(at(14), now), "remind_14");
  assert.equal(availabilityAction(at(3), now), "remind_3");
  assert.equal(availabilityAction(at(0), now), "expire");
  assert.equal(availabilityAction(at(-1), now), "expire");
  assert.equal(availabilityAction("invalid", now), null);
});
test("local isolated confirmation enforces owner, version, deadline and active account", async () => {
  const { mkdtempSync, rmSync } = await import("node:fs"),
    { tmpdir } = await import("node:os"),
    { join } = await import("node:path");
  const directory = mkdtempSync(join(tmpdir(), "gp-lifecycle-"));
  const oldPath = process.env.GP_DATABASE_PATH,
    oldDemo = process.env.GP_FORCE_LOCAL_DEMO;
  process.env.GP_DATABASE_PATH = join(directory, "test.sqlite");
  process.env.GP_FORCE_LOCAL_DEMO = "true";
  const { db, resetDbForTests, personas } = await import("../src/server/db"),
    { handleApi } = await import("../src/server/api"),
    { handleAvailability } = await import("../src/server/lifecycle");
  const origin = "http://127.0.0.1:3000";
  try {
    const cookie = async (persona: string) => {
      const r = await handleApi(
        new Request(origin + "/api/auth/demo", {
          method: "POST",
          headers: { origin, "content-type": "application/json" },
          body: JSON.stringify({ persona }),
        }),
      );
      return r.headers.get("set-cookie")!.split(";")[0];
    };
    const seller = await cookie("seller"),
      buyer = await cookie("buyer"),
      row = db()
        .prepare(
          "SELECT * FROM listings WHERE seller_id=? AND status='published' LIMIT 1",
        )
        .get(personas.seller)!;
    const published = JSON.parse(String(row.public_json));
    db()
      .prepare("UPDATE listings SET public_json=? WHERE id=?")
      .run(
        JSON.stringify({
          ...published,
          ...availabilityDates(new Date().toISOString()),
        }),
        String(row.id),
      );
    const request = (cookie: string, version: number) =>
      handleAvailability(
        new Request(origin + `/api/listings/${row.id}/availability`, {
          method: "POST",
          headers: { origin, cookie, "content-type": "application/json" },
          body: JSON.stringify({ version }),
        }),
        String(row.id),
      );
    assert.equal((await request(buyer, Number(row.version))).status, 404);
    const confirmed = await request(seller, Number(row.version));
    assert.equal(confirmed.status, 200);
    assert.equal(
      db()
        .prepare("SELECT updated_at FROM listings WHERE id=?")
        .get(String(row.id))!.updated_at,
      row.updated_at,
    );
    assert.equal((await request(seller, Number(row.version))).status, 409);
    db()
      .prepare("UPDATE listings SET public_json=? WHERE id=?")
      .run(
        JSON.stringify({
          ...published,
          availabilityExpiresAt: "2000-01-01T00:00:00Z",
        }),
        String(row.id),
      );
    assert.equal((await request(seller, Number(row.version) + 1)).status, 409);
    db()
      .prepare("UPDATE users SET status='suspended' WHERE id=?")
      .run(personas.seller);
    assert.equal((await request(seller, Number(row.version) + 1)).status, 401);
  } finally {
    resetDbForTests();
    if (oldPath === undefined) delete process.env.GP_DATABASE_PATH;
    else process.env.GP_DATABASE_PATH = oldPath;
    if (oldDemo === undefined) delete process.env.GP_FORCE_LOCAL_DEMO;
    else process.env.GP_FORCE_LOCAL_DEMO = oldDemo;
    rmSync(directory, { recursive: true, force: true });
  }
});
