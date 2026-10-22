import { test } from "node:test";
import assert from "node:assert/strict";
import { loadRegistrySelection } from "../src/lib/registry-selection";
import type { RegistryAdminData } from "../src/lib/parking-registry";
import type { Listing } from "../src/lib/types";

const listingId = "10000000-0000-4000-8000-000000000001";
const otherListingId = "10000000-0000-4000-8000-000000000002";
const savedLink = {
  listingId,
  siteId: "site-paris",
  unitId: "unit-18",
  spaceId: "physical-18",
};

function registry(links: RegistryAdminData["links"]): RegistryAdminData {
  return { sites: [], links, conflicts: [] };
}

test("opening and refreshing an announcement reload its saved physical links and current revision", async () => {
  let version = 7;
  const read = async <T>(path: string): Promise<T> => {
    const url = new URL(path, "http://127.0.0.1");
    const requested = url.searchParams.get("listingId");
    if (url.pathname === "/api/admin/parking-registry")
      return registry(requested === listingId ? [savedLink] : []) as T;
    assert.equal(requested, listingId);
    return { id: listingId, version } as T;
  };
  const first = await loadRegistrySelection(
    read,
    listingId,
    new AbortController().signal,
  );
  assert.equal(first?.listing?.version, 7);
  assert.deepEqual(first?.registry.links, [savedLink]);
  version = 8;
  const refreshed = await loadRegistrySelection(
    read,
    listingId,
    new AbortController().signal,
  );
  assert.equal(refreshed?.listing?.version, 8);
  assert.deepEqual(refreshed?.registry.links, [savedLink]);
});

test("a superseded listing request cannot restore its mappings after another selection", async () => {
  let release!: () => void;
  const blocked = new Promise<void>((resolve) => {
    release = resolve;
  });
  const read = async <T>(path: string): Promise<T> => {
    const url = new URL(path, "http://127.0.0.1");
    const requested = url.searchParams.get("listingId")!;
    if (requested === listingId) await blocked;
    if (url.pathname === "/api/admin/parking-registry")
      return registry(requested === listingId ? [savedLink] : []) as T;
    return { id: requested, version: 8 } as T;
  };
  const previous = new AbortController();
  const late = loadRegistrySelection(read, listingId, previous.signal);
  previous.abort();
  const current = await loadRegistrySelection(
    read,
    otherListingId,
    new AbortController().signal,
  );
  assert.equal(current?.listing?.id, otherListingId);
  release();
  assert.equal(await late, null);
});

test("clearing an announcement selection returns the registry without keeping an old listing", async () => {
  const paths: string[] = [];
  const read = async <T>(path: string): Promise<T> => {
    paths.push(path);
    return registry([]) as T;
  };
  const result = await loadRegistrySelection(
    read,
    "",
    new AbortController().signal,
  );
  assert.equal(result?.listing, null);
  assert.deepEqual(paths, ["/api/admin/parking-registry"]);
});

test("an unavailable or mismatched listing never yields a usable review context", async () => {
  const broken = async <T>(path: string): Promise<T> => {
    if (path.startsWith("/api/scenes")) throw new Error("Annonce indisponible");
    return registry([savedLink]) as T;
  };
  await assert.rejects(
    loadRegistrySelection(broken, listingId, new AbortController().signal),
    /indisponible/,
  );
  const mismatched = async <T>(path: string): Promise<T> =>
    path.startsWith("/api/scenes")
      ? ({ id: otherListingId, version: 8 } satisfies Pick<
          Listing,
          "id" | "version"
        > as T)
      : (registry([savedLink]) as T);
  await assert.rejects(
    loadRegistrySelection(mismatched, listingId, new AbortController().signal),
    /ne correspond pas/,
  );
});
