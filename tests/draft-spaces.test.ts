import { test } from "node:test";
import assert from "node:assert/strict";
import {
  createDraftSpace,
  parseSpaceCount,
  resizeDraftSpaces,
} from "../src/lib/draft-spaces";
import { spaceLevelLabel } from "../src/lib/types";

test("new places do not invent a painted number, floor, area or price", () => {
  const space = createDraftSpace("new-place");
  assert.equal(space.number, "");
  assert.equal(space.levelKnown, false);
  assert.equal(spaceLevelLabel(space), "Non renseigné");
  assert.equal(space.areaM2, null);
  assert.equal(space.offer?.priceCents, 0);
});

test("editing the quantity validates without deleting existing per-space data", () => {
  const spaces = Array.from({ length: 10 }, (_, i) => ({
    ...createDraftSpace(`place-${i}`),
    number: String(18 + i),
    offer: {
      transactionType: i < 5 ? ("sale" as const) : ("rent" as const),
      priceCents: i < 5 ? 1000000 + i * 10000 : 15000 + i * 100,
      status: "available" as const,
    },
  }));
  for (const intermediate of ["", "0", "-1", "10.5", "1e2", "501"])
    assert.equal(parseSpaceCount(intermediate), null);
  assert.throws(() => resizeDraftSpaces(spaces, ""), /entier/);
  assert.equal(spaces.length, 10);
  assert.equal(spaces[9].number, "27");
  assert.equal(spaces[9].offer.priceCents, 15900);
  const expanded = resizeDraftSpaces(spaces, "12");
  assert.equal(expanded.length, 12);
  for (let i = 0; i < 10; i++) assert.equal(expanded[i], spaces[i]);
  assert.equal(new Set(expanded.map((space) => space.id)).size, 12);
  assert.equal(expanded[10].levelKnown, false);
  const reduced = resizeDraftSpaces(spaces, "8");
  assert.deepEqual(reduced, spaces.slice(0, 8));
  assert.equal(
    spaces.length,
    10,
    "applying another quantity never mutates the source",
  );
});
