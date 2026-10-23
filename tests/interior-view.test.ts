import { test } from "node:test";
import assert from "node:assert/strict";
import {
  readInteriorSelection,
  writeInteriorSelection,
  interiorCameraKey,
  interiorCameraSchema,
} from "../src/lib/interior-view";
import type { Listing } from "../src/lib/types";
const listing = {
  id: "public-listing",
  spaces: [
    { id: "public-listing:unit:1", level: -1 },
    { id: "public-listing:unit:2", level: -2 },
  ],
} as Listing;
test("interior URL preserves public parking context, valid floor and selected public unit only", () => {
  const query = writeInteriorSelection(
    "?query=Paris&view=parking",
    listing,
    -2,
    "public-listing:unit:2",
  );
  assert.equal(query.get("query"), "Paris");
  assert.deepEqual(readInteriorSelection(query.toString(), listing), {
    level: -2,
    unit: "public-listing:unit:2",
  });
  assert.deepEqual(
    readInteriorSelection("?parking=another&floor=-2", listing),
    { level: -1, unit: null },
  );
  assert.deepEqual(
    readInteriorSelection(
      "?parking=public-listing&floor=99&unit=private-canonical-id",
      listing,
    ),
    { level: -1, unit: null },
  );
  assert.equal(
    writeInteriorSelection("", listing, -2, "public-listing:unit:1").get(
      "unit",
    ),
    null,
  );
});
test("interior camera state is finite and scoped separately per listing/floor/version", () => {
  assert.ok(
    interiorCameraSchema.safeParse({
      position: [20, 24, 28],
      target: [0, 0, 0],
    }).success,
  );
  assert.ok(
    !interiorCameraSchema.safeParse({ position: [0, 0, 0], target: [0, 0, 0] })
      .success,
  );
  assert.ok(
    !interiorCameraSchema.safeParse({
      position: [Infinity, 1, 2],
      target: [0, 0, 0],
    }).success,
  );
  assert.notEqual(
    interiorCameraKey("one", -1, "scene.1"),
    interiorCameraKey("one", -2, "scene.1"),
  );
  assert.notEqual(
    interiorCameraKey("one", -1, "scene.1"),
    interiorCameraKey("one", -1, "scene.2"),
  );
  assert.notEqual(
    interiorCameraKey("one", -1, "scene.1"),
    interiorCameraKey("two", -1, "scene.1"),
  );
});
