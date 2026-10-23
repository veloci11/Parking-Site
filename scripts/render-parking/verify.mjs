import sharp from "sharp";
import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
const root = fileURLToPath(new URL("../../", import.meta.url));
const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");
function inside(x, y, poly) {
  let state = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i],
      b = poly[j];
    if (
      a[1] > y !== b[1] > y &&
      x < ((b[0] - a[0]) * (y - a[1])) / (b[1] - a[1]) + a[0]
    )
      state = !state;
  }
  return state;
}
function project(j, point) {
  const v = [...point, 1],
    m = j.camera.worldToCamera;
  const row = (i) => m[i].reduce((sum, c, k) => sum + c * v[k], 0);
  return [
    0.5 + row(0) / j.camera.orthoScale,
    0.5 - row(1) / ((j.camera.orthoScale * j.height) / j.width),
  ];
}
const results = [];
for (const level of [1, 2]) {
  const stem = `${root}public/parking-renders/demo-level-minus-${level}`;
  const j = JSON.parse(await readFile(`${stem}.json`, "utf8"));
  const bytes = await readFile(`${stem}.webp`),
    meta = await sharp(bytes).metadata();
  if (
    j.schemaVersion !== "gp-parking-render/1" ||
    !j.isDemo ||
    j.level !== -level ||
    meta.width !== 2048 ||
    meta.height !== 1536 ||
    !meta.hasAlpha ||
    j.renderHash !== hash(bytes)
  )
    throw Error("Beauty contract mismatch");
  if (
    j.sourceManifestHash !==
    hash(
      await readFile(`${root}scripts/render-parking/demo-minus-${level}.json`),
    )
  )
    throw Error("Source manifest has changed since rendering");
  if (
    j.scriptHash !==
    hash(await readFile(`${root}scripts/render-parking/render.py`))
  )
    throw Error("Renderer script has changed since rendering");
  const expected = level === 1 ? ["12", "13"] : ["24"];
  if (
    JSON.stringify(j.spaces.map((s) => s.number)) !== JSON.stringify(expected)
  )
    throw Error("Unexpected clickable space numbers");
  for (const space of j.spaces) {
    const b = await readFile(`${root}public${space.mask}`);
    if (space.maskHash !== hash(b)) throw Error("Mask hash mismatch");
    const { data, info } = await sharp(b)
      .raw()
      .toBuffer({ resolveWithObject: true });
    const alpha = (x, y) =>
      data[
        (Math.floor(y * info.height) * info.width +
          Math.floor(x * info.width)) *
          4 +
          3
      ];
    const hits = (x, y) =>
      space.hitContours.reduce((v, c) => v !== inside(x, y, c), false);
    if (
      info.width !== 2048 ||
      info.height !== 1536 ||
      info.channels !== 4 ||
      alpha(0.01, 0.01) !== 0 ||
      alpha(...space.anchor) < 128 ||
      !hits(...space.anchor)
    )
      throw Error("Mask visible-floor contract mismatch");
    // Documented fictional front column head. Its projection overlaps the stall in 2D.
    const column = project(j, [space.number === "13" ? 5.65 : 1.55, 2.15, 3.0]);
    if (
      !inside(...column, space.polygon) ||
      alpha(...column) !== 0 ||
      hits(...column)
    )
      throw Error("Foreground column is not excluded from selection");
    if (space.hitContours.length > 64) throw Error("Too many contours");
    for (const contour of space.hitContours) {
      if (contour.length > 512 || contour.length < 3)
        throw Error("Contour size outside contract");
      for (const p of contour)
        if (
          p.length !== 2 ||
          p.some((v) => !Number.isFinite(v) || v < 0 || v > 1)
        )
          throw Error("Contour coordinate outside image");
    }
    for (const p of [...space.polygon, space.label, space.anchor])
      if (
        p.length !== 2 ||
        p.some((v) => !Number.isFinite(v) || v < 0 || v > 1)
      )
        throw Error("Projection coordinate outside image");
  }
  results.push({
    level: j.level,
    numbers: j.spaces.map((s) => s.number),
    imageBytes: bytes.length,
    masksVerified: j.spaces.length,
    occludedColumnsExcluded: true,
  });
}
console.log(JSON.stringify({ result: "pass", renders: results }, null, 2));
