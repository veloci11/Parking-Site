import { test } from "node:test";
import assert from "node:assert/strict";
import { readExplorerView, resolveExplorerView } from "../src/lib/map-demand";
import {
  hasExplorerFilters,
  resetExplorerFilters,
} from "../src/lib/explorer-search";
import {
  emptySearch,
  readSearch,
  searchParams,
} from "../src/lib/search-client";
import { mapResultBounds, groupMapMarkers } from "../src/lib/map-result-bounds";

test("view URLs preserve filters and selection while keeping display out of catalog query", () => {
  const url = new URLSearchParams(
    "display=list&transactionType=rent&city=Paris&priceMax=200&sort=price_asc&listing=demo-id",
  );
  const search = readSearch(url);
  assert.equal(readExplorerView(url), "list");
  assert.equal(resolveExplorerView("list", false), "list");
  assert.equal(resolveExplorerView("map", true), "map");
  assert.equal(search.transactionType, "rent");
  assert.equal(search.maxPrice, "200");
  assert.equal(search.sort, "price_asc");
  assert.equal(searchParams(search, true).has("display"), false);
  assert.equal(searchParams(search, true).get("priceMax"), "20000");
  assert.equal(readExplorerView(new URLSearchParams("listing=demo-id")), "map");
  assert.equal(
    readExplorerView(new URLSearchParams("display=garbage")),
    "auto",
  );
});
test("coincident and visually overlapping price markers become one reachable choice", () => {
  const size = () => ({ width: 110, height: 52 });
  const groups = groupMapMarkers(
    [
      { id: "paris", x: 100, y: 100, width: 160, height: 52 },
      { id: "gare-a", x: 200, y: 105, width: 140, height: 52 },
      { id: "gare-b", x: 200, y: 105, width: 140, height: 52 },
      { id: "versailles", x: 400, y: 300, width: 140, height: 52 },
    ],
    size,
  );
  assert.equal(groups.length, 2);
  assert.deepEqual(groups[0].ids, ["paris", "gare-a", "gare-b"]);
  assert.deepEqual(groups[1].ids, ["versailles"]);
});
test("screen-space grouping keeps distant prices separate and includes enlarged labels", () => {
  const point = (id: string, x: number, y: number) => ({
    id,
    x,
    y,
    width: 100,
    height: 44,
  });
  assert.equal(
    groupMapMarkers([point("a", 0, 0), point("b", 130, 0)], () => ({
      width: 110,
      height: 44,
    })).length,
    2,
  );
  const groups = groupMapMarkers(
    [point("a", 0, 0), point("b", 20, 0), point("c", 140, 0)],
    () => ({ width: 190, height: 44 }),
  );
  assert.equal(groups.length, 1);
  assert.equal(groups[0].ids.length, 3);
  assert.equal(
    groupMapMarkers([point("bad", NaN, 0)], () => ({ width: 110, height: 44 }))
      .length,
    0,
  );
});
test("zero rentals with no restrictions do not offer a reset that cannot help", () => {
  const search = {
    ...emptySearch,
    transactionType: "rent" as const,
    sort: "price_asc",
  };
  assert.equal(hasExplorerFilters(search), false);
  assert.deepEqual(resetExplorerFilters(search), {
    ...emptySearch,
    transactionType: "rent",
  });
  for (const field of [
    "city",
    "type",
    "maxPrice",
    "minPrice",
    "minArea",
    "covered",
    "closed",
    "occupancy",
    "level",
    "bbox",
    "radiusKm",
  ] as const) {
    const filtered = { ...search, [field]: "0" };
    assert.equal(
      hasExplorerFilters(filtered),
      true,
      `${field} must be removable even if value is zero`,
    );
    assert.equal(hasExplorerFilters(resetExplorerFilters(filtered)), false);
    assert.equal(resetExplorerFilters(filtered).transactionType, "rent");
  }
  assert.equal(hasExplorerFilters({ ...search, only3D: true }), true);
});
test("recenter uses the available public positions and handles coincident / invalid points", () => {
  const a = [2.3522, 48.8566],
    b = [2.373, 48.845];
  assert.deepEqual(mapResultBounds([a, b]), [
    [2.3522, 48.845],
    [2.373, 48.8566],
  ]);
  assert.deepEqual(mapResultBounds([a, a]), [a, a]);
  assert.deepEqual(
    mapResultBounds([a, [NaN, 48], [2, 100], [4.8357, 45.764]]),
    [a, a],
  );
  assert.equal(mapResultBounds([]), null);
  assert.equal(mapResultBounds([[1], [Infinity, 0]]), null);
});
