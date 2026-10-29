import { test } from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ListingCard from "../src/components/ListingCard";
import ListingInspector from "../src/components/ListingInspector";
import { catalogOfferMatch } from "../src/lib/listing-price";
import {
  emptySearch,
  readSearch,
  searchParams,
} from "../src/lib/search-client";
import type { Listing, SpaceOffer } from "../src/lib/types";
import {
  decodeCursor,
  encodeCursor,
  parsePageQuery,
} from "../src/server/pagination";

const listing: Listing = {
  id: "a0000000-0000-4000-8000-000000000001",
  slug: "offres-par-place",
  title: "Offres distinctes dans un parking",
  city: "Paris",
  district: "Recette fictive",
  description: "Parking de recette, sans annonce réelle.",
  pricingMode: "per_space",
  priceCents: 1000000,
  transactionType: "sale",
  type: "covered",
  spaces: [
    [8, "sale", 1000000, "available"],
    [12, "rent", 9000, "reserved"],
    [18, "rent", 19000, "available"],
    [20, "rent", 22000, "available"],
    [null, "rent", 30000, "available"],
  ].map(([areaM2, transactionType, priceCents, status], index) => ({
    id: `public-unit-${index + 1}`,
    number: String(index + 1),
    level: -1,
    areaM2: areaM2 as number | null,
    lengthM: null,
    widthM: null,
    clearanceM: null,
    offer: { transactionType, priceCents, status } as SpaceOffer,
  })),
  photos: ["/demo/covered.png"],
  quality: {
    floor: "",
    lighting: "",
    humidity: "",
    access: "",
    maneuver: "",
    observations: "",
  },
  locationPrecision: "area",
  coordinates: [2.37, 48.84],
  sceneAvailable: false,
  isDemo: true,
  status: "published",
  version: 1,
  sellerName: "Recette fictive",
  createdAt: "2026-10-22T10:00:00.000Z",
  updatedAt: "2026-10-22T10:00:00.000Z",
};
const copy = (html: string) =>
  html.replace(/<[^>]*>/g, " ").replace(/[\s\u202f\u00a0]+/g, " ");
const render = (value: Listing, transactionType: "sale" | "rent") => [
  copy(
    renderToStaticMarkup(
      createElement(ListingCard, {
        listing: value,
        transactionType,
        favorite: false,
        onSelect() {},
        onFavorite() {},
      }),
    ),
  ),
  copy(
    renderToStaticMarkup(
      createElement(ListingInspector, {
        listing: value,
        transactionType,
        onClose() {},
      }),
    ),
  ),
];

test("shared rent filters match one available place; card and inspector describe that place's price and area", () => {
  const state = {
    ...emptySearch,
    transactionType: "rent" as const,
    minPrice: "150",
    maxPrice: "200",
    minArea: "16",
    level: "-1",
    sort: "price_asc",
  };
  const restored = readSearch(searchParams(state));
  const api = searchParams(restored, true);
  assert.deepEqual(api.getAll("transactionType"), ["rent"]);
  const { filters } = parsePageQuery(
    new URL("http://localhost/api/listings?" + api),
  );
  const match = catalogOfferMatch(listing, filters)!;
  assert.deepEqual(match.spaceIds, ["public-unit-3"]);
  assert.equal(match.priceCents, 19000);
  const result = {
    ...listing,
    catalogMatch: { ...match, transactionType: "rent" as const },
  };
  for (const text of render(result, "rent")) {
    assert.match(text, /190 € \/ mois \/ place/);
    assert.match(text, /18 m²/);
    assert.doesNotMatch(text, /8–20|surfaces renseignées/);
  }
  assert.match(render(result, "rent")[0], /1 place correspondante/);
});

test("without a search match, sale summaries exclude rental and inactive unit surfaces while lots retain all units", () => {
  for (const text of render(listing, "sale")) {
    assert.match(text, /10 000/);
    assert.match(text, /8 m²/);
    assert.doesNotMatch(text, /8–20|surfaces renseignées/);
  }
  const lot: Listing = {
    ...listing,
    pricingMode: "lot",
    spaces: listing.spaces.slice(0, 2).map(({ offer, ...space }) => space),
  };
  for (const text of render(lot, "sale")) assert.match(text, /8–12 m²/);
});

test("price-position cursor keeps its matching offer context and rejects a changed transaction or budget", () => {
  const filters = parsePageQuery(
    new URL(
      "http://localhost/api/listings?transactionType=rent&priceMin=15000&priceMax=20000&areaMin=16&sort=price_asc",
    ),
  ).filters;
  const asOf = new Date().toISOString();
  const position = {
    version: 2 as const,
    asOf,
    after: {
      id: listing.id,
      createdAt: listing.createdAt,
      priceCents: 19000,
      areaM2: 18,
      spaceCount: 1,
    },
  };
  const cursor = encodeCursor(position, filters);
  assert.deepEqual(decodeCursor(cursor, filters)?.after, position.after);
  assert.throws(() =>
    decodeCursor(cursor, { ...filters, transactionType: "sale" }),
  );
  assert.throws(() => decodeCursor(cursor, { ...filters, maxPrice: 22000 }));
});
