import { test } from "node:test";
import assert from "node:assert/strict";
import {
  approximateBrowserPosition,
  geolocationErrorMessage,
} from "../src/lib/geolocation";
test("browser coordinates are validated and raw precision is discarded", () => {
  assert.deepEqual(
    approximateBrowserPosition(2.3739123, 48.8446345),
    [2.374, 48.845],
  );
  for (const point of [
    [181, 45],
    [4, 91],
    [NaN, 45],
    [4, Infinity],
  ])
    assert.equal(
      approximateBrowserPosition(...(point as [number, number])),
      null,
    );
});
test("denied, unavailable and timeout states offer manual search fallback", () => {
  assert.match(geolocationErrorMessage(1), /refusée/);
  assert.match(geolocationErrorMessage(2), /indisponible/);
  assert.match(geolocationErrorMessage(3), /temps/);
});
