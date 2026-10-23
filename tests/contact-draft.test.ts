import { test } from "node:test";
import assert from "node:assert/strict";
import {
  contactDraftKey,
  decodeContactDraft,
  contactSelectionContext,
  contactMessageBody,
} from "../src/lib/contact-draft";
import type { Space } from "../src/lib/types";
const value = {
  message: "Bonjour, je souhaite visiter cette place.",
  visit: true,
  messageRequestId: "a1000000-0000-4000-8000-000000000001",
  visitRequestId: "a1000000-0000-4000-8000-000000000002",
};
test("brouillon de contact isolé par annonce conserve les clés idempotentes sans autres données", () => {
  assert.notEqual(contactDraftKey("a"), contactDraftKey("b"));
  assert.deepEqual(
    decodeContactDraft(
      JSON.stringify({
        ...value,
        email: "private@example.invalid",
        token: "must-not-persist",
      }),
    ),
    value,
  );
});
test("brouillon de contact corrompu ou excessif ignoré sans faux envoi", () => {
  for (const raw of [
    null,
    "null",
    "{",
    JSON.stringify({ ...value, message: "x".repeat(4001) }),
    JSON.stringify({ ...value, messageRequestId: "invalid" }),
    JSON.stringify({ ...value, context: "x".repeat(501) }),
  ])
    assert.equal(decodeContactDraft(raw), null);
});

test("contact identifies real place, floor, transaction and price without modifying the buyer text", () => {
  const space: Space = {
    id: "space-18",
    number: "18",
    level: -2,
    areaM2: 12,
    lengthM: null,
    widthM: null,
    clearanceM: null,
    offer: { transactionType: "rent", priceCents: 20000, status: "available" },
  };
  const listing = {
    priceCents: 1850000,
    spaces: [space],
    transactionType: "sale" as const,
    pricingMode: "per_space" as const,
    status: "published" as const,
  };
  const context = contactSelectionContext(listing, space);
  assert.match(context, /place 18 · niveau -2 · à louer/);
  assert.match(context, /200\s*€ \/ mois \/ place/);
  assert.doesNotMatch(context, /18.?500/);
  assert.equal(
    contactMessageBody(context, value.message),
    `${context}\n\n${value.message}`,
  );
  assert.deepEqual(decodeContactDraft(JSON.stringify({ ...value, context })), {
    ...value,
    context,
  });
  const lot = contactSelectionContext(
    {
      ...listing,
      pricingMode: "lot",
      spaces: [space, { ...space, id: "19", number: "19" }],
    },
    space,
  );
  assert.match(lot, /lot entier/);
  assert.match(lot, /à vendre/);
});
