import { test } from "node:test";
import assert from "node:assert/strict";
import {
  createMapAreaSearch,
  createMapLocationFocus,
} from "../src/lib/map-auto-search";
import type { MapSearchArea } from "../src/lib/map-view";

const area = (longitude = 2.5): MapSearchArea => ({
  bbox: [longitude, 48.8, longitude + 0.02, 48.9],
  center: [longitude + 0.01, 48.85],
});

test("a completed user gesture searches once after350ms; rendered results do not retrigger it", (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const calls: MapSearchArea[] = [];
  const controller = createMapAreaSearch({
    readArea: () => area(),
    enabled: () => true,
    search: (value) => {
      calls.push(value);
      // A result update may resize/reposition the map, without a user event.
      controller.begin(false);
      controller.end();
    },
  });
  controller.begin(true);
  controller.end();
  t.mock.timers.tick(349);
  assert.equal(calls.length, 0);
  t.mock.timers.tick(1);
  assert.deepEqual(calls, [area()]);
  t.mock.timers.tick(1000);
  controller.begin(true);
  controller.end();
  t.mock.timers.tick(350);
  assert.equal(calls.length, 1, "unchanged bounds are deduplicated");
  controller.dispose();
});

test("a second gesture cancels the old timer and searches only its final viewport", (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  let current = area();
  const calls: MapSearchArea[] = [];
  const controller = createMapAreaSearch({
    readArea: () => current,
    enabled: () => true,
    search: (value) => calls.push(value),
  });
  controller.begin(true);
  controller.end();
  t.mock.timers.tick(200);
  controller.begin(true);
  current = area(2.6);
  t.mock.timers.tick(1000);
  assert.equal(
    calls.length,
    0,
    "no query while the next gesture is in progress",
  );
  controller.end();
  t.mock.timers.tick(349);
  assert.equal(calls.length, 0);
  t.mock.timers.tick(1);
  assert.deepEqual(calls, [area(2.6)]);
  controller.dispose();
});

test("programmatic camera movements, hide, reset and disposal cancel pending searches", (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  let visible = true;
  let calls = 0;
  const controller = createMapAreaSearch({
    readArea: () => area(),
    enabled: () => visible,
    search: () => calls++,
  });
  // Initial load, selection, recenter, resize, north and2D/3D carry no user marker.
  for (let i = 0; i < 6; i++) {
    controller.begin(false);
    controller.end();
    t.mock.timers.tick(350);
  }
  assert.equal(calls, 0);
  controller.begin(true);
  controller.end();
  t.mock.timers.tick(200);
  controller.begin(false);
  controller.end();
  t.mock.timers.tick(350);
  assert.equal(calls, 0);
  controller.begin(true);
  controller.end();
  visible = false;
  controller.cancel();
  t.mock.timers.tick(350);
  assert.equal(calls, 0);
  visible = true;
  controller.begin(true);
  controller.end();
  controller.reset();
  t.mock.timers.tick(350);
  assert.equal(calls, 0);
  controller.begin(true);
  controller.end();
  controller.dispose();
  t.mock.timers.tick(350);
  controller.begin(true);
  controller.end();
  t.mock.timers.tick(350);
  assert.equal(calls, 0);
});

test("typed location waits for matching loaded results and is consumed once", () => {
  const focus = createMapLocationFocus();
  assert.equal(focus.setQuery("Paris"), true);
  assert.equal(focus.takeReady("Le Raincy", false), false);
  assert.equal(focus.takeReady("Paris", true), false);
  assert.equal(focus.takeReady("Paris", false), true);
  assert.equal(
    focus.takeReady("Paris", false),
    false,
    "filter changes must not recenter again",
  );
  assert.equal(focus.setQuery(" paris "), false);
  assert.equal(focus.takeReady("Paris", false), false);
  focus.setQuery("");
  assert.equal(
    focus.takeReady("", false),
    false,
    "automatic map area queries never recenter",
  );
});

test("manual map movement wins over outstanding text results until the next location search", () => {
  const focus = createMapLocationFocus();
  focus.setQuery("Le Raincy");
  assert.equal(focus.takeReady("Le Raincy", true), false);
  focus.suppress();
  assert.equal(focus.takeReady("Le Raincy", false), false);
  focus.setQuery("");
  focus.setQuery("Le Raincy");
  assert.equal(focus.takeReady("Le Raincy", false), true);
});
