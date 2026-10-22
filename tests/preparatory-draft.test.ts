import test from "node:test";
import assert from "node:assert/strict";
import {
  decodePreparation,
  preparationPayload,
} from "../src/components/account/preparatory-draft";
test("préparation locale limitée aux informations non sensibles autorisées", () => {
  const result = decodePreparation(
    JSON.stringify({
      title: "Lot de deux places",
      city: "Paris",
      type: "covered",
      quantity: 2,
      address: "Adresse précise à ne pas conserver",
      email: "private@example.invalid",
      photos: ["private"],
      version: 999,
    }),
  );
  assert.deepEqual(result, {
    title: "Lot de deux places",
    city: "Paris",
    type: "covered",
    quantity: 2,
  });
  let index = 0;
  const payload = preparationPayload(result!, () => `unit-${++index}`);
  assert.equal(payload.spaces.length, 2);
  assert.notEqual(payload.spaces[0].id, payload.spaces[1].id);
  assert.equal(payload.spaces[0].areaM2, null);
  assert.equal(payload.spaces[0].widthM, null);
  assert.equal(payload.pricingMode, "per_space");
  assert.deepEqual(payload.spaces[0].offer, {
    transactionType: "sale",
    priceCents: 0,
    status: "available",
  });
  assert.equal("address" in payload, false);
  assert.equal("photos" in payload, false);
  assert.equal("priceCents" in payload, false);
});
test("préparation corrompue ou quantité invalide ne crée pas de lot implicite", () => {
  for (const raw of [
    null,
    "{",
    "null",
    "[]",
    JSON.stringify({ title: "t", city: "c", type: "covered", quantity: 0 }),
    JSON.stringify({ title: "t", city: "c", type: "covered", quantity: 501 }),
    JSON.stringify({ title: "t", city: "c", type: "covered", quantity: 1.5 }),
    JSON.stringify({ title: "t", city: "c", type: "other", quantity: 2 }),
  ])
    assert.equal(decodePreparation(raw), null);
  assert.equal(
    decodePreparation(
      JSON.stringify({
        title: "x".repeat(100),
        city: "c".repeat(100),
        type: "box",
        quantity: 1,
      }),
    )?.title.length,
    90,
  );
});
test("une préparation de lot mixte se retrouve après connexion sans perdre les places", () => {
  const prepared = decodePreparation(
    JSON.stringify({
      title: "Place et box dans un même parking",
      city: "Paris",
      type: "mixed",
      quantity: 2,
    }),
  );
  assert.ok(prepared);
  let index = 0;
  const payload = preparationPayload(prepared, () => `space-${++index}`);
  assert.equal(payload.type, "mixed");
  assert.equal(payload.spaces.length, 2);
  assert.equal(
    payload.spaces.every((space) => space.number === ""),
    true,
  );
});
test("le choix exclusif vente ou location est conservé dans la préparation", () => {
  for (const transactionType of ["sale", "rent"] as const) {
    const prepared = decodePreparation(
      JSON.stringify({
        title: "Lot à proposer",
        city: "Paris",
        type: "covered",
        quantity: 2,
        transactionType,
      }),
    );
    assert.equal(prepared?.transactionType, transactionType);
    assert.equal(
      preparationPayload(prepared!, () => "unit").transactionType,
      transactionType,
    );
  }
  assert.equal(
    decodePreparation(
      JSON.stringify({
        title: "Lot",
        city: "Paris",
        type: "covered",
        quantity: 2,
        transactionType: "both",
      }),
    ),
    null,
  );
});
