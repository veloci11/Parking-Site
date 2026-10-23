import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { loadDemoParkingRender } from "../src/lib/parking-render";

test("stack previews share a request and closing one consumer does not cancel the open floor", async () => {
  const originalFetch = globalThis.fetch;
  const raw = await readFile(
    "public/parking-renders/demo-level-minus-1.json",
    "utf8",
  );
  let resolveRequest: (response: Response) => void;
  let count = 0;
  globalThis.fetch = async () => {
    count++;
    return new Promise<Response>((resolve) => {
      resolveRequest = resolve;
    });
  };
  try {
    const preview = new AbortController(),
      viewer = new AbortController();
    const first = loadDemoParkingRender(-1, preview.signal);
    const firstCancelled = assert.rejects(first, { name: "AbortError" });
    const second = loadDemoParkingRender(-1, viewer.signal);
    preview.abort();
    resolveRequest!(new Response(raw));
    await firstCancelled;
    assert.equal((await second).level, -1);
    assert.equal(count, 1);
    assert.equal((await loadDemoParkingRender(-1, viewer.signal)).level, -1);
    assert.equal(count, 1, "reopening a floor reuses its verified manifest");
    await assert.rejects(loadDemoParkingRender(-1, preview.signal), {
      name: "AbortError",
    });
  } finally {
    globalThis.fetch = originalFetch;
  }
});
