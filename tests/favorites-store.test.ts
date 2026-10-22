import { test } from "node:test";
import assert from "node:assert/strict";
import { createFavoritesStore } from "../src/lib/favorites-store";

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}
const tick = () => new Promise<void>((resolve) => setImmediate(resolve));

test("initial favorites load completes before applying a waiting click", async () => {
  const initial = deferred<string[]>();
  const writes: string[] = [];
  const store = createFavoritesStore();
  store.connect({
    load: () => initial.promise,
    save: async (id) => {
      writes.push(id);
    },
  });
  const clicked = store.toggle("new");
  assert.equal(store.getSnapshot().loading, true);
  assert.deepEqual(writes, []);
  initial.resolve(["existing"]);
  await clicked;
  assert.deepEqual(store.getSnapshot().ids, ["existing", "new"]);
  assert.deepEqual(writes, ["new"]);
});

test("failure of A cannot erase an independently saved favorite B", async () => {
  const a = deferred<void>();
  const store = createFavoritesStore();
  store.connect({
    load: async () => [],
    save: async (id) => {
      if (id === "a") await a.promise;
    },
  });
  await tick();
  const failed = store.toggle("a");
  await store.toggle("b");
  assert.deepEqual(store.getSnapshot().ids.sort(), ["a", "b"]);
  a.reject(new Error("Réseau indisponible"));
  await failed;
  assert.deepEqual(store.getSnapshot().ids, ["b"]);
  assert.equal(store.getSnapshot().error, "Réseau indisponible");
});

test("repeated clicks for one favorite serialize PUT and DELETE without rolling back the newer intent", async () => {
  const first = deferred<void>();
  const calls: boolean[] = [];
  const store = createFavoritesStore();
  store.connect({
    load: async () => [],
    save: async (_id, selected) => {
      calls.push(selected);
      if (calls.length === 1) await first.promise;
    },
  });
  await tick();
  const add = store.toggle("a");
  const remove = store.toggle("a");
  assert.deepEqual(calls, [true]);
  assert.deepEqual(store.getSnapshot().ids, []);
  first.reject(new Error("Premier envoi perdu"));
  await Promise.all([add, remove]);
  assert.deepEqual(calls, [true, false]);
  assert.deepEqual(store.getSnapshot().ids, []);
  assert.deepEqual(store.getSnapshot().pendingIds, []);
});

test("a late load or write from an old account cannot replace the new account favorites", async () => {
  const oldLoad = deferred<string[]>();
  const oldWrite = deferred<void>();
  const store = createFavoritesStore();
  store.connect({ load: () => oldLoad.promise, save: async () => {} });
  store.connect({ load: async () => ["new-account"], save: async () => {} });
  await tick();
  oldLoad.resolve(["old-account"]);
  await tick();
  assert.deepEqual(store.getSnapshot().ids, ["new-account"]);
  store.connect({ load: async () => [], save: () => oldWrite.promise });
  await tick();
  const pending = store.toggle("private-old-favorite");
  store.connect({ load: async () => ["other-account"], save: async () => {} });
  await tick();
  oldWrite.reject(new Error("Ancien compte"));
  await pending;
  assert.deepEqual(store.getSnapshot().ids, ["other-account"]);
  assert.equal(store.getSnapshot().error, "");
});

test("a loading error is visible and the next click retries before saving", async () => {
  let reads = 0;
  const writes: string[] = [];
  const store = createFavoritesStore();
  store.connect({
    load: async () => {
      if (++reads === 1) throw new Error("Chargement interrompu");
      return ["existing"];
    },
    save: async (id) => {
      writes.push(id);
    },
  });
  await tick();
  assert.equal(store.getSnapshot().error, "Chargement interrompu");
  await store.toggle("new");
  assert.equal(reads, 2);
  assert.deepEqual(writes, ["new"]);
  assert.deepEqual(store.getSnapshot().ids, ["existing", "new"]);
  assert.equal(store.getSnapshot().error, "");
});
