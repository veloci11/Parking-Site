import { test } from "node:test";
import assert from "node:assert/strict";
import {
  parkingListingGroups,
  preferredParkingLotUnit,
} from "../src/lib/parking-lots";
import type { Listing, Space } from "../src/lib/types";

const sale = (
  id: string,
  level: number,
  status: "available" | "sold" | "reserved",
): Space => ({
  id,
  number: id,
  level,
  areaM2: 12,
  lengthM: 5,
  widthM: 2.4,
  clearanceM: 2.1,
  offer: { transactionType: "sale", priceCents: 2900000, status },
});
function fixture(spaces: Space[]) {
  const listing = {
    id: "listing-A",
    pricingMode: "per_space",
    spaces,
  } as Listing;
  const lot = parkingListingGroups({ listings: [listing] }).find(
    (item) => item.transactionType === "sale",
  )!;
  const units = spaces.map((space) => ({
    id: `physical-${space.id}`,
    listingId: listing.id,
    listingUnitId: space.id,
    space,
  }));
  return { listing, lot, units };
}

test("lot selection opens an available place at the current level before an inactive first place", () => {
  const { lot, units } = fixture([
    sale("18", -1, "sold"),
    sale("19", -2, "available"),
    sale("20", -1, "available"),
  ]);
  assert.equal(preferredParkingLotUnit(lot, units, -1)?.listingUnitId, "20");
});
test("an available place on another level precedes an inactive place on the current level", () => {
  const { lot, units } = fixture([
    sale("18", -1, "reserved"),
    sale("19", -2, "available"),
  ]);
  assert.equal(preferredParkingLotUnit(lot, units, -1)?.listingUnitId, "19");
});
test("a lot without available places remains inspectable at the current level", () => {
  const { lot, units } = fixture([
    sale("18", -2, "sold"),
    sale("19", -1, "reserved"),
  ]);
  assert.equal(preferredParkingLotUnit(lot, units, -1)?.listingUnitId, "19");
});
test("lot selection keeps listing aliases and transaction groups separate", () => {
  const rent: Space = {
    ...sale("21", -1, "available"),
    offer: { transactionType: "rent", priceCents: 16000, status: "available" },
  };
  const { listing, lot, units } = fixture([
    sale("18", -1, "sold"),
    sale("19", -2, "available"),
    rent,
  ]);
  const wrongOwner = {
    ...units[1],
    id: "other-physical",
    listingId: "listing-B",
  };
  const selected = preferredParkingLotUnit(
    lot,
    [wrongOwner, units[2], ...units],
    -1,
  );
  assert.equal(selected?.listingId, listing.id);
  assert.equal(selected?.listingUnitId, "19");
});
test("an available listing unit absent from this canonical parking cannot be selected", () => {
  const { lot, units } = fixture([
    sale("other-parking", -1, "available"),
    sale("18", -1, "sold"),
  ]);
  assert.equal(
    preferredParkingLotUnit(lot, units.slice(1), -1)?.listingUnitId,
    "18",
  );
  assert.equal(preferredParkingLotUnit(lot, [], -1), undefined);
});
