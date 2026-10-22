import { after, test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import type { Listing, Space, SpaceOffer } from "../src/lib/types";
import {
  availableOffers,
  catalogOfferMatch,
  listingPrice,
  normalizeListingOffers,
  offerLabel,
  spaceOfferPrice,
} from "../src/lib/listing-price";
import { listingIssues } from "../src/lib/listing-issues";
import { emptyCommercialDetails } from "../src/lib/commercial-details";
import { draftSchema } from "../src/server/validation";
import { db, personas, resetDbForTests } from "../src/server/db";
import { handleApi } from "../src/server/api";
import { sessionCookie } from "../src/server/security";
import { linkTestListing } from "./helpers/registry";
const dir = mkdtempSync(join(tmpdir(), "gp-per-space-"));
process.env.GP_DATABASE_PATH = join(dir, "db.sqlite");
process.env.GP_FORCE_LOCAL_DEMO = "true";
process.env.GP_LOCAL_DEMO = "true";
after(() => {
  resetDbForTests();
  rmSync(dir, { recursive: true, force: true });
});
const offers: SpaceOffer[] = [
  { transactionType: "sale", priceCents: 3000000, status: "available" },
  { transactionType: "sale", priceCents: 2000000, status: "reserved" },
  { transactionType: "sale", priceCents: 4000000, status: "available" },
  { transactionType: "rent", priceCents: 10000, status: "available" },
  { transactionType: "rent", priceCents: 15000, status: "available" },
];
const places = (): Space[] =>
  offers.map((offer, i) => ({
    id: randomUUID(),
    number: String(12 + i),
    level: i === 2 || i === 4 ? -2 : -1,
    areaM2: [12, 15, 16, 11, 20][i],
    lengthM: 5,
    widthM: 2.4,
    clearanceM: 2.1,
    offer: { ...offer },
  }));
function example(): Listing {
  const row = db()
    .prepare(
      "SELECT public_json FROM listings WHERE id='10000000-0000-4000-8000-000000000001'",
    )
    .get()!;
  const listing = JSON.parse(String(row.public_json)) as Listing;
  return {
    ...listing,
    pricingMode: "per_space",
    spaces: places(),
    priceCents: 999999999,
    transactionType: "rent",
  };
}
async function api(
  path: string,
  method = "GET",
  value?: unknown,
  cookie?: string,
) {
  const response = await handleApi(
    new Request("http://127.0.0.1:3000/api/" + path, {
      method,
      headers: {
        origin: "http://127.0.0.1:3000",
        "Content-Type": "application/json",
        ...(cookie ? { cookie } : {}),
      },
      body: value ? JSON.stringify(value) : undefined,
    }),
  );
  return { status: response.status, ...(await response.json()) };
}
test("one listing offers three sales and two rents without summing currencies/periods or advertising inactive prices", () => {
  const listing = normalizeListingOffers(example());
  assert.equal(listing.transactionType, "sale");
  assert.equal(listing.priceCents, 3000000);
  assert.equal(availableOffers(listing, "sale").length, 2);
  assert.equal(availableOffers(listing, "rent").length, 2);
  assert.equal(offerLabel(listing), "À vendre et à louer");
  assert.match(listingPrice(listing), /Vente.*30.*000.*Location.*100.*mois/);
  assert.doesNotMatch(listingPrice(listing, "sale"), /20.*000/);
  assert.match(spaceOfferPrice(listing, listing.spaces[3]), /100.*mois.*place/);
  const legacy = {
    ...listing,
    pricingMode: undefined,
    spaces: listing.spaces.map(({ offer, ...s }) => s),
    priceCents: 5000000,
    transactionType: "sale" as const,
  };
  assert.match(
    spaceOfferPrice(legacy, legacy.spaces[0]),
    /50.*000.*lot entier/,
  );
  assert.equal(normalizeListingOffers(legacy).priceCents, 5000000);
});
test("strict drafts reject offer injection and impossible statuses; final guidance requires every price and an available place", () => {
  assert.equal(
    draftSchema.safeParse({ pricingMode: "per_space", spaces: places() })
      .success,
    true,
  );
  for (const offer of [
    { ...offers[0], status: "rented" },
    { ...offers[3], status: "sold" },
    { ...offers[0], priceCents: 0.5 },
    { ...offers[0], ownerId: personas.seller },
    { ...offers[0], status: null },
  ])
    assert.equal(
      draftSchema.safeParse({
        pricingMode: "per_space",
        spaces: [{ ...places()[0], offer }],
      }).success,
      false,
    );
  assert.equal(
    draftSchema.safeParse({
      catalogMatch: { transactionType: "sale", priceCents: 1, spaceIds: [] },
    }).success,
    false,
  );
  const l = example();
  l.spaces = l.spaces.map((s) => ({
    ...s,
    offer: { ...s.offer!, status: "withdrawn" },
  }));
  assert.ok(
    listingIssues(l).some(
      (i) => i.field === "listing-units" && i.message.includes("disponible"),
    ),
  );
  l.spaces[0].offer!.priceCents = 0;
  assert.ok(
    listingIssues(l).some(
      (i) => i.field === "listing-units" && i.message.includes("prix positif"),
    ),
  );
  assert.ok(
    !listingIssues(l).some(
      (i) => i.field === "listing-price" && i.message.includes("lot entier"),
    ),
  );
});
test("all unit filters share one available offer; contextual display uses the matching price", () => {
  const listing = example();
  listing.type = "mixed";
  listing.commercialDetails = {
    ...emptyCommercialDetails(),
    postalCode: "75012",
    units: Object.fromEntries(
      listing.spaces.map((s, i) => [
        s.id,
        {
          type: ["covered", "box", "covered", "outdoor", "box"][i],
          levelLabel: "",
          dimensionSource: "unknown",
          dimensionObservedAt: null,
          limitingPoint: "",
        },
      ]),
    ),
  } as Listing["commercialDetails"];
  assert.equal(
    catalogOfferMatch(listing, {
      transactionType: "rent",
      maxPrice: 12000,
      minArea: 15,
    }),
    null,
    "cheap unit and large unit must not satisfy opposite filters",
  );
  assert.equal(
    catalogOfferMatch(listing, { transactionType: "sale", maxPrice: 2500000 }),
    null,
    "reserved unit is not searchable",
  );
  const match = catalogOfferMatch(listing, {
    transactionType: "rent",
    minPrice: 12000,
    minArea: 15,
    closed: true,
    level: -2,
  })!;
  assert.equal(match.priceCents, 15000);
  assert.deepEqual(match.spaceIds, [listing.spaces[4].id]);
  assert.match(
    listingPrice(
      { ...listing, catalogMatch: { ...match, transactionType: "rent" } },
      "rent",
    ),
    /150.*mois.*place/,
  );
});
test("per-place offers survive public aliases and are changed only through a new moderated revision; catalog keysets use matching prices", async () => {
  const seller = sessionCookie(personas.seller),
    moderator = sessionCookie(personas.moderator),
    spaces = places();
  const input = {
    pricingMode: "per_space",
    transactionType: "rent",
    priceCents: 999999999,
    title: "Cinq places en vente et location mensuelle",
    description:
      "Description documentaire des places, des accès et des dimensions. ".repeat(
        4,
      ),
    city: "Paris",
    district: "Gare de Lyon",
    coordinates: [2.3739, 48.8446],
    commercialDetails: { ...emptyCommercialDetails(), postalCode: "75012" },
    type: "covered",
    spaces,
    photos: ["/demo/covered.png", "/demo/box.png", "/demo/outdoor.png"],
  };
  const created = await api("listings", "POST", input, seller);
  assert.equal(created.status, 201);
  assert.equal(created.data.priceCents, 3000000);
  assert.equal(created.data.transactionType, "sale");
  const id = created.data.id;
  assert.equal(
    (
      await api(
        "listings/" + id,
        "PATCH",
        { version: 1, locationConfirmedAt: new Date().toISOString() },
        seller,
      )
    ).status,
    200,
  );
  assert.equal(
    (
      await api(
        "listings/" + id + "/submit",
        "POST",
        { version: 2, ownershipAttested: true },
        seller,
      )
    ).status,
    200,
  );
  const linked = linkTestListing(id),
    approved = await api(
      "admin/revisions/" + id + "/decision",
      "POST",
      { version: linked, decision: "approve" },
      moderator,
    );
  assert.equal(approved.status, 200);
  const published = (await api("listings/" + id)).data;
  assert.equal(published.spaces.length, 5);
  assert.deepEqual(
    published.spaces.map((s: Space) => s.offer),
    offers,
  );
  assert.ok(
    published.spaces.every(
      (s: Space, i: number) => s.id === `${id}:unit:${i + 1}`,
    ),
  );
  assert.ok(!JSON.stringify(published).includes(spaces[0].id));
  assert.equal(
    (
      await api(
        `listings?ids=${id}&transactionType=rent&priceMax=12000&areaMin=15`,
      )
    ).total,
    0,
  );
  assert.equal(
    (await api(`listings?ids=${id}&transactionType=sale&priceMax=2500000`))
      .total,
    0,
  );
  const rent = await api(
    `listings?ids=${id}&transactionType=rent&priceMin=12000&areaMin=15&level=-2&sort=price_asc&limit=1`,
  );
  assert.equal(rent.total, 1);
  assert.equal(rent.data.length, 1);
  assert.deepEqual(rent.data[0].catalogMatch, {
    transactionType: "rent",
    priceCents: 15000,
    spaceIds: [`${id}:unit:5`],
  });
  const edited = await api(
    "listings/" + id,
    "PATCH",
    {
      version: approved.data.version,
      spaces: spaces.map((s, i) =>
        i ? s : { ...s, offer: { ...s.offer!, status: "sold" } },
      ),
      priceCents: 1,
      transactionType: "rent",
    },
    seller,
  );
  assert.equal(edited.status, 200);
  assert.equal(edited.data.priceCents, 4000000);
  assert.equal(edited.data.transactionType, "sale");
  assert.equal(
    (await api("listings/" + id)).data.spaces[0].offer.status,
    "available",
  );
  assert.equal(
    (
      await api(
        "listings/" + id,
        "PATCH",
        { version: approved.data.version, spaces },
        seller,
      )
    ).status,
    409,
  );
  assert.equal(
    (
      await api(
        "listings/" + id,
        "PATCH",
        {
          version: edited.data.version,
          catalogMatch: {
            transactionType: "sale",
            priceCents: 1,
            spaceIds: [],
          },
        },
        seller,
      )
    ).status,
    400,
  );
  const submittedAgain = await api(
    "listings/" + id + "/submit",
    "POST",
    { version: edited.data.version, ownershipAttested: true },
    seller,
  );
  assert.equal(submittedAgain.status, 200);
  const approvedAgain = await api(
    "admin/revisions/" + id + "/decision",
    "POST",
    { version: submittedAgain.data.version, decision: "approve" },
    moderator,
  );
  assert.equal(
    approvedAgain.status,
    200,
    "Commercial changes reuse the administered physical mapping",
  );
  assert.equal(
    (await api("listings/" + id)).data.spaces[0].offer.status,
    "sold",
  );
  const changedDimensions = await api(
    "listings/" + id,
    "PATCH",
    {
      version: approvedAgain.data.version,
      spaces: edited.data.spaces.map((s: Space, i: number) =>
        i ? s : { ...s, widthM: 2.5 },
      ),
    },
    seller,
  );
  assert.equal(changedDimensions.status, 200);
  const dimensionSubmission = await api(
    "listings/" + id + "/submit",
    "POST",
    { version: changedDimensions.data.version, ownershipAttested: true },
    seller,
  );
  assert.equal(dimensionSubmission.status, 200);
  const requiresMapping = await api(
    "admin/revisions/" + id + "/decision",
    "POST",
    { version: dimensionSubmission.data.version, decision: "approve" },
    moderator,
  );
  assert.equal(requiresMapping.code, "REGISTRY_LINK_REQUIRED");
  assert.equal((await api("listings/" + id)).data.spaces[0].widthM, 2.4);
  const zero = await api(
    "listings",
    "POST",
    {
      pricingMode: "per_space",
      spaces: [
        {
          ...places()[0],
          offer: {
            transactionType: "sale",
            priceCents: 0,
            status: "available",
          },
        },
      ],
    },
    seller,
  );
  assert.equal(zero.status, 201);
  assert.equal(
    (
      await api(
        "listings/" + zero.data.id + "/submit",
        "POST",
        { version: 1, ownershipAttested: true },
        seller,
      )
    ).code,
    "OFFER_INVALID",
  );
});
