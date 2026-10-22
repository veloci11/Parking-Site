import { test } from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ListingCard from "../src/components/ListingCard";
import ListingInspector from "../src/components/ListingInspector";
import PreparationForm from "../src/components/account/preparation";
import {
  ListingOffersTable,
  SpaceOfferSummary,
} from "../src/components/ListingOffers";
import type { Listing, SpaceOffer } from "../src/lib/types";

const listing: Listing = {
  id: "mixed-ad",
  slug: "five-places",
  title: "Cinq places dans une annonce",
  city: "Paris",
  district: "Gare",
  description: "Description",
  pricingMode: "per_space",
  priceCents: 9900000,
  transactionType: "sale",
  type: "covered",
  spaces: [
    { transactionType: "rent", priceCents: 8500, status: "available" },
    { transactionType: "rent", priceCents: 11000, status: "available" },
    { transactionType: "sale", priceCents: 2200000, status: "available" },
    { transactionType: "sale", priceCents: 2400000, status: "available" },
    { transactionType: "sale", priceCents: 2500000, status: "available" },
  ].map((offer, i) => ({
    id: `unit-${i}`,
    number: String(i + 1),
    level: -1,
    areaM2: 12,
    lengthM: 5,
    widthM: 2.4,
    clearanceM: 2.1,
    offer: offer as SpaceOffer,
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
  coordinates: [2.35, 48.85],
  sceneAvailable: false,
  isDemo: true,
  status: "published",
  version: 1,
  sellerName: "Exemple",
  createdAt: "2026-10-21",
  updatedAt: "2026-10-21",
};
test("pre-login preparation defers offer and price choices to each unit after sign-in", () => {
  const copy = text(renderToStaticMarkup(createElement(PreparationForm)));
  assert.match(copy, /Titre provisoire/);
  assert.match(copy, /Nombre de places dans cette annonce/);
  assert.match(copy, /Après connexion, le prix, le choix vente ou location/);
  assert.doesNotMatch(copy, /Type d’offre/);
});
function text(html: string) {
  return html.replace(/<[^>]*>/g, " ").replace(/[\s\u202f\u00a0]+/g, " ");
}
test("one mixed listing card shows only the searched offer price and available count", () => {
  for (const transactionType of ["sale", "rent"] as const) {
    const html = renderToStaticMarkup(
      createElement(ListingCard, {
        listing,
        transactionType,
        favorite: false,
        onSelect() {},
        onFavorite() {},
      }),
    );
    const copy = text(html);
    assert.equal((html.match(/<article/g) || []).length, 1);
    assert.match(copy, /prix par place/);
    assert.doesNotMatch(copy, /99 000|prix du lot|loyer mensuel du lot/);
    if (transactionType === "sale") {
      assert.match(copy, /22 000/);
      assert.match(copy, /3 places disponibles/);
      assert.doesNotMatch(copy, /85 €/);
    } else {
      assert.match(copy, /85 € \/ mois \/ place/);
      assert.match(copy, /2 places disponibles/);
      assert.doesNotMatch(copy, /22 000/);
    }
  }
});
test("inspector follows the searched offer and keeps one listing detail link", () => {
  const html = renderToStaticMarkup(
    createElement(ListingInspector, {
      listing,
      transactionType: "rent",
      onClose() {},
    }),
  );
  assert.match(text(html), /85 € \/ mois \/ place/);
  assert.doesNotMatch(text(html), /99 000|Prix total|Loyer mensuel total/);
  assert.match(html, /annonces\/mixed-ad\/five-places\?transactionType=rent/);
});
test("catalog budget match price and count describe the same matching unit", () => {
  const filtered: Listing = {
    ...listing,
    catalogMatch: {
      transactionType: "rent",
      priceCents: 11000,
      spaceIds: ["unit-1"],
    },
  };
  const html = renderToStaticMarkup(
    createElement(ListingCard, {
      listing: filtered,
      transactionType: "rent",
      favorite: false,
      onSelect() {},
      onFavorite() {},
    }),
  );
  assert.match(text(html), /110 € \/ mois \/ place/);
  assert.match(text(html), /1 place correspondante/);
  assert.doesNotMatch(text(html), /85 €/);
});
test("per-place table preserves all five units, exact offer and individual statuses", () => {
  const edited = {
    ...listing,
    spaces: listing.spaces.map((space, i) => ({
      ...space,
      offer: {
        ...space.offer!,
        status: (
          ["rented", "available", "sold", "reserved", "withdrawn"] as const
        )[i],
      },
    })),
  };
  const html = renderToStaticMarkup(
    createElement(ListingOffersTable, { listing: edited }),
  );
  const copy = text(html);
  assert.equal((html.match(/<tr/g) || []).length, 6);
  for (const label of [
    "Disponible",
    "Réservée",
    "Vendue",
    "Louée",
    "Retirée",
    "85 €",
    "110 €",
    "22 000 €",
    "24 000 €",
    "25 000 €",
  ])
    assert.ok(copy.includes(label), label);
  assert.doesNotMatch(copy, /99 000/);
});
test("selected place summary preserves its own price while legacy lot scope stays explicit", () => {
  const selected = text(
    renderToStaticMarkup(
      createElement(SpaceOfferSummary, { listing, space: listing.spaces[1] }),
    ),
  );
  assert.match(selected, /À louer.*110 € \/ mois \/ place.*Disponible/);
  const legacy = {
    ...listing,
    pricingMode: undefined,
    transactionType: "rent" as const,
    priceCents: 32000,
  };
  assert.match(
    text(
      renderToStaticMarkup(
        createElement(SpaceOfferSummary, {
          listing: legacy,
          space: legacy.spaces[0],
        }),
      ),
    ),
    /320 € \/ mois · lot entier/,
  );
  assert.equal(
    renderToStaticMarkup(
      createElement(ListingOffersTable, { listing: legacy }),
    ),
    "",
  );
});
