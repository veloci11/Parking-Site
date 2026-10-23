import { test } from "node:test";
import assert from "node:assert/strict";
import {
  expandMapPrices,
  mapMarkerPriceLines,
} from "../src/lib/map-marker-label";
import { groupMapMarkers } from "../src/lib/map-result-bounds";
import { selectedMapOffset, selectedMapZoom } from "../src/lib/map-view";
import type { Space, TransactionType } from "../src/lib/types";

const plain = (value: string) => value.replace(/[\u00a0\u202f]/g, " ");
const price = (cents: number, transactionType: TransactionType = "sale") => ({
  priceCents: cents,
  transactionType,
});
const place = (
  id: string,
  cents: number,
  kind: TransactionType = "sale",
  status: "available" | "sold" = "available",
): Space => ({
  id,
  number: id,
  level: -1,
  areaM2: 12,
  lengthM: 5,
  widthM: 2.4,
  clearanceM: 2.1,
  offer: { transactionType: kind, priceCents: cents, status },
});

test("nearby listings keep their full prices visible instead of only an ad count", () => {
  assert.deepEqual(
    mapMarkerPriceLines([price(1850000), price(3200000)]).map(plain),
    ["18 500–32 000 €"],
  );
  assert.deepEqual(mapMarkerPriceLines([price(1850000)]).map(plain), [
    "18 500 €",
  ]);
  assert.deepEqual(
    mapMarkerPriceLines([price(12000, "rent"), price(18000, "rent")]).map(
      plain,
    ),
    ["120–180 € / mois"],
  );
  assert.deepEqual(
    mapMarkerPriceLines([price(1850000), price(1850000)]).map(plain),
    ["18 500 €"],
  );
  assert.equal(expandMapPrices(2, 16.5), true);
  assert.equal(expandMapPrices(3, 17), true);
  assert.equal(expandMapPrices(1, 17), false);
  assert.equal(expandMapPrices(4, 17), false);
  assert.equal(expandMapPrices(2, 14), false);
  assert.equal(expandMapPrices(2, 16.5, 134), true);
  assert.equal(expandMapPrices(3, 16.5, 134), false);
});

test("map prices keep sales, rents and whole lots distinct and respect filtered available units", () => {
  const listing = {
    ...price(1850000),
    pricingMode: "per_space" as const,
    spaces: [
      place("12", 1850000),
      place("13", 2200000),
      place("14", 9000, "rent"),
      place("15", 1, "sale", "sold"),
    ],
  };
  assert.deepEqual(mapMarkerPriceLines([listing], "sale").map(plain), [
    "18 500–22 000 € / place",
  ]);
  assert.deepEqual(mapMarkerPriceLines([listing], "rent").map(plain), [
    "90 € / mois / place",
  ]);
  assert.deepEqual(mapMarkerPriceLines([listing]).map(plain), [
    "Vente 18 500–22 000 € / place",
    "Location 90 € / mois / place",
  ]);
  assert.deepEqual(
    mapMarkerPriceLines([price(3200000), listing], "sale").map(plain),
    ["32 000 € / lot", "18 500–22 000 € / place"],
  );
  assert.deepEqual(
    mapMarkerPriceLines(
      [
        {
          ...listing,
          catalogMatch: {
            priceCents: 2200000,
            transactionType: "sale",
            spaceIds: ["13"],
          },
        },
      ],
      "sale",
    ).map(plain),
    ["22 000 € / place"],
  );
  assert.deepEqual(
    mapMarkerPriceLines(
      [
        {
          ...listing,
          catalogMatch: {
            priceCents: 1850000,
            transactionType: "sale",
            spaceIds: ["12", "13"],
          },
        },
      ],
      "sale",
    ).map(plain),
    ["Dès 18 500 € / place"],
  );
  assert.deepEqual(mapMarkerPriceLines([price(0), price(NaN)]), [
    "Prix à préciser",
  ]);
});

test("collision grouping measures the actual expanded price labels and keeps every listing reachable", () => {
  const measurements: string[][] = [];
  const groups = groupMapMarkers(
    [
      { id: "12", x: 100, y: 100, width: 110, height: 52 },
      { id: "13", x: 115, y: 100, width: 110, height: 52 },
      { id: "24", x: 100, y: 20, width: 110, height: 52 },
      { id: "far", x: 400, y: 400, width: 110, height: 52 },
    ],
    (count, ids) => {
      measurements.push(ids);
      return { width: 160, height: count * 52 };
    },
  );
  assert.deepEqual(groups[0].ids, ["12", "13", "24"]);
  assert.deepEqual(groups[1].ids, ["far"]);
  assert.ok(measurements.some((ids) => ids.join(",") === "12,13,24"));
  assert.equal(new Set(groups.flatMap((group) => group.ids)).size, 4);
});

test("selecting an ad restores a street view from a stale region camera without overzooming approximate positions", () => {
  assert.equal(selectedMapZoom(9, "exact_opt_in"), 16.5);
  assert.equal(selectedMapZoom(17.5, "exact_opt_in"), 17.5);
  assert.equal(selectedMapZoom(20, "exact_opt_in"), 19);
  assert.equal(selectedMapZoom(NaN, "exact_opt_in"), 16.5);
  assert.equal(selectedMapZoom(9, "area"), 14);
  assert.equal(selectedMapZoom(17.5, "area"), 15);
});

test("a two-price stack remains visible above mobile controls after the canvas shrinks", () => {
  const canvasHeight = 242;
  const controlsTop = 150;
  const markerHeight = 96;
  const [, offset] = selectedMapOffset(canvasHeight, markerHeight, controlsTop);
  const markerBottom = canvasHeight / 2 + offset;
  assert.ok(markerBottom <= controlsTop - 16);
  assert.ok(markerBottom - markerHeight >= 12);
  const [, desktopOffset] = selectedMapOffset(580, markerHeight);
  assert.ok(580 / 2 + desktopOffset - markerHeight > 100);
  assert.ok(580 / 2 + desktopOffset < 480);
  assert.deepEqual(selectedMapOffset(0, markerHeight), [0, 0]);
});
