import { test } from "node:test";
import assert from "node:assert/strict";
import { listingIssues } from "../src/lib/listing-issues";
import {
  emptyCommercialDetails,
  emptyUnitDetails,
} from "../src/lib/commercial-details";
import type { Listing } from "../src/lib/types";
test("submission guidance preserves unknown dimensions, optional painted numbers and scope-specific evidence", () => {
  const listing = {
    city: "Paris",
    district: "Gare de Lyon · 12e",
    locationConfirmedAt: "2026-10-21T12:00:00Z",
    type: "covered",
    spaces: [
      {
        id: "unit",
        number: "",
        level: 0,
        areaM2: null,
        lengthM: null,
        widthM: null,
        clearanceM: null,
      },
    ],
    photos: ["a", "b", "c"],
    priceCents: 1850000,
    title: "Une place de parking à découvrir",
    description:
      "Description factuelle du parking, de ses accès et des contraintes connues. Les dimensions inconnues restent à relever pendant la visite.",
  } as Listing;
  assert.deepEqual(listingIssues(listing), []);
  const details = emptyCommercialDetails();
  details.units.unit = {
    ...emptyUnitDetails(),
    dimensionSource: "plan_derived",
  };
  assert.equal(
    listingIssues({ ...listing, commercialDetails: details })[0].step,
    2,
  );
  const mixed = { ...listing, type: "mixed" as const };
  assert.match(listingIssues(mixed)[0].message, /deux places/);
  const incomplete = {
    ...listing,
    title: "Bref",
    locationConfirmedAt: null,
    description: "",
    photos: [],
  };
  assert.deepEqual(
    listingIssues(incomplete).map((v) => v.field),
    [
      "location-confirmed",
      "listing-photos",
      "listing-title",
      "listing-description",
    ],
  );
});
