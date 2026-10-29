import test from "node:test";
import assert from "node:assert/strict";
import {
  coordinateTuple,
  emptySearch,
  readSearch,
  searchParams,
  searchProblem,
} from "../src/lib/search-client";
test("URL partageable conserve tous filtres et transforme euros seulement pour API", () => {
  const state = {
    ...emptySearch,
    city: "Paris Gare de Lyon",
    type: "box",
    minPrice: "18000.25",
    maxPrice: "40000",
    minArea: "12",
    minSpaces: "2",
    sellerType: "professional",
    only3D: true,
    sort: "spaces_desc",
    covered: "1",
    closed: "1",
    occupancy: "unknown",
    level: "-2",
    center: "2.37,48.84",
    radiusKm: "2.5",
  };
  const url = searchParams(state);
  assert.equal(url.get("priceMin"), "18000.25");
  assert.deepEqual(readSearch(url), state);
  assert.equal(
    readSearch(searchParams({ ...state, type: "mixed" })).type,
    "mixed",
  );
  const rent = { ...state, transactionType: "rent" as const, maxPrice: "150" };
  assert.deepEqual(readSearch(searchParams(rent)), rent);
  assert.equal(searchParams(rent, true).get("transactionType"), "rent");
  assert.equal(searchParams(rent, true).get("priceMax"), "15000");
  const api = searchParams(state, true);
  assert.equal(api.get("priceMin"), "1800025");
  assert.equal(api.get("priceMax"), "4000000");
  assert.equal(api.get("q"), state.city);
  assert.equal(api.get("city"), null);
  for (const key of [
    "covered",
    "closed",
    "occupancy",
    "level",
    "center",
    "radiusKm",
    "sort",
    "minSpaces",
    "sellerType",
  ] as const)
    assert.equal(api.get(key), state[key]);
});
test("zone et niveau zéro survivent au retour et restent identiques pour pagination", () => {
  const state = {
    ...emptySearch,
    bbox: "4,45,5,46",
    level: "0",
    covered: "0",
    closed: "0",
    sort: "area_asc",
  };
  const browser = searchParams(state);
  assert.deepEqual(readSearch(browser), state);
  const first = searchParams(state, true),
    next = searchParams(state, true);
  next.set("cursor", "opaque");
  next.delete("cursor");
  assert.equal(first.toString(), next.toString());
  assert.equal(searchParams(emptySearch).toString(), "");
  assert.equal(readSearch(new URLSearchParams()).radiusKm, "");
});
test("liens invalides ne créent ni rayon sans centre ni géométrie invalide", () => {
  for (const raw of ["180.1,45", "4,91", "4,", "x,45"])
    assert.equal(coordinateTuple(raw, 2), null);
  for (const raw of ["5,45,4,46", "4,46,5,45", "-181,45,5,46"])
    assert.equal(coordinateTuple(raw, 4), null);
  const invalid = readSearch(
    new URLSearchParams(
      "type=alien&level=3.5&sort=other&radiusKm=2&center=4,91&bbox=5,46,4,45",
    ),
  );
  assert.equal(invalid.type, "");
  assert.equal(invalid.level, "");
  assert.equal(invalid.sort, "recent");
  assert.equal(invalid.radiusKm, "");
  assert.equal(invalid.bbox, "");
  const radius = readSearch(
    new URLSearchParams("bbox=4,45,5,46&center=4.5,45.5&radiusKm=2"),
  );
  assert.equal(radius.bbox, "");
  assert.equal(radius.center, "4.5,45.5");
  assert.ok(
    searchProblem({ ...emptySearch, minPrice: "20000", maxPrice: "10000" }),
  );
  assert.ok(searchProblem({ ...emptySearch, level: "-21" }));
  for (const minSpaces of ["0", "501", "2.5", "no"])
    assert.ok(searchProblem({ ...emptySearch, minSpaces }));
  assert.ok(searchProblem({ ...emptySearch, sellerType: "agency" }));
  assert.equal(
    readSearch(new URLSearchParams("minSpaces=2.5&sellerType=agency"))
      .minSpaces,
    "",
  );
  assert.equal(
    readSearch(new URLSearchParams("minSpaces=2.5&sellerType=agency"))
      .sellerType,
    "",
  );
  assert.ok(
    searchProblem({ ...emptySearch, radiusKm: "0.01", center: "4,45" }),
  );
});
