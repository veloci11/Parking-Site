import test from "node:test";
import assert from "node:assert/strict";
import { createPendingRequest } from "../src/lib/pending-request";

test("les composants partagent une lecture en vol, sans conserver de session après réponse", async () => {
  let calls = 0;
  const read = createPendingRequest(async () => ++calls);
  const a = read(),
    b = read();
  assert.equal(a, b);
  assert.deepEqual(await Promise.all([a, b]), [1, 1]);
  assert.equal(await read(), 2);
});

test("une connexion lance une nouvelle lecture et une ancienne réponse ne vide pas la nouvelle requête", async () => {
  const pending: Array<(value: string) => void> = [];
  const read = createPendingRequest(
    () => new Promise<string>((resolve) => pending.push(resolve)),
  );
  const initial = read();
  const event = {};
  const refreshed = read(event);
  assert.notEqual(initial, refreshed);
  await Promise.resolve();
  pending[0]("anonymous");
  await initial;
  assert.equal(read(event), refreshed);
  pending[1]("signed-in");
  assert.equal(await refreshed, "signed-in");
});

test("une panne est libérée pour permettre une nouvelle tentative", async () => {
  let calls = 0;
  const read = createPendingRequest(async () => {
    if (++calls === 1) throw new Error("offline");
    return "ready";
  });
  await assert.rejects(read(), /offline/);
  assert.equal(await read(), "ready");
});
