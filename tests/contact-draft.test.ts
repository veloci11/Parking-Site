import { test } from "node:test";
import assert from "node:assert/strict";
import { contactDraftKey, decodeContactDraft } from "../src/lib/contact-draft";
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
  ])
    assert.equal(decodeContactDraft(raw), null);
});
