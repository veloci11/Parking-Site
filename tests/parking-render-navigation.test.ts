import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { parseParkingRender } from "../src/lib/parking-render";
import {
  parkingRenderBadges,
  parkingRenderFocus,
} from "../src/lib/parking-render-navigation";

const frame = parseParkingRender(
  JSON.parse(
    readFileSync("public/parking-renders/demo-level-minus-1.json", "utf8"),
  ),
  -1,
)!;

function inside(point: number[], polygon: number[][]) {
  let result = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const [xi, yi] = polygon[i],
      [xj, yj] = polygon[j];
    if (
      yi > point[1] !== yj > point[1] &&
      point[0] < ((xj - xi) * (point[1] - yi)) / (yj - yi) + xi
    )
      result = !result;
  }
  return result;
}

test("approved 12 and 13 badges remain inside their own place and do not collide on mobile or desktop", () => {
  for (const width of [296, 320, 358, 390, 600, 900]) {
    const height = (width * frame.height) / frame.width;
    const badges = parkingRenderBadges(frame.spaces, width, height);
    assert.deepEqual(
      badges.map((badge) => badge.number),
      ["12", "13"],
    );
    for (const [index, badge] of badges.entries()) {
      assert.equal(badge.visible, true, `visible number at ${width}px`);
      assert.deepEqual(
        badge.anchor,
        frame.spaces[index].anchor,
        "never move a number onto another place",
      );
      for (let angle = 0; angle < Math.PI * 2; angle += Math.PI / 8) {
        const point = [
          badge.anchor[0] + (Math.cos(angle) * badge.diameter) / 2 / width,
          badge.anchor[1] + (Math.sin(angle) * badge.diameter) / 2 / height,
        ];
        assert(
          inside(point, frame.spaces[index].polygon),
          `badge ${badge.number} stays on its own floor polygon at ${width}px`,
        );
      }
    }
    const distance = Math.hypot(
      (badges[0].anchor[0] - badges[1].anchor[0]) * width,
      (badges[0].anchor[1] - badges[1].anchor[1]) * height,
    );
    assert(distance > (badges[0].diameter + badges[1].diameter) / 2 + 5);
  }
});

test("unreadable badges are omitted instead of moving to a neighbouring place", () => {
  const badges = parkingRenderBadges(frame.spaces, 100, 75);
  assert(badges.every((badge) => !badge.visible));
  assert.deepEqual(
    badges.map((badge) => badge.anchor),
    frame.spaces.map((space) => space.anchor),
  );
  assert(
    parkingRenderBadges(frame.spaces, 0, 0).every((badge) => !badge.visible),
  );
});

test("focusing a place keeps the fixed perspective and overview exactly resets the transform", () => {
  for (const area of frame.spaces) {
    const transform = parkingRenderFocus(area, true);
    const match = /translate\(([-.\d]+)%, ([-.\d]+)%\) scale\(([-.\d]+)\)/.exec(
      transform,
    )!;
    const scale = Number(match[3]);
    assert.equal(scale, 1.12);
    const x = 0.5 + (area.anchor![0] - 0.5) * scale + Number(match[1]) / 100;
    const y = 0.5 + (area.anchor![1] - 0.5) * scale + Number(match[2]) / 100;
    assert(Math.abs(x - 0.52) < 0.001 && Math.abs(y - 0.46) < 0.001);
    assert.equal(parkingRenderFocus(area, false), "translate(0%, 0%) scale(1)");
  }
  assert.equal(
    parkingRenderFocus(undefined, true),
    "translate(0%, 0%) scale(1)",
  );
});
