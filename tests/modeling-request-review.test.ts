import test from "node:test";
import assert from "node:assert/strict";
import {
  loadModelingRequestPage,
  modelingDecisionConfirmed,
  reloadedModelingRequest,
} from "../src/lib/modeling-request-review";
import type {
  AdminModelingRequest,
  AdminModelingRequests,
} from "../src/lib/modeling-requests";

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

test("recovery reads only the selected server page, retaining its filter beyond the first 100 requests", async () => {
  const controller = new AbortController();
  const page: AdminModelingRequests = {
    requests: [{ ...before, version: 5 }],
    offset: 125,
    total: 180,
    hasMore: true,
  };
  let reads = 0;
  const recovered = await loadModelingRequestPage(
    async <T>(path: string, options?: RequestInit) => {
      reads++;
      const url = new URL(path, "http://localhost");
      assert.equal(url.pathname, "/api/admin/modeling-requests");
      assert.equal(url.searchParams.get("offset"), "125");
      assert.equal(url.searchParams.get("limit"), "25");
      assert.equal(url.searchParams.get("status"), "requested");
      assert.equal(options?.method, "GET");
      assert.equal(options?.body, undefined);
      assert.equal(options?.cache, "no-store");
      assert.equal(options?.signal, controller.signal);
      return { data: page } as T;
    },
    "requested",
    125,
    controller.signal,
  );
  assert.equal(reads, 1);
  assert.equal(recovered, page);
  assert.equal(reloadedModelingRequest(before, recovered)?.version, 5);
});

test("an all-status recovery does not filter out a dossier after its status changes", async () => {
  const page = await loadModelingRequestPage(
    async <T>(path: string) => {
      assert.equal(
        new URL(path, "http://localhost").searchParams.get("status"),
        null,
      );
      return {
        data: {
          requests: [{ ...before, status: "in_progress", version: 5 }],
          offset: 25,
          total: 26,
          hasMore: false,
        },
      } as T;
    },
    "all",
    25,
  );
  assert.equal(reloadedModelingRequest(before, page)?.status, "in_progress");
});

test("missing or moved dossiers never recover from the previous local snapshot", () => {
  assert.equal(
    reloadedModelingRequest(before, {
      requests: [{ ...before, listingId: "another-dossier" }],
      offset: 25,
      total: 26,
      hasMore: false,
    }),
    null,
  );
});

test("recovery rejects older or invalid revisions and accepts a fresh unchanged read after a rejected write", () => {
  const page = {
    requests: [before],
    offset: 25,
    total: 26,
    hasMore: false,
  };
  assert.equal(reloadedModelingRequest(before, page), before);
  for (const version of [3, 4.5, NaN])
    assert.throws(
      () =>
        reloadedModelingRequest(before, {
          ...page,
          requests: [{ ...before, version }],
        }),
      /version actuelle/,
    );
});

test("a failed recovery propagates its error without a fallback read or write", async () => {
  let reads = 0;
  await assert.rejects(
    loadModelingRequestPage(
      async () => {
        reads++;
        throw new Error("Service indisponible");
      },
      "all",
      25,
    ),
    /Service indisponible/,
  );
  assert.equal(reads, 1);
});

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
