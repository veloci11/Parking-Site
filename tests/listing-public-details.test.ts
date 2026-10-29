import { test } from "node:test";
import assert from "node:assert/strict";
import {
  emptyCommercialDetails,
  emptyUnitDetails,
} from "../src/lib/commercial-details";
import {
  hasPublicDetail,
  hasPublicUnitDetails,
  publicCommercialRows,
  publicConditionObservations,
  publicPhotoCaption,
  publicQualityRows,
} from "../src/lib/listing-public-details";
import type { Listing, Quality } from "../src/lib/types";

const quality: Quality = {
  floor: "Non renseigné",
  lighting: "Non renseigné",
  humidity: "Non renseignée",
  access: "À préciser",
  maneuver: "",
  observations: "Résidence récente.",
};
const sample = () =>
  ({
    quality: { ...quality },
    commercialDetails: emptyCommercialDetails(),
    spaces: [{ id: "place-1", number: "27" }],
    spacePhotos: {},
    unitQuality: {},
    type: "covered",
  }) as unknown as Listing;

test("public details omit unknown imported defaults without rewriting owner notes or real observations", () => {
  assert.deepEqual(publicQualityRows(quality), []);
  assert.equal(quality.observations, "Résidence récente.");
  assert.equal(hasPublicDetail(quality.observations), true);
  for (const empty of [
    "",
    "   ",
    "Non renseigné",
    "Non renseignée",
    "Non renseignées",
    "Inconnu",
    "unknown",
    "À préciser",
  ])
    assert.equal(hasPublicDetail(empty), false, empty);
  assert.deepEqual(
    publicQualityRows({
      ...quality,
      humidity: "Traces d’humidité",
      access: "À vérifier sur place",
    }),
    [
      { label: "Humidité", value: "Traces d’humidité" },
      { label: "Accès", value: "À vérifier sur place" },
    ],
  );
});

test("empty commercial sections disappear while zero costs, declared absence and known sources remain", () => {
  const listing = sample();
  assert.deepEqual(publicCommercialRows(listing), []);
  listing.annualChargesCents = 0;
  listing.propertyTaxCents = 12300;
  listing.commercialDetails!.access.gate = "absent";
  listing.commercialDetails!.postalCode = "94430";
  listing.commercialDetails!.chargesSource = {
    year: 2025,
    scope: "par place",
    sourceKind: "seller_declared",
    sourceDocumentIds: ["private-document"],
  };
  const rows = publicCommercialRows(listing);
  assert.deepEqual(
    rows.find((row) => row.label === "Portail"),
    { label: "Portail", value: "Absent · déclaré" },
  );
  assert.match(
    rows.find((row) => row.label === "Charges annuelles")!.value,
    /^0.*2025.*par place.*vendeur/,
  );
  assert.match(
    rows.find((row) => row.label === "Taxe foncière annuelle")!.value,
    /123/,
  );
  assert.doesNotMatch(
    JSON.stringify(rows),
    /inconnu|Non renseign|private-document|Porte/,
  );
});

test("unit sections require actual content and retain unit-specific quality without assigned photos", () => {
  const listing = sample();
  listing.commercialDetails!.units["place-1"] = emptyUnitDetails();
  assert.equal(hasPublicUnitDetails(listing, "place-1"), false);
  listing.unitQuality!["place-1"] = {
    ...quality,
    observations: "Pilier à gauche de cette place.",
  };
  assert.equal(hasPublicUnitDetails(listing, "place-1"), true);
  assert.equal(listing.spacePhotos!["place-1"], undefined);
  delete listing.unitQuality!["place-1"];
  listing.spacePhotos!["place-1"] = ["/api/media/photo"];
  assert.equal(hasPublicUnitDetails(listing, "place-1"), true);
  assert.equal(hasPublicUnitDetails(listing, "another-place"), false);
});

test("public unit dimensions retain known constraints but never include private lot/document identifiers", () => {
  const listing = sample();
  listing.commercialDetails!.units["place-1"] = {
    ...emptyUnitDetails(),
    limitingPoint: "Pilier côté droit",
    dimensionSource: "measured",
    privateLotReference: "private-reference",
    sourceDocumentIds: ["private-document"],
  };
  const rows = publicCommercialRows(listing, "place-1");
  assert.equal(rows.length, 2);
  assert.equal(rows[1].value, "Pilier côté droit");
  assert.doesNotMatch(JSON.stringify(rows), /inconnu|non renseign|private-/i);
});

test("empty photo captions and condition values stay hidden; a standalone comment or evidence is retained", () => {
  const listing = sample(),
    id = "10000000-0000-4000-8000-000000000001",
    url = "/api/media/" + id;
  listing.commercialDetails!.photoMetadata[id] = { caption: "", takenAt: null };
  assert.equal(publicPhotoCaption(listing, url), "");
  listing.commercialDetails!.photoMetadata[id].caption = "Place 27";
  assert.equal(publicPhotoCaption(listing, url), "Place 27");
  listing.conditionObservations = [
    {
      id,
      spaceId: "place-1",
      category: "humidity",
      value: "",
      comment: "Traces sur le mur arrière",
      sourceKind: "seller_declared",
      observedAt: null,
      evidenceMediaIds: [],
      confidenceScope: "unit_declared",
    },
  ];
  assert.equal(publicConditionObservations(listing).length, 0);
  assert.equal(publicConditionObservations(listing, "place-1").length, 1);
  assert.equal(hasPublicUnitDetails(listing, "place-1"), true);
});
