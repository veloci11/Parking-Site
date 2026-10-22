import test from "node:test";
import assert from "node:assert/strict";
import {
  isRevisionReviewed,
  type ReviewedRevision,
} from "../src/lib/moderation-review";

test("refreshing a selected dossier requires re-review of its new version", () => {
  let current = { id: "listing-a", version: 7 };
  let reviewed: ReviewedRevision | null = { ...current };
  assert.equal(isRevisionReviewed(current, reviewed), true);

  // The selected ID stays the same when an admin refreshes the queue.
  current = { id: "listing-a", version: 8 };
  assert.equal(isRevisionReviewed(current, reviewed), false);

  reviewed = { ...current };
  assert.equal(isRevisionReviewed(current, reviewed), true);
  reviewed = null;
  assert.equal(isRevisionReviewed(current, reviewed), false);
});

test("a review cannot be transferred to another dossier or a missing selection", () => {
  const reviewed = { id: "listing-a", version: 7 };
  assert.equal(
    isRevisionReviewed({ id: "listing-b", version: 7 }, reviewed),
    false,
  );
  assert.equal(isRevisionReviewed(undefined, reviewed), false);
  assert.equal(isRevisionReviewed(null, reviewed), false);
  assert.equal(
    isRevisionReviewed({ id: "listing-a", version: 7 }, null),
    false,
  );
});
