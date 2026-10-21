import { test } from "node:test";
import assert from "node:assert/strict";
import { normalizeMapView, normalizeMapSearchArea } from "../src/lib/map-view";
test("camera persisted state validates finite values and clamps renderer limits", () => {
  assert.equal(
    normalizeMapView({ center: [4, NaN], zoom: 14, bearing: 0, pitch: 55 }),
    null,
  );
  assert.equal(
    normalizeMapView({ center: [4, 45], zoom: "14", bearing: 0, pitch: 55 }),
    null,
  );
  assert.deepEqual(
    normalizeMapView({ center: [370, 95], zoom: 25, bearing: 390, pitch: 90 }),
    { center: [10, 85.051129], zoom: 19, bearing: 30, pitch: 70 },
  );
  const view = {
    center: [4.85, 45.75] as [number, number],
    zoom: 14,
    bearing: -28,
    pitch: 55,
  };
  const normalized = normalizeMapView(JSON.parse(JSON.stringify(view)))!;
  assert.ok(Math.abs(normalized.center[0] - 4.85) < 1e-10);
  assert.equal(normalized.bearing, -28);
});
test("search bounds preserve normal France view and explicitly widen crossing world", () => {
  assert.deepEqual(normalizeMapSearchArea([4, 45, 5, 46], [4.5, 45.5]), {
    bbox: [4, 45, 5, 46],
    center: [4.5, 45.5],
  });
  assert.deepEqual(
    normalizeMapSearchArea([170, -10, -170, 10], [180, 0])?.bbox,
    [-180, -10, 180, 10],
  );
  assert.deepEqual(
    normalizeMapSearchArea([-200, -100, 200, 100], [0, 0])?.bbox,
    [-180, -85.051129, 180, 85.051129],
  );
  for (const bad of [
    [4, 46, 5, 45],
    [4, 45, 4, 46],
    [NaN, 0, 5, 5],
    [1, 2, 3],
  ])
    assert.equal(normalizeMapSearchArea(bad, [4, 45]), null);
});
