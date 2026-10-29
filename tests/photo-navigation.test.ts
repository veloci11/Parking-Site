import { test } from "node:test";
import assert from "node:assert/strict";
import {
  movePhotoIndex,
  photoIndex,
  selectedPhotoGallery,
} from "../src/lib/photo-navigation";

test("a partly photographed lot labels common views without assigning another unit's photos", () => {
  const common = ["/api/media/common-view"];
  const own = ["/api/media/place-1"];
  const listing = {
    photos: common,
    spacePhotos: { "place-1": own, "place-2": [] },
  };
  assert.deepEqual(selectedPhotoGallery(listing, "place-1"), {
    photos: own,
    label: "Vue de la place",
  });
  for (const selection of ["place-2", "place-3", null])
    assert.deepEqual(selectedPhotoGallery(listing, selection), {
      photos: common,
      label: "Vue du parking",
    });
  assert.deepEqual(selectedPhotoGallery({ photos: [] }, "place-3"), {
    photos: [],
    label: "Vue du parking",
  });
});

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
