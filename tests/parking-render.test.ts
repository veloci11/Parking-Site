import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import sharp from "sharp";
import { parseParkingRender } from "../src/lib/parking-render";

const file = (path: string) => new URL(`../public${path}`, import.meta.url);
const digest = (bytes: Buffer) =>
  createHash("sha256").update(bytes).digest("hex");

test("demo render plates and occlusion masks match the exported camera contract and exact hashes", async () => {
  for (const level of [-1, -2]) {
    const raw = JSON.parse(
      await readFile(
        file(`/parking-renders/demo-level-minus-${-level}.json`),
        "utf8",
      ),
    );
    const frame = parseParkingRender(raw, level);
    assert.ok(frame, `validated level ${level}`);
    assert.deepEqual(
      frame.spaces.map((space) => space.number),
      level === -1 ? ["12", "13"] : ["24"],
    );
    const plate = await readFile(file(frame.image));
    assert.equal(digest(plate), frame.renderHash);
    const meta = await sharp(plate).metadata();
    assert.deepEqual([meta.width, meta.height], [frame.width, frame.height]);
    for (const area of frame.spaces) {
      assert.ok(area.mask && area.maskHash && area.hitContours);
      const mask = await readFile(file(area.mask));
      assert.equal(digest(mask), area.maskHash);
      const { data, info } = await sharp(mask)
        .ensureAlpha()
        .raw()
        .toBuffer({ resolveWithObject: true });
      assert.deepEqual([info.width, info.height], [frame.width, frame.height]);
      let visible = 0;
      for (let i = 3; i < data.length; i += 4) if (data[i] > 127) visible++;
      // A slot mask must contain a visible floor and leave most of the photo untouched.
      assert.ok(visible > frame.width * frame.height * 0.001);
      assert.ok(visible < frame.width * frame.height * 0.1);
      assert.equal(
        data[3],
        0,
        "outside the rendered garage is never interactive",
      );
    }
  }
});

test("mismatched levels, duplicate numbers, external assets and incomplete occlusion exports are rejected", async () => {
  const raw = JSON.parse(
    await readFile(file("/parking-renders/demo-level-minus-1.json"), "utf8"),
  );
  assert.equal(parseParkingRender(raw, -2), null);
  assert.equal(parseParkingRender({ ...raw, isDemo: false }, -1), null);
  assert.equal(
    parseParkingRender(
      { ...raw, image: "https://outside.invalid/fake.webp" },
      -1,
    ),
    null,
  );
  assert.equal(
    parseParkingRender({ ...raw, spaces: [raw.spaces[0], raw.spaces[0]] }, -1),
    null,
  );
  assert.equal(
    parseParkingRender(
      {
        ...raw,
        spaces: [
          {
            ...raw.spaces[0],
            polygon: [
              [0, 0],
              [2, 0],
              [0, 1],
            ],
          },
        ],
      },
      -1,
    ),
    null,
  );
  assert.equal(
    parseParkingRender(
      { ...raw, spaces: [{ ...raw.spaces[0], maskHash: undefined }] },
      -1,
    ),
    null,
  );
});
