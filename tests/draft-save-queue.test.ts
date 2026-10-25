import { test } from "node:test";
import assert from "node:assert/strict";
import { createDraftSaveQueue } from "../src/lib/draft-save-queue";

test("leaving a draft waits for the current request and the last edits, without parallel version writes", async () => {
  let dirty = true;
  let value = "first edit";
  let version = 1;
  const calls: { value: string; version: number }[] = [];
  const releases: (() => void)[] = [];
  const save = createDraftSaveQueue(
    async () => {
      const snapshot = value;
      calls.push({ value: snapshot, version });
      await new Promise<void>((resolve) => releases.push(resolve));
      version++;
      dirty = value !== snapshot;
      return { value: snapshot, version };
    },
    () => dirty,
  );
  const autosave = save();
  value = "last edit";
  const leaving = save();
  assert.equal(leaving, autosave);
  assert.equal(calls.length, 1);
  releases.shift()!();
  await new Promise<void>((resolve) => setImmediate(resolve));
  assert.deepEqual(calls, [
    { value: "first edit", version: 1 },
    { value: "last edit", version: 2 },
  ]);
  releases.shift()!();
  assert.deepEqual(await leaving, { value: "last edit", version: 3 });
  assert.equal(dirty, false);
});

test("a failed save keeps the navigation blocked and permits an explicit retry", async () => {
  let attempts = 0;
  let dirty = true;
  const save = createDraftSaveQueue(
    async () => {
      if (++attempts === 1) return null;
      dirty = false;
      return "saved";
    },
    () => dirty,
  );
  assert.equal(await save(), null);
  assert.equal(attempts, 1, "network errors must not produce a retry loop");
  assert.equal(dirty, true);
  assert.equal(await save(), "saved");
  assert.equal(attempts, 2);
});
