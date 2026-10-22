import { test } from "node:test";
import assert from "node:assert/strict";
import {
  wizardIssues,
  wizardStepIssues,
} from "../src/lib/listing-wizard-validation";
import {
  emptyCommercialDetails,
  emptyUnitDetails,
} from "../src/lib/commercial-details";
import type { Listing } from "../src/lib/types";

function listing(): Listing {
  return {
    city: "Paris",
    district: "Secteur de la commune",
    locationConfirmedAt: "2026-10-22T12:00:00Z",
    commercialDetails: { ...emptyCommercialDetails(), postalCode: "75012" },
    type: "covered",
    pricingMode: "per_space",
    spaces: [
      {
        id: "sale",
        number: "18",
        level: -1,
        offer: {
          transactionType: "sale",
          priceCents: 1850000,
          status: "available",
        },
      },
      {
        id: "rent",
        number: "19",
        level: -1,
        offer: {
          transactionType: "rent",
          priceCents: 20000,
          status: "available",
        },
      },
    ],
    photos: ["a", "b", "c"],
    title: "Parking couvert à Paris douzième",
    description:
      "Deux places de stationnement sont proposées dans ce parking couvert : l’une à vendre, l’autre à louer au mois. Visite sur rendez-vous.",
  } as Listing;
}

test("step one reports an unchosen location without leaking photos or copy requirements", () => {
  const draft = listing();
  draft.district = "";
  draft.locationConfirmedAt = null;
  draft.commercialDetails!.postalCode = "";
  draft.photos = [];
  draft.title = "";
  draft.description = "";
  const issues = wizardStepIssues(draft, 0);
  assert.equal(issues.length, 1);
  assert.equal(issues[0].field, "listing-location");
  assert.match(issues[0].message, /choisissez une adresse ou une commune/);
  assert.deepEqual(
    wizardStepIssues(draft, 1).map((issue) => issue.field),
    ["listing-photos", "listing-title", "listing-description"],
  );
  assert.equal(wizardStepIssues(draft, 2).length, 4);
});

test("Continue can confirm a selected location, but jumping to final review cannot bypass confirmation", () => {
  const draft = listing();
  draft.locationConfirmedAt = null;
  assert.deepEqual(wizardStepIssues(draft, 0), []);
  assert.deepEqual(wizardStepIssues(draft, 1), []);
  assert.equal(wizardStepIssues(draft, 2)[0].field, "listing-location");
  assert.equal(wizardStepIssues(draft, 2)[0].confirmationOnly, true);
  draft.locationConfirmedAt = "2026-10-22T12:00:00Z";
  assert.deepEqual(wizardStepIssues(draft, 2), []);
});

test("mixed sale and monthly rent keep separate valid prices and retain per-space guards", () => {
  const draft = listing();
  assert.deepEqual(wizardIssues(draft), []);
  draft.spaces[1].offer!.priceCents = 0;
  assert.ok(
    wizardStepIssues(draft, 0).some((issue) => issue.field === "listing-units"),
  );
  draft.spaces[1].offer!.priceCents = 20000;
  draft.spaces[1].offer!.status = "sold";
  assert.ok(
    wizardStepIssues(draft, 0).some((issue) => issue.field === "listing-units"),
  );
  draft.spaces[1].offer!.status = "rented";
  assert.deepEqual(wizardStepIssues(draft, 0), []);
  draft.spaces[0].offer!.status = "sold";
  assert.ok(
    wizardStepIssues(draft, 0).some((issue) =>
      /au moins une place disponible/.test(issue.message),
    ),
  );
});

test("painted number duplicates are rejected on one floor but allowed on separate levels or when unknown", () => {
  const draft = listing();
  draft.spaces[1].number = " １８ ";
  assert.match(wizardStepIssues(draft, 0)[0].message, /répété au même niveau/);
  draft.spaces[1].level = -2;
  assert.deepEqual(wizardStepIssues(draft, 0), []);
  draft.spaces[0].number = "";
  draft.spaces[1].number = "";
  assert.deepEqual(wizardStepIssues(draft, 0), []);
});

test("optional evidence stays optional, but a claimed source still needs its document at final review", () => {
  const draft = listing();
  draft.commercialDetails!.units.sale = {
    ...emptyUnitDetails(),
    dimensionSource: "plan_derived",
  };
  draft.commercialDetails!.chargesSource = {
    year: 2026,
    scope: "lot",
    sourceKind: "provided_document",
    sourceDocumentIds: [],
  };
  const issues = wizardStepIssues(draft, 2);
  assert.ok(
    issues.some(
      (issue) => issue.field === "listing-unit-details" && issue.step === 0,
    ),
  );
  assert.ok(
    issues.some(
      (issue) => issue.field === "listing-financial" && issue.step === 0,
    ),
  );
});

test("the final checklist catches a missing location selection even when a stale confirmation exists", () => {
  const draft = listing();
  draft.commercialDetails!.postalCode = "";
  assert.equal(wizardStepIssues(draft, 2)[0].field, "listing-location");
  assert.equal(wizardStepIssues(draft, 2)[0].confirmationOnly, undefined);
});

test("typing a new location blocks progression and final submission until a result is chosen or restored", () => {
  const draft = listing();
  assert.deepEqual(wizardIssues(draft), []);
  assert.equal(wizardStepIssues(draft, 0, true)[0].field, "listing-location");
  assert.equal(wizardStepIssues(draft, 2, true)[0].field, "listing-location");
  assert.equal(wizardIssues(draft, true)[0].confirmationOnly, undefined);
  assert.deepEqual(wizardStepIssues(draft, 0, false), []);
  assert.deepEqual(wizardStepIssues(draft, 2, false), []);
});
