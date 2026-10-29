import test from "node:test";
import assert from "node:assert/strict";
import { mergeMessageHistory } from "../src/components/account/message-history";
import type { Message } from "../src/lib/types";
const message = (id: string, date: string, body = id): Message => ({
  id,
  body,
  createdAt: date,
  conversationId: "conversation",
  senderId: "sender",
});
test("polling dernier lot conserve les pages anciennes et déduplique leur frontière", () => {
  const old = message("old", "2026-10-01T10:00:00Z"),
    boundary = message("boundary", "2026-10-01T11:00:00Z"),
    fresh = message("fresh", "2026-10-01T12:00:00Z");
  const current = [old, boundary];
  const merged = mergeMessageHistory(current, [boundary, fresh]);
  assert.deepEqual(
    merged.map((m) => m.id),
    ["old", "boundary", "fresh"],
  );
  assert.equal(current.length, 2);
  assert.deepEqual(mergeMessageHistory(merged, [old, boundary]), merged);
});
test("ordre stable avec dates égales et mise à jour de même ID sans duplication", () => {
  const a = message("a", "2026-10-01T10:00:00Z"),
    b = message("b", a.createdAt);
  assert.deepEqual(
    mergeMessageHistory([b], [a, b]).map((m) => m.id),
    ["a", "b"],
  );
  assert.equal(
    mergeMessageHistory([a], [{ ...a, body: "actualisé" }])[0].body,
    "actualisé",
  );
});
