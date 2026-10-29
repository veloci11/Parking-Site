import { test } from "node:test";
import assert from "node:assert/strict";
import { createPublicRefresh } from "../src/lib/public-refresh";
import {
  loadPublicListing,
  loadPublicParkingScene,
} from "../src/lib/public-viewer-data";

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => (resolve = done));
  return { promise, resolve };
}

test("focus and visibility refresh share a request; withdrawal cannot be cleared by an older reply", async () => {
  const old = deferred<number | null>();
  let calls = 0;
  const accepted: (number | null)[] = [];
  const refresh = createPublicRefresh({
    load: () => (++calls === 1 ? old.promise : Promise.resolve(null)),
    onSuccess: (value) => accepted.push(value),
    onError: (error) => assert.fail(String(error)),
  });
  const first = refresh.refresh();
  assert.equal(refresh.refresh(), first);
  await Promise.resolve();
  assert.equal(calls, 1);
  old.resolve(1);
  await first;
  await refresh.refresh();
  assert.deepEqual(accepted, [1, null]);
  refresh.dispose();
});

test("timeout releases the refresh and ignores a stale reply after successful retry", async () => {
  const stalled = deferred<number>();
  const accepted: number[] = [];
  const failures: unknown[] = [];
  let calls = 0;
  let firstSignal: AbortSignal | undefined;
  const refresh = createPublicRefresh({
    timeoutMs: 5,
    load: (signal) => {
      if (++calls === 1) {
        firstSignal = signal;
        return stalled.promise;
      }
      return Promise.resolve(2);
    },
    onSuccess: (value) => accepted.push(value),
    onError: (error) => failures.push(error),
  });
  await refresh.refresh();
  assert.equal(firstSignal?.aborted, true);
  assert.equal(failures.length, 1);
  await refresh.refresh();
  stalled.resolve(1);
  await Promise.resolve();
  assert.deepEqual(accepted, [2]);
  refresh.dispose();
});

test("leaving a listing cancels its request without updating the next page", async () => {
  const stale = deferred<number>();
  let signal: AbortSignal | undefined;
  let writes = 0;
  const refresh = createPublicRefresh({
    load: (current) => {
      signal = current;
      return stale.promise;
    },
    onSuccess: () => writes++,
    onError: () => writes++,
  });
  const pending = refresh.refresh();
  await Promise.resolve();
  refresh.dispose();
  assert.equal(signal?.aborted, true);
  await pending;
  stale.resolve(1);
  await Promise.resolve();
  await refresh.refresh();
  assert.equal(writes, 0);
});

test("a listing 404 is unavailable even when a proxy returns HTML; server errors are not withdrawals", async (t) => {
  const mocked = t.mock.method(
    globalThis,
    "fetch",
    async () => new Response("<html>Not found</html>", { status: 404 }),
  );
  const signal = new AbortController().signal;
  assert.equal(await loadPublicListing("listing", signal), null);
  mocked.mock.mockImplementation(
    async () => new Response("<html>Bad gateway</html>", { status: 502 }),
  );
  await assert.rejects(loadPublicListing("listing", signal), /vérifié/);
});

test("a missing floor can try another reviewed floor, but network errors never imply an absent plan", async (t) => {
  const requested: string[] = [];
  const mocked = t.mock.method(globalThis, "fetch", async (url: string) => {
    requested.push(url);
    return new Response("Not found", { status: 404 });
  });
  const signal = new AbortController().signal;
  assert.equal(await loadPublicParkingScene("listing", -2, true, signal), null);
  assert.deepEqual(requested, [
    "/api/scenes?listingId=listing&level=-2",
    "/api/scenes?listingId=listing",
  ]);
  mocked.mock.mockImplementation(
    async () => new Response("Gateway", { status: 502 }),
  );
  const before = mocked.mock.callCount();
  await assert.rejects(
    loadPublicParkingScene("listing", -2, true, signal),
    /chargé/,
  );
  assert.equal(mocked.mock.callCount(), before + 1);
  mocked.mock.mockImplementation(async () => Response.json({ data: {} }));
  await assert.rejects(
    loadPublicParkingScene("listing", -2, false, signal),
    /affiché/,
  );
});
