import { after, test } from "node:test";
import assert from "node:assert/strict";
import type { Listing, SpaceOffer } from "../src/lib/types";
import { emptySearch } from "../src/lib/search-client";
import {
  hasExplorerFilters,
  explorerOfferFilterKey,
} from "../src/lib/explorer-search";
import { publicShowcaseListings } from "../src/server/public-showcase";
import {
  matchesPageFilters,
  paginatePublicListings,
  parsePageQuery,
} from "../src/server/pagination";

const previousShowcase = process.env.GP_PUBLIC_SHOWCASE;
process.env.GP_PUBLIC_SHOWCASE = "true";
after(() => {
  if (previousShowcase === undefined) delete process.env.GP_PUBLIC_SHOWCASE;
  else process.env.GP_PUBLIC_SHOWCASE = previousShowcase;
});
const filters = (query: string) =>
  parsePageQuery(new URL("https://example.test/api/listings?" + query)).filters;

function mixedOffers(): Listing {
  const base = publicShowcaseListings()[0];
  const offers: SpaceOffer[] = [
    { transactionType: "sale", priceCents: 1000000, status: "available" },
    { transactionType: "sale", priceCents: 2000000, status: "available" },
    { transactionType: "sale", priceCents: 500000, status: "reserved" },
    { transactionType: "rent", priceCents: 10000, status: "available" },
    { transactionType: "sale", priceCents: 3000000, status: "available" },
  ];
  return {
    ...base,
    pricingMode: "per_space",
    sellerTypeSnapshot: "private",
    spaces: offers.map((offer, index) => ({
      ...base.spaces[0],
      id: `unit-${index}`,
      number: String(index + 1),
      level: index === 4 ? -2 : -1,
      areaM2: index === 0 ? 12 : 16,
      offer,
    })),
  };
}

test("minimum spaces counts only available offers satisfying the same sale, price, area and level criteria", () => {
  const item = mixedOffers();
  assert.equal(
    matchesPageFilters(
      item,
      filters("minSpaces=2&priceMax=2500000&level=-1&sellerType=private"),
    ),
    true,
  );
  for (const query of [
    "minSpaces=3&level=-1",
    "minSpaces=2&priceMax=1500000",
    "minSpaces=2&areaMin=15&level=-1",
    "minSpaces=2&transactionType=rent",
    "minSpaces=2&sellerType=professional",
  ])
    assert.equal(matchesPageFilters(item, filters(query)), false, query);
  const result = paginatePublicListings(
    [item],
    filters("minSpaces=2&priceMax=2500000"),
    1,
    null,
  );
  assert.equal(result.total, 1);
  assert.deepEqual(result.items[0].catalogMatch?.spaceIds, [
    "unit-0",
    "unit-1",
  ]);
});

test("whole-lot demos retain the entire offered lot and do not invent an unknown seller type", () => {
  const source = publicShowcaseListings();
  const result = paginatePublicListings(
    source,
    filters("minSpaces=2"),
    1,
    null,
  );
  assert.equal(result.total, 1);
  assert.equal(result.items[0].spaces.length, 2);
  assert.equal(
    paginatePublicListings(source, filters("sellerType=private"), 1, null)
      .total,
    0,
  );
  assert.equal(
    paginatePublicListings(source, filters("sellerType=professional"), 1, null)
      .total,
    0,
  );
});

test("new criteria participate in reset availability and stale-results isolation", () => {
  for (const change of [{ minSpaces: "2" }, { sellerType: "professional" }]) {
    const state = { ...emptySearch, ...change };
    assert.equal(hasExplorerFilters(state), true);
    assert.notEqual(
      explorerOfferFilterKey(state),
      explorerOfferFilterKey(emptySearch),
    );
  }
});
