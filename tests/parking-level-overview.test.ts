import { test } from "node:test";
import assert from "node:assert/strict";
import { parkingNumbersSummary } from "../src/lib/parking-level-overview";
import {
  parkingListingGroups,
  parkingUnitOnLevel,
} from "../src/lib/parking-lots";
import type { Listing } from "../src/lib/types";

test("ten-place lots retain all actual numbers and navigate each floor without selecting another offer", () => {
  const spaces = Array.from({ length: 10 }, (_, index) => ({
    id: `own-${index}`,
    number: String(18 + index),
    level: index < 4 ? -1 : -2,
    areaM2: 12,
    transactionType: "sale",
    price: 15000,
    status: "available",
  }));
  const listing = {
    id: "own-lot",
    spaces,
    transactionType: "sale",
    saleMode: "per_space",
    price: 15000,
  } as unknown as Listing;
  const lot = parkingListingGroups({ listings: [listing] })[0];
  assert.equal(lot.spaces.length, 10);
  assert.equal(
    parkingNumbersSummary(lot.spaces),
    "Places 18, 19, 20 et 7 autres",
  );
  const ownUnits = spaces.map((space) => ({
    id: space.id,
    listingId: listing.id,
    listingUnitId: space.id,
    space,
  }));
  const units = [
    {
      id: "other",
      listingId: "another",
      listingUnitId: "other",
      space: { ...spaces[4], id: "other", number: "14" },
    },
    ...ownUnits,
  ];
  assert.equal(
    parkingUnitOnLevel(units, -2, lot, listing.id)?.space.number,
    "22",
  );
  assert.equal(
    parkingUnitOnLevel(units, -1, lot, listing.id)?.space.number,
    "18",
  );
  assert.equal(ownUnits.filter((unit) => unit.space.level === -2).length, 6);
  assert.equal(parkingNumbersSummary([]), "Aucune place");
  assert.equal(parkingNumbersSummary([{ number: "" }]), "Place sans numéro");
});
