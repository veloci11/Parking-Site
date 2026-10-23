import { test } from "node:test";
import assert from "node:assert/strict";
import type { Listing } from "../src/lib/types";
import {
  emptySearch,
  readSearch,
  searchParams,
  searchProblem,
} from "../src/lib/search-client";
import {
  hasExplorerFilters,
  explorerOfferFilterKey,
} from "../src/lib/explorer-search";
import {
  canonicalFilters,
  decodeCursor,
  matchesPageFilters,
  paginatePublicListings,
  parsePageQuery,
} from "../src/server/pagination";

const filters = (query: string) =>
  parsePageQuery(new URL("https://example.test/api/listings?" + query)).filters;

function listing(
  id: string,
  annualChargesCents?: number | null,
  propertyTaxCents?: number | null,
): Listing {
  return {
    id,
    title: "Parking Paris",
    city: "Paris",
    district: "Centre",
    slug: "parking-paris",
    description: "Parking couvert",
    type: "covered",
    transactionType: "sale",
    pricingMode: "lot",
    priceCents: 1500000,
    annualChargesCents,
    propertyTaxCents,
    coordinates: [2.35, 48.85],
    spaces: [
      {
        id: `${id}-space`,
        number: "12",
        level: -1,
        areaM2: 12,
        widthM: null,
        lengthM: null,
        clearanceM: null,
      },
    ],
    photos: [],
    sceneAvailable: false,
    isDemo: false,
    quality: {
      floor: "Bon",
      lighting: "Bon",
      humidity: "Aucune",
      access: "Portail",
      maneuver: "Simple",
      observations: "",
    },
    locationPrecision: "area",
    sellerName: "Propriétaire",
    status: "published",
    createdAt: "2026-01-01T12:00:00.000Z",
    updatedAt: "2026-01-01T12:00:00.000Z",
    version: 1,
  };
}

test("annual cost filters survive shared URLs, convert EUR once, and accept a zero ceiling", () => {
  const state = {
    ...emptySearch,
    annualChargesMax: "250.25",
    propertyTaxMax: "0",
  };
  assert.deepEqual(readSearch(searchParams(state)), state);
  assert.equal(searchParams(state, true).get("annualChargesMax"), "25025");
  assert.equal(searchParams(state, true).get("propertyTaxMax"), "0");
  assert.equal(searchProblem(state), "");
  assert.equal(hasExplorerFilters(state), true);
  assert.notEqual(
    explorerOfferFilterKey(state),
    explorerOfferFilterKey(emptySearch),
  );
  for (const value of ["-1", "1000001", "NaN", "1.005"])
    assert.ok(searchProblem({ ...emptySearch, annualChargesMax: value }));
  assert.equal(
    readSearch(new URLSearchParams("propertyTaxMax=1.005")).propertyTaxMax,
    "",
  );
});

test("unknown annual costs are preserved without filters and excluded only by active ceilings", () => {
  const unknown = listing("00000000-0000-4000-8000-000000000001");
  const declaredZero = listing("00000000-0000-4000-8000-000000000002", 0, 0);
  const known = listing("00000000-0000-4000-8000-000000000003", 25025, 12000);
  assert.equal(matchesPageFilters(unknown, filters("")), true);
  assert.equal(
    matchesPageFilters(unknown, filters("annualChargesMax=0")),
    false,
  );
  assert.equal(
    matchesPageFilters(unknown, filters("propertyTaxMax=50000")),
    false,
  );
  assert.equal(
    matchesPageFilters(
      declaredZero,
      filters("annualChargesMax=0&propertyTaxMax=0"),
    ),
    true,
  );
  assert.equal(
    matchesPageFilters(
      known,
      filters("annualChargesMax=25025&propertyTaxMax=12000"),
    ),
    true,
  );
  assert.equal(
    matchesPageFilters(known, filters("annualChargesMax=25024")),
    false,
  );
  assert.equal(
    matchesPageFilters(known, filters("propertyTaxMax=11999")),
    false,
  );
  const result = paginatePublicListings(
    [unknown, declaredZero, known],
    filters("annualChargesMax=25025&propertyTaxMax=12000"),
    1,
    null,
  );
  assert.equal(result.total, 2);
  assert.equal(result.items.length, 1);
  assert.ok(result.nextCursor);
  assert.ok(
    decodeCursor(
      result.nextCursor,
      filters("annualChargesMax=25025&propertyTaxMax=12000"),
    ),
  );
  assert.throws(() =>
    decodeCursor(
      result.nextCursor,
      filters("annualChargesMax=25024&propertyTaxMax=12000"),
    ),
  );
});

test("API rejects duplicate, fractional, negative and excessive annual ceilings", () => {
  for (const query of [
    "annualChargesMax=-1",
    "propertyTaxMax=100000001",
    "annualChargesMax=1.5",
    "propertyTaxMax=NaN",
    "annualChargesMax=0&annualChargesMax=1",
    "propertyTaxMax=0&propertyTaxMax=1",
  ])
    assert.throws(() => filters(query), query);
  assert.equal(canonicalFilters(filters("")).annualChargesMax, null);
  assert.equal(canonicalFilters(filters("")).propertyTaxMax, null);
});
