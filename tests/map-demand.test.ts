import { test } from "node:test";
import assert from "node:assert/strict";
import {
  observeCityMapDemand,
  type MapDemandViewport,
} from "../src/lib/map-demand";

function viewport(initialMobile: boolean) {
  let mobile = initialMobile;
  const listeners = new Set<() => void>();
  const source: MapDemandViewport = {
    get matches() {
      return mobile;
    },
    addEventListener: (_event, listener) => {
      listeners.add(listener);
    },
    removeEventListener: (_event, listener) => {
      listeners.delete(listener);
    },
  };
  return {
    source,
    listeners,
    resize: (nextMobile: boolean) => {
      mobile = nextMobile;
      for (const listener of listeners) listener();
    },
  };
}
test("mobile list never requests a map while its panel remains hidden", () => {
  const v = viewport(true);
  let requests = 0;
  const dispose = observeCityMapDemand(v.source, "list", () => requests++);
  v.resize(true);
  v.resize(true);
  assert.equal(requests, 0);
  dispose();
  assert.equal(v.listeners.size, 0);
});
test("opening Carte requests once; repeated viewport events do not request again", () => {
  const v = viewport(true);
  let requests = 0;
  const dispose = observeCityMapDemand(v.source, "map", () => requests++);
  assert.equal(requests, 1);
  v.resize(true);
  v.resize(false);
  v.resize(true);
  assert.equal(requests, 1);
  dispose();
});
test("desktop requests immediately even when the mobile preference is Liste", () => {
  const v = viewport(false);
  let requests = 0;
  const dispose = observeCityMapDemand(v.source, "list", () => requests++);
  assert.equal(requests, 1);
  dispose();
});
test("resizing a hidden mobile list into desktop requests the visible map", () => {
  const v = viewport(true);
  let requests = 0;
  const dispose = observeCityMapDemand(v.source, "list", () => requests++);
  v.resize(false);
  assert.equal(requests, 1);
  v.resize(true);
  v.resize(false);
  assert.equal(requests, 1);
  dispose();
});
test("changing the mobile view cleans up the previous observer before demand", () => {
  const v = viewport(true);
  let requests = 0;
  const disposeList = observeCityMapDemand(v.source, "list", () => requests++);
  const stale = [...v.listeners][0];
  disposeList();
  const disposeMap = observeCityMapDemand(v.source, "map", () => requests++);
  assert.equal(requests, 1);
  assert.equal(v.listeners.size, 1);
  stale();
  assert.equal(requests, 1);
  disposeMap();
});
