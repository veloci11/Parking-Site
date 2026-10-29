import assert from "node:assert/strict";
import { test } from "node:test";
import {
  loadDashboardSections,
  updateManagedListing,
  type DashboardResult,
} from "../src/lib/seller-account-state";
import type { Conversation, Listing } from "../src/lib/types";

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: Error) => void;
  const promise = new Promise<T>((accept, fail) => {
    resolve = accept;
    reject = fail;
  });
  return { promise, resolve, reject };
}

const listing = (id: string, version = 2) =>
  ({
    id,
    version,
    status: "published",
    spaces: [],
    photos: [],
  }) as unknown as Listing;

test("dashboard shows listings before a slower conversation request and preserves them when it fails", async () => {
  const conversations = deferred<{ data: Conversation[] }>();
  const controller = new AbortController();
  const results: DashboardResult[] = [];
  const first = listing("listing-a");
  const loading = loadDashboardSections(
    <T>(path: string, options?: RequestInit) => {
      assert.equal(options?.signal, controller.signal);
      if (path === "/api/me/listings")
        return Promise.resolve({ data: [first] }) as Promise<T>;
      assert.equal(path, "/api/conversations");
      return conversations.promise as Promise<T>;
    },
    controller.signal,
    (value) => results.push(value),
  );
  await Promise.resolve();
  assert.deepEqual(results, [
    { section: "listings", data: [first], error: null },
  ]);
  conversations.reject(new Error("Messagerie indisponible"));
  await loading;
  assert.deepEqual(results[1], {
    section: "conversations",
    data: null,
    error: "Messagerie indisponible",
  });
  assert.equal(results.length, 2);
});

test("dashboard distinguishes an empty successful section from a failed one", async () => {
  const results: DashboardResult[] = [];
  await loadDashboardSections(
    async <T>(path: string) => {
      if (path === "/api/me/listings")
        throw new Error("Annonces indisponibles");
      return { data: [] } as T;
    },
    new AbortController().signal,
    (value) => results.push(value),
  );
  assert.deepEqual(
    results.find((value) => value.section === "listings"),
    {
      section: "listings",
      data: null,
      error: "Annonces indisponibles",
    },
  );
  assert.deepEqual(
    results.find((value) => value.section === "conversations"),
    {
      section: "conversations",
      data: [],
      error: null,
    },
  );
});

test("aborting a dashboard read suppresses late successes and errors from an older screen", async () => {
  const listings = deferred<{ data: Listing[] }>();
  const conversations = deferred<{ data: Conversation[] }>();
  const controller = new AbortController();
  const results: DashboardResult[] = [];
  const loading = loadDashboardSections(
    <T>(path: string) =>
      (path === "/api/me/listings"
        ? listings.promise
        : conversations.promise) as Promise<T>,
    controller.signal,
    (value) => results.push(value),
  );
  controller.abort();
  listings.resolve({ data: [listing("stale")] });
  conversations.reject(new Error("Old request failed"));
  await loading;
  assert.deepEqual(results, []);
});

test("a confirmed seller status change keeps other rows and their order intact", () => {
  const first = listing("first");
  const second = listing("second");
  const items = [first, second];
  const confirmed = { ...second, status: "paused" as const, version: 3 };
  const updated = updateManagedListing(items, second.id, confirmed);
  assert.deepEqual(
    updated.map((value) => value.id),
    ["first", "second"],
  );
  assert.equal(updated[0], first);
  assert.equal(updated[1], confirmed);
  assert.equal(items[1], second);
  assert.equal(items[1].status, "published");
  assert.equal(items[1].version, 2);
});

test("unconfirmed, stale or mismatched seller responses cannot replace a row", () => {
  const original = listing("first");
  const cases = [
    undefined,
    { ...original, id: "someone-else", version: 3 },
    { ...original, version: 2 },
    { ...original, version: 1 },
    { ...original, version: Number.NaN },
    { ...original, version: 3, spaces: undefined },
  ];
  for (const response of cases) {
    const items = [original];
    assert.throws(
      () => updateManagedListing(items, original.id, response as Listing),
      /Actualisez vos annonces/,
    );
    assert.deepEqual(items, [original]);
  }
});
