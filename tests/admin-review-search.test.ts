import test from "node:test";
import assert from "node:assert/strict";
import { filterAdminReviewItems } from "../src/lib/admin-review-search";

const listings = [
  {
    id: "listing-one",
    title: "Box fermé",
    city: "Chennevières-sur-Marne",
    district: "Centre",
    sellerName: "Mathis",
  },
  {
    id: "listing-two",
    title: "Parking 100% couvert",
    city: "Paris",
    sellerName: "Émilie",
  },
];

test("admin can find a dossier by city, owner, title or exact ID across accents", () => {
  assert.deepEqual(filterAdminReviewItems(listings, " chennevieres MATHIS "), [
    listings[0],
  ]);
  assert.deepEqual(filterAdminReviewItems(listings, "emilie couvert"), [
    listings[1],
  ]);
  assert.deepEqual(filterAdminReviewItems(listings, "listing-two"), [
    listings[1],
  ]);
  assert.deepEqual(filterAdminReviewItems(listings, "centre ferme"), [
    listings[0],
  ]);
});

test("admin search keeps literal punctuation and original order without matching all", () => {
  assert.deepEqual(filterAdminReviewItems(listings, "%"), [listings[1]]);
  assert.deepEqual(filterAdminReviewItems(listings, ".*"), []);
  assert.deepEqual(filterAdminReviewItems(listings, "Paris Mathis"), []);
  assert.equal(filterAdminReviewItems(listings, "  "), listings);
});
