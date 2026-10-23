import { test } from "node:test";
import assert from "node:assert/strict";
import { lotOfferChange } from "../src/lib/listing-price";
import { listingIssues } from "../src/lib/listing-issues";
import type { Listing } from "../src/lib/types";

const lot = {
  city: "Paris",
  district: "Gare de Lyon",
  locationConfirmedAt: "2026-10-22T00:00:00Z",
  transactionType: "sale",
  pricingMode: "lot",
  priceCents: 1850000,
  spaces: [{ id: "18", number: "18", level: -1 }],
  photos: ["a", "b", "c"],
  title: "Place de parking couverte à Paris",
  description:
    "Une place de parking couverte dans une résidence située à Paris. La place est disponible pour une visite sur rendez-vous.",
} as Listing;

test("changing a whole-lot sale to monthly rental asks for a fresh amount before publishing", () => {
  const changed = { ...lot, ...lotOfferChange(lot, "rent") };
  assert.equal(changed.transactionType, "rent");
  assert.equal(changed.priceCents, 0);
  assert.ok(
    listingIssues(changed).some((issue) => issue.field === "listing-price"),
  );
  assert.equal(lot.priceCents, 1850000);
  const rental = { ...changed, priceCents: 20000 };
  assert.equal(
    listingIssues(rental).some((issue) => issue.field === "listing-price"),
    false,
  );
  assert.equal(lotOfferChange(rental, "sale")!.priceCents, 0);
});
test("reselecting the same whole-lot offer preserves its amount, including legacy sales", () => {
  assert.equal(lotOfferChange(lot, "sale")!.priceCents, 1850000);
  assert.equal(
    lotOfferChange(
      { ...lot, transactionType: undefined, pricingMode: undefined },
      "sale",
    )!.priceCents,
    1850000,
  );
  assert.equal(
    lotOfferChange(
      { ...lot, transactionType: "rent", priceCents: 20000 },
      "rent",
    )!.priceCents,
    20000,
  );
});
test("the lot selector cannot overwrite mixed per-place offers", () => {
  const mixed = { ...lot, pricingMode: "per_space" as const };
  assert.equal(lotOfferChange(mixed, "rent"), null);
  assert.equal(mixed.priceCents, lot.priceCents);
});
