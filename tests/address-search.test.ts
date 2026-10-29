import { test } from "node:test";
import assert from "node:assert/strict";
import {
  locationFromSuggestion,
  municipalitySuggestions,
  parseAddressSuggestions,
} from "../src/lib/address-search";
import { searchAddresses } from "../src/server/address-search";
import { idfListingProblem } from "../src/lib/paris-region";
import { emptyCommercialDetails } from "../src/lib/commercial-details";
import type { Listing } from "../src/lib/types";

const paris = {
  type: "Feature",
  geometry: { type: "Point", coordinates: [2.385158, 48.836409] },
  properties: {
    id: "fixture-address",
    label: "20 Rue de Bercy 75012 Paris",
    city: "Paris",
    postcode: "75012",
    type: "housenumber",
    district: "Paris 12e Arrondissement",
  },
};
const listing = {
  city: "",
  district: "",
  address: "",
  coordinates: [0, 0],
  locationPrecision: "area",
  sceneAvailable: false,
  commercialDetails: emptyCommercialDetails(),
} as Listing;

test("address lookup accepts only coherent IDF results and treats service properties as data", () => {
  const result = parseAddressSuggestions({
    features: [
      paris,
      { ...paris, geometry: { type: "Point", coordinates: [4.85, 45.76] } },
      { ...paris, properties: { ...paris.properties, postcode: "92100" } },
      null,
    ],
  });
  assert.equal(result.length, 1);
  assert.equal(result[0].city, "Paris");
  assert.deepEqual(parseAddressSuggestions({ features: "bad" }), []);
  assert.equal(municipalitySuggestions("75012")[0].postalCode, "75012");
  assert.deepEqual(municipalitySuggestions("Lyon"), []);
});

test("sector mode never persists the looked-up exact address/point; precise mode requires an address result", () => {
  const suggestion = parseAddressSuggestions({ features: [paris] })[0];
  const approximate = {
    ...listing,
    ...locationFromSuggestion(suggestion, false, listing),
  };
  assert.equal(approximate.address, "");
  assert.equal(approximate.locationPrecision, "area");
  assert.notDeepEqual(approximate.coordinates, suggestion.coordinates);
  assert.deepEqual(approximate.coordinates, approximate.publicCoordinates);
  assert.equal(idfListingProblem(approximate, true), null);
  const exact = locationFromSuggestion(suggestion, true, listing);
  assert.equal(exact.address, suggestion.label);
  assert.deepEqual(exact.coordinates, suggestion.coordinates);
  assert.equal(exact.locationPrecision, "exact_opt_in");
  const commune = locationFromSuggestion(
    municipalitySuggestions("Montreuil")[0],
    true,
    listing,
  );
  assert.equal(commune.locationPrecision, "area");
  assert.equal(commune.address, "");
});

test("geocoder outages preserve local municipality search and never invent street coordinates", async () => {
  const fallback = await searchAddresses("Montreuil", async () => {
    throw new Error("offline");
  });
  assert.equal(fallback.addressSearchAvailable, false);
  assert.ok(fallback.data.length);
  assert.ok(fallback.data.every((result) => result.kind === "municipality"));
  let target = "";
  const success = await searchAddresses(
    "20 rue de Bercy Paris",
    async (url) => {
      target = String(url);
      return Response.json({ features: [paris] });
    },
  );
  assert.match(target, /^https:\/\/data\.geopf\.fr\/geocodage\/search\?/);
  assert.equal(success.data[0].id, "fixture-address");
  assert.equal(success.addressSearchAvailable, true);
});

test("a postal code typed with a city is preserved and excludes a different district from the provider", async () => {
  assert.equal(municipalitySuggestions("Paris 75012")[0]?.postalCode, "75012");
  const result = await searchAddresses("Paris 75012", async () =>
    Response.json({
      features: [
        {
          ...paris,
          properties: {
            ...paris.properties,
            label: "Paris",
            postcode: "75001",
            type: "municipality",
          },
        },
        paris,
      ],
    }),
  );
  assert.ok(result.data.length > 0);
  assert.ok(
    result.data.every((suggestion) => suggestion.postalCode === "75012"),
  );
  assert.ok(
    result.data.some(
      (suggestion) =>
        suggestion.kind === "municipality" &&
        suggestion.label.includes("75012"),
    ),
  );
});
