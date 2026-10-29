import test from "node:test";
import assert from "node:assert/strict";
import { modelingDecisionConfirmed } from "../src/lib/modeling-request-review";
import type { AdminModelingRequest } from "../src/lib/modeling-requests";

const before: AdminModelingRequest = {
  listingId: "10000000-0000-4000-8000-000000000001",
  ownerId: "00000000-0000-4000-8000-000000000001",
  ownerName: "Compte fictif",
  listingTitle: "Parking de recette",
  note: "",
  status: "requested",
  requestedAt: "2026-10-01T10:00:00Z",
  updatedAt: "2026-10-01T10:00:00Z",
  version: 4,
};

test("a modeling preparation decision is confirmed only by a new matching server revision", () => {
  assert.equal(
    modelingDecisionConfirmed(before, "in_progress", {
      ...before,
      status: "in_progress",
      version: 5,
    }),
    true,
  );
  // A stale successful read or another editor's decision is not proof of our write.
  assert.equal(modelingDecisionConfirmed(before, "in_progress", before), false);
  assert.equal(
    modelingDecisionConfirmed(before, "in_progress", {
      ...before,
      status: "in_progress",
    }),
    false,
  );
  assert.equal(
    modelingDecisionConfirmed(before, "in_progress", {
      ...before,
      status: "ready",
      version: 5,
    }),
    false,
  );
});

test("missing or foreign modeling dossiers never produce a successful decision notice", () => {
  assert.equal(modelingDecisionConfirmed(before, "ready", null), false);
  assert.equal(modelingDecisionConfirmed(before, "ready", undefined), false);
  assert.equal(
    modelingDecisionConfirmed(before, "ready", {
      ...before,
      listingId: "10000000-0000-4000-8000-000000000002",
      status: "ready",
      version: 5,
    }),
    false,
  );
});
