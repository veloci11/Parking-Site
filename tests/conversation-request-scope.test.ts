import { test } from "node:test";
import assert from "node:assert/strict";
import { createConversationRequestScope } from "../src/components/account/conversation-request-scope";
import { reconcileConversationReads } from "../src/components/account/conversation-list-state";
import type { Conversation } from "../src/lib/types";

test("late visit or block results cannot change another conversation or a later visit to the same one", async () => {
  for (const channel of ["visit", "block", "feed", "history"]) {
    for (const failed of [false, true]) {
      const scope = createConversationRequestScope();
      scope.select("a");
      const oldRequest = scope.begin("a", channel);
      let settle!: () => void;
      const response = new Promise<void>((resolve, reject) => {
        settle = () => (failed ? reject(new Error("Old failure")) : resolve());
      });
      const view = { busy: true, error: "", value: "Current conversation" };
      const handled = response
        .then(
          () =>
            oldRequest.apply(() => {
              view.value = "Old result";
            }),
          (error) =>
            oldRequest.apply(() => {
              view.error = error.message;
            }),
        )
        .finally(() =>
          oldRequest.apply(() => {
            view.busy = false;
          }),
        );
      scope.select("b");
      scope.select("a");
      const current = scope.begin("a", channel);
      settle();
      await handled;
      assert.deepEqual(view, {
        busy: true,
        error: "",
        value: "Current conversation",
      });
      assert.equal(
        current.apply(() => {
          view.busy = false;
        }),
        true,
      );
      scope.select(undefined);
      assert.equal(
        current.apply(() => {
          view.error = "Unmounted";
        }),
        false,
      );
    }
  }
});

test("a slower refresh cannot overwrite a newer one and unrelated actions stay valid", () => {
  const scope = createConversationRequestScope();
  scope.select("a");
  const slow = scope.begin("a", "feed"),
    visit = scope.begin("a", "visit");
  const latest = scope.begin("a", "feed");
  let feed = "";
  assert.equal(
    latest.apply(() => {
      feed = "New";
    }),
    true,
  );
  assert.equal(
    slow.apply(() => {
      feed = "Old";
    }),
    false,
  );
  assert.equal(
    visit.apply(() => {}),
    true,
  );
  assert.equal(feed, "New");
  assert.equal(
    scope.begin("b", "feed").apply(() => {}),
    false,
  );
  assert.equal(
    latest.apply(() => {}),
    true,
  );
});

test("a refresh started before reading keeps unrelated unread messages and cannot restore the read badge", () => {
  const incoming = ["a", "b", "c"].map((id) => ({
    id,
    unread: 3,
  })) as Conversation[];
  const readsAtRequest = new Map([
    ["a", 1],
    ["b", 1],
  ]);
  const currentReads = new Map([
    ["a", 2],
    ["b", 1],
  ]);
  assert.deepEqual(
    reconcileConversationReads(incoming, readsAtRequest, currentReads).map(
      ({ id, unread }) => ({ id, unread }),
    ),
    [
      { id: "a", unread: 0 },
      { id: "b", unread: 3 },
      { id: "c", unread: 3 },
    ],
  );
  assert.equal(incoming[0].unread, 3);
  // A later refresh may show genuinely new unread messages again.
  assert.equal(
    reconcileConversationReads(incoming, currentReads, currentReads)[0].unread,
    3,
  );
});
