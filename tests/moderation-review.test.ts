import test from "node:test";
import assert from "node:assert/strict";
import {
  isRevisionReviewed,
  moderationOutcome,
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
test("an accepted request that returns a physical conflict is never presented as published", () => {
  const conflict = moderationOutcome("approve", {
    status: "changes_requested",
    rejectionReason: "Conflit entre deux rattachements.",
  });
  assert.equal(conflict.confirmed, false);
  assert.match(conflict.message, /n’a pas été publiée/);
  assert.match(conflict.message, /Conflit entre deux rattachements/);
  assert.equal(
    moderationOutcome("approve", { status: "published" }).confirmed,
    true,
  );
  assert.equal(
    moderationOutcome("reject", { status: "rejected" }).confirmed,
    true,
  );
  assert.equal(
    moderationOutcome("changes_requested", { status: "changes_requested" })
      .confirmed,
    true,
  );
  assert.equal(moderationOutcome("approve", undefined).confirmed, false);
  assert.equal(
    moderationOutcome("reject", { status: "pending" }).confirmed,
    false,
  );
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
