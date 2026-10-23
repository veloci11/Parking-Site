import { after, test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ListingCard from "../src/components/ListingCard";
import {
  favoritesSearchParams,
  loadAllFavoriteOffers,
  showsAllFavoriteOffers,
} from "../src/lib/favorites-search";
import {
  emptySearch,
  readSearch,
  searchParams,
} from "../src/lib/search-client";
import { db, personas, resetDbForTests } from "../src/server/db";
import { handleApi } from "../src/server/api";
import type { Listing, TransactionType } from "../src/lib/types";

const directory = mkdtempSync(join(tmpdir(), "gp-favorites-search-"));
process.env.GP_DATABASE_PATH = join(directory, "test.sqlite");
process.env.GP_FORCE_LOCAL_DEMO = "true";
after(() => {
  resetDbForTests();
  rmSync(directory, { recursive: true, force: true });
});

test("favorites default to both offers; explicit and legacy sale/rent URLs retain their meaning", () => {
  assert.equal(showsAllFavoriteOffers(new URLSearchParams()), true);
  assert.equal(
    showsAllFavoriteOffers(new URLSearchParams("display=map&city=Paris")),
    true,
  );
  for (const transactionType of ["sale", "rent"] as const) {
    const state = {
      ...emptySearch,
      transactionType,
      maxPrice: "200",
      sort: "price_asc",
    };
    const url = favoritesSearchParams(state, false);
    assert.deepEqual(url.getAll("transactionType"), [transactionType]);
    assert.equal(showsAllFavoriteOffers(url), false);
    assert.deepEqual(readSearch(url), state);
  }
  assert.equal(
    showsAllFavoriteOffers(new URLSearchParams("priceMax=20000")),
    false,
  );
  assert.equal(
    showsAllFavoriteOffers(new URLSearchParams("sort=price_asc")),
    false,
  );
  const all = favoritesSearchParams(
    {
      ...emptySearch,
      transactionType: "rent",
      maxPrice: "200",
      sort: "price_asc",
    },
    true,
  );
  assert.equal(all.has("transactionType"), false);
  assert.equal(all.has("priceMax"), false);
  assert.equal(all.has("sort"), false);
  // The home page keeps its existing single-offer default.
  assert.equal(searchParams(emptySearch, true).get("transactionType"), "sale");
});

test("public favorites union includes rent-only offers beyond page 50, deduplicates mixed offers, and retains matching-unit prices", async () => {
  const sql = db();
  const base = JSON.parse(
    String(
      sql.prepare("SELECT draft_json FROM listings LIMIT 1").get()!.draft_json,
    ),
  ) as Listing;
  const insert = (kinds: TransactionType[], publish = true) => {
    const id = randomUUID();
    const value: Listing = {
      ...base,
      id,
      slug: "favori-fictif",
      title: "Favori de recette",
      pricingMode: "per_space",
      transactionType: kinds[0],
      priceCents: kinds[0] === "sale" ? 1850000 : 20000,
      status: publish ? "published" : "draft",
      spaces: kinds.map((transactionType, index) => ({
        ...base.spaces[0],
        id: randomUUID(),
        number: String(18 + index),
        areaM2: transactionType === "sale" ? 12 : 18,
        offer: {
          transactionType,
          priceCents: transactionType === "sale" ? 1850000 : 20000,
          status: "available",
        },
      })),
    };
    sql
      .prepare(
        "INSERT INTO listings(id,seller_id,draft_json,public_json,status,created_at,updated_at,published_at) VALUES(?,?,?,?,?,?,?,?)",
      )
      .run(
        id,
        personas.seller,
        JSON.stringify(value),
        publish ? JSON.stringify(value) : null,
        value.status,
        value.createdAt,
        value.updatedAt,
        value.createdAt,
      );
    return value;
  };
  const rents = Array.from({ length: 51 }, () => insert(["rent"]));
  const sale = insert(["sale"]);
  const mixed = insert(["sale", "rent"]);
  const unpublished = insert(["rent"], false);
  const ids = [...rents, sale, mixed, unpublished].map((listing) => listing.id);
  const requests: string[] = [];
  const request = (url: string) => {
    requests.push(url);
    return handleApi(new Request("http://127.0.0.1" + url));
  };
  const defaultPage = await (
    await request("/api/listings?ids=" + rents[0].id)
  ).json();
  assert.equal(defaultPage.total, 0, "the public API itself defaults to sale");
  requests.length = 0;
  const listings = await loadAllFavoriteOffers(emptySearch, ids, request);
  assert.equal(listings.length, 53);
  assert.equal(new Set(listings.map((listing) => listing.id)).size, 53);
  assert.ok(
    rents.every((rent) => listings.some((listing) => listing.id === rent.id)),
  );
  assert.ok(!listings.some((listing) => listing.id === unpublished.id));
  assert.ok(
    requests.some((url) => url.includes("cursor=")),
    "the rental page must be exhausted",
  );
  const mixedResult = listings.find((listing) => listing.id === mixed.id)!;
  assert.equal(mixedResult.spaces.length, 2);
  const card = (listing: Listing) =>
    renderToStaticMarkup(
      createElement(ListingCard, {
        listing,
        favorite: true,
        onSelect() {},
        onFavorite() {},
      }),
    )
      .replace(/<[^>]+>/g, " ")
      .replace(/[\s\u202f\u00a0]+/g, " ");
  assert.match(
    card(mixedResult),
    /Vente dès 18 500 € \/ place · Location dès 200 € \/ mois \/ place/,
  );
  assert.match(
    card(listings.find((listing) => listing.id === rents[0].id)!),
    /200 € \/ mois \/ place/,
  );
  const areaFiltered = await loadAllFavoriteOffers(
    { ...emptySearch, minArea: "16" },
    [mixed.id, sale.id],
    request,
  );
  assert.equal(areaFiltered.length, 1);
  assert.equal(areaFiltered[0].spaces.length, 1);
  assert.equal(areaFiltered[0].spaces[0].number, "19");
  assert.match(card(areaFiltered[0]), /200 € \/ mois \/ place/);
  assert.doesNotMatch(card(areaFiltered[0]), /18 500/);
  for (const transactionType of ["sale", "rent"] as const) {
    const params = favoritesSearchParams(
      { ...emptySearch, transactionType },
      false,
    );
    params.set("ids", [sale.id, rents[0].id, mixed.id].join(","));
    const result = await (await request("/api/listings?" + params)).json();
    assert.equal(result.total, 2);
    assert.ok(
      result.data.every(
        (listing: Listing) =>
          listing.catalogMatch?.transactionType === transactionType,
      ),
    );
  }
});
