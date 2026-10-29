import { test } from "node:test";
import assert from "node:assert/strict";
import { movePhotoIndex, photoIndex } from "../src/lib/photo-navigation";

test("removing the current last photo keeps the counter valid and both controls working", () => {
  const previousThird = 2;
  assert.equal(photoIndex(previousThird, 2), 1);
  assert.equal(movePhotoIndex(previousThird, 2, -1), 0);
  assert.equal(movePhotoIndex(previousThird, 2, 1), 0);
  assert.equal(movePhotoIndex(0, 2, -1), 1);
  assert.equal(movePhotoIndex(0, 2, 1), 1);
});

test("a gallery reduced to one or zero photos has no invalid index", () => {
  for (const count of [0, 1]) {
    assert.equal(photoIndex(8, count), 0);
    assert.equal(movePhotoIndex(8, count, -1), 0);
    assert.equal(movePhotoIndex(8, count, 1), 0);
  }
});
