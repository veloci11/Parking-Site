import { test } from "node:test";
import assert from "node:assert/strict";
import {
  loadSceneEditorSelection,
  type SceneEditorSource,
} from "../src/lib/scene-editor-selection";
import type { Listing } from "../src/lib/types";

const firstId = "10000000-0000-4000-8000-000000000001";
const secondId = "10000000-0000-4000-8000-000000000002";
const listing = (id: string) => ({ id, version: 2 }) as Listing;
const source = (id: string): SceneEditorSource => ({
  id: `source-${id}`,
  listing_id: id,
  mime: "image/png",
  byte_size: 512,
  processing_state: "ready",
  url: `/api/scenes/sources?id=source-${id}`,
});

test("the editor loads the announcement and its sources as one consistent context", async () => {
  const signal = new AbortController().signal;
  const read = async <T>(path: string, options?: RequestInit): Promise<T> => {
    assert.equal(options?.signal, signal);
    const url = new URL(path, "https://parking.test");
    assert.equal(url.searchParams.get("listingId"), firstId);
    return (
      url.pathname.endsWith("/sources") ? [source(firstId)] : listing(firstId)
    ) as T;
  };
  const result = await loadSceneEditorSelection(read, firstId, signal);
  assert.equal(result?.listing.id, firstId);
  assert.deepEqual(result?.sources, [source(firstId)]);
});

test("failure while opening another announcement never returns partial editor data", async () => {
  let editor = { listing: listing(firstId), sources: [source(firstId)] };
  const read = async <T>(path: string): Promise<T> => {
    if (path.includes("/sources")) return [source(secondId)] as T;
    throw new Error("Annonce indisponible");
  };
  await assert.rejects(async () => {
    const loaded = await loadSceneEditorSelection(
      read,
      secondId,
      new AbortController().signal,
    );
    if (loaded) editor = loaded;
  }, /Annonce indisponible/);
  assert.equal(editor.listing.id, firstId);
  assert.equal(editor.sources[0].listing_id, firstId);
});

test("a superseded request cannot restore the previous announcement's documents", async () => {
  let release!: () => void;
  const waiting = new Promise<void>((resolve) => {
    release = resolve;
  });
  const read = async <T>(path: string): Promise<T> => {
    const url = new URL(path, "https://parking.test");
    const id = url.searchParams.get("listingId")!;
    if (id === firstId) await waiting;
    return (
      url.pathname.endsWith("/sources") ? [source(id)] : listing(id)
    ) as T;
  };
  const oldRequest = new AbortController();
  const stale = loadSceneEditorSelection(read, firstId, oldRequest.signal);
  oldRequest.abort();
  const current = await loadSceneEditorSelection(
    read,
    secondId,
    new AbortController().signal,
  );
  release();
  assert.equal(await stale, null);
  assert.equal(current?.listing.id, secondId);
  assert.equal(current?.sources[0].listing_id, secondId);
});

test("mismatched listing or source responses are rejected before the editor changes", async () => {
  for (const mismatch of ["listing", "sources"]) {
    const read = async <T>(path: string): Promise<T> =>
      (path.includes("/sources")
        ? [source(mismatch === "sources" ? secondId : firstId)]
        : listing(mismatch === "listing" ? secondId : firstId)) as T;
    await assert.rejects(
      loadSceneEditorSelection(read, firstId, new AbortController().signal),
      /ne correspondent pas/,
    );
  }
});

test("a seller's known announcement still requires its own documents to load successfully", async () => {
  const read = async <T>(path: string): Promise<T> => {
    assert.equal(path, `/api/scenes/sources?listingId=${firstId}`);
    throw new Error("Documents indisponibles");
  };
  await assert.rejects(
    loadSceneEditorSelection(
      read,
      firstId,
      new AbortController().signal,
      listing(firstId),
    ),
    /Documents indisponibles/,
  );
});
