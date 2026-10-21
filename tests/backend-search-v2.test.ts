import { test, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { db, resetDbForTests } from "../src/server/db";
import {
  parsePageQuery,
  localCatalogPage,
  decodeCursor,
  minimumUnitArea,
  matchesPageFilters,
} from "../src/server/pagination";
const dir = mkdtempSync(join(tmpdir(), "gp-searchv2-"));
process.env.GP_DATABASE_PATH = join(dir, "test.sqlite");
process.env.GP_FORCE_LOCAL_DEMO = "true";
const query = (s: string) =>
  parsePageQuery(new URL("http://127.0.0.1/api/listings?" + s));
const search = (s: string) => {
  const { filters, limit, cursor } = query(s);
  return localCatalogPage(filters, limit, cursor);
};
after(() => {
  resetDbForTests();
  rmSync(dir, { recursive: true, force: true });
});
test("all filters apply before limit and count, booleans and per-unit level are explicit", () => {
  const all = search("");
  assert.equal(all.total, 7);
  const f = search("priceMin=2000000&covered=1&closed=1&limit=1");
  assert.equal(
    f.total,
    all.items.filter((x) => x.priceCents >= 2000000 && x.type === "box").length,
  );
  assert.equal(f.items.length, 1);
  assert.equal(f.items[0].type, "box");
  assert.ok(search("covered=0").items.every((x) => x.type === "outdoor"));
  assert.ok(search("closed=0").items.every((x) => x.type !== "box"));
  assert.equal(search("level=50").total, 0);
  assert.equal(search("occupancy=unknown").total, 7);
  assert.equal(
    search("ids=" + all.items[2].id + "&limit=1").items[0].id,
    all.items[2].id,
  );
  const p = query("level=-1").filters;
  assert.equal(
    matchesPageFilters(
      {
        ...all.items[0],
        spaces: [
          { ...all.items[0].spaces[0], level: 0 },
          { ...all.items[0].spaces[0], level: -1 },
        ],
      },
      p,
    ),
    true,
  );
});
test("bbox and radius use public rounded coordinates; antimeridian and invalid tuples handled", () => {
  const all = search("");
  const item = all.items.find((x) => x.locationPrecision === "area")!;
  const p = query("radiusKm=0.1&center=" + item.coordinates.join(",")).filters;
  assert.equal(matchesPageFilters(item, p), true);
  assert.equal(
    matchesPageFilters(
      { ...item, coordinates: [179.9, 0] },
      query("bbox=170,-1,-170,1").filters,
    ),
    true,
  );
  assert.equal(
    matchesPageFilters(
      { ...item, coordinates: [0, 0] },
      query("bbox=170,-1,-170,1").filters,
    ),
    false,
  );
  // The rounded public marker is outside a 100m radius around this private source coordinate.
  assert.equal(
    matchesPageFilters(
      { ...item, coordinates: [4.86, 45.76] },
      query("center=4.8597,45.7612&radiusKm=0.1").filters,
    ),
    false,
  );
  for (const s of [
    "center=4,45",
    "radiusKm=1",
    "center=4,45&radiusKm=0",
    "bbox=4,46,5,45",
    "bbox=181,0,0,1",
    "covered=maybe",
    "occupancy=free",
    "level=51",
    "level=1.5",
    "priceMin=100&priceMax=99",
    "ids=bad",
  ])
    assert.throws(() => query(s));
});
test("area and count keysets cover ties and nulls without duplicates, all filters bind cursor v2", () => {
  const sql = db();
  const rows = sql.prepare("SELECT * FROM listings ORDER BY id").all();
  rows.forEach((r, i) => {
    const value = JSON.parse(String(r.public_json));
    value.spaces = Array.from({ length: (i % 3) + 1 }, (_, j) => ({
      ...value.spaces[0],
      id: "unit" + j,
      areaM2: i >= 4 ? null : i % 2 === 0 ? 12 : 16,
    }));
    sql
      .prepare("UPDATE listings SET public_json=? WHERE id=?")
      .run(JSON.stringify(value), r.id);
  });
  for (const sort of ["area_asc", "spaces_desc"]) {
    const baseline = search("sort=" + sort).items;
    const seen: string[] = [];
    let cursor: string | null = null;
    do {
      const page = search(
        "sort=" + sort + "&limit=1" + (cursor ? "&cursor=" + cursor : ""),
      );
      seen.push(...page.items.map((x) => x.id));
      cursor = page.nextCursor;
    } while (cursor);
    assert.deepEqual(
      seen,
      baseline.map((x) => x.id),
    );
    assert.equal(new Set(seen).size, 7);
    if (sort === "area_asc")
      assert.equal(minimumUnitArea(baseline.at(-1)!), null);
  }
  const first = search("sort=area_asc&limit=1");
  const decoded = decodeCursor(
    first.nextCursor,
    query("sort=area_asc").filters,
  )!;
  assert.equal(decoded.version, 2);
  assert.ok("areaM2" in decoded.after);
  assert.ok("spaceCount" in decoded.after);
  for (const suffix of [
    "covered=1",
    "closed=0",
    "occupancy=vacant",
    "level=-1",
    "priceMin=100",
    "bbox=0,0,1,1",
    "center=0,0&radiusKm=1",
    "ids=" + first.items[0].id,
  ])
    assert.throws(() =>
      query("sort=area_asc&" + suffix + "&cursor=" + first.nextCursor),
    );
});
