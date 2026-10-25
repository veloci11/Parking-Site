import { test } from "node:test";
import assert from "node:assert/strict";
import {
  photoLoadReducer,
  type PhotoLoadState,
} from "../src/lib/photo-load-state";

test("a failed preload remains failed on selection until its own retry completes", () => {
  let state: PhotoLoadState = {};
  state = photoLoadReducer(state, { type: "ready", src: "one", attempt: 0 });
  state = photoLoadReducer(state, { type: "failed", src: "two", attempt: 0 });
  assert.equal(state.one.status, "ready");
  assert.equal(state.two.status, "failed");
  const firstPhoto = state.one;
  state = photoLoadReducer(state, { type: "retry", src: "two" });
  assert.equal(
    state.two.attempt,
    1,
    "only the failed image receives a new mount key",
  );
  assert.equal(state.two.status, "loading");
  assert.equal(state.one, firstPhoto, "the decoded neighbor stays intact");
  state = photoLoadReducer(state, { type: "ready", src: "two", attempt: 1 });
  assert.equal(state.two.status, "ready");
  assert.equal(state.one, firstPhoto);
});

test("stale decode and error completions cannot overwrite a retry or mask a failure", () => {
  let state = photoLoadReducer({}, { type: "failed", src: "two", attempt: 0 });
  assert.equal(
    photoLoadReducer(state, { type: "ready", src: "two", attempt: 0 }),
    state,
  );
  state = photoLoadReducer(state, { type: "retry", src: "two" });
  for (const type of ["ready", "failed"] as const)
    assert.equal(
      photoLoadReducer(state, { type, src: "two", attempt: 0 }),
      state,
    );
  state = photoLoadReducer(state, { type: "ready", src: "two", attempt: 1 });
  assert.equal(
    photoLoadReducer(state, { type: "failed", src: "two", attempt: 0 }),
    state,
  );
  assert.equal(state.two.status, "ready");
});
