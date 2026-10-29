import { test } from "node:test";
import assert from "node:assert/strict";
import { createExpression } from "@maplibre/maplibre-gl-style-spec";
import type { StyleSpecification } from "maplibre-gl";
import { withPoiIconFallback } from "../src/lib/map-style";

const providerStyle: StyleSpecification = {
  version: 8,
  sprite: "https://tiles.openfreemap.org/sprites/ofm_f384/ofm",
  sources: {
    openmaptiles: {
      type: "vector",
      tiles: ["https://example.com/{z}/{x}/{y}.pbf"],
    },
  },
  layers: [
    {
      id: "poi_r1",
      type: "symbol",
      source: "openmaptiles",
      "source-layer": "poi",
      layout: { "icon-image": ["get", "class"], "text-field": ["get", "name"] },
    },
    {
      id: "road-arrow",
      type: "symbol",
      source: "openmaptiles",
      "source-layer": "transportation",
      layout: { "icon-image": "arrow" },
    },
  ],
};

test("provider POIs use an existing neutral icon when their source class is absent from the sprite", () => {
  const fixed = withPoiIconFallback(providerStyle);
  const layer = fixed.layers[0];
  assert.equal(layer.type, "symbol");
  if (layer.type !== "symbol") return;
  const expression = createExpression(
    layer.layout!["icon-image"],
    "layers[0].layout.icon-image",
  );
  assert.equal(expression.result, "success");
  if (expression.result !== "success") return;
  const available = ["bank", "circle_11_black", "arrow"];
  for (const name of [
    "gate",
    "swimming_pool",
    "office",
    "recycling",
    "brownfield",
    "cycle_barrier",
    "atm",
    "bollard",
  ]) {
    const resolved = expression.value.evaluate(
      { zoom: 16 },
      { type: 1, properties: { class: name } },
      {},
      undefined,
      available,
    );
    assert.equal(resolved.name, "circle_11_black");
    assert.equal(resolved.available, true);
  }
  const bank = expression.value.evaluate(
    { zoom: 16 },
    { type: 1, properties: { class: "bank" } },
    {},
    undefined,
    available,
  );
  assert.equal(bank.name, "bank");
  assert.equal(bank.available, true);
  assert.deepEqual(layer.layout!["text-field"], ["get", "name"]);
  assert.equal(fixed.layers[1], providerStyle.layers[1]);
  assert.deepEqual(
    providerStyle.layers[0].type === "symbol" &&
      providerStyle.layers[0].layout!["icon-image"],
    ["get", "class"],
  );
});

test("custom map styles retain their own sprite contracts", () => {
  const custom = { ...providerStyle, sprite: "https://custom.example/sprite" };
  assert.equal(withPoiIconFallback(custom), custom);
});
