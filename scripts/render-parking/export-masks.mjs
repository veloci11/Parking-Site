import sharp from "sharp";
import { readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
const folder = fileURLToPath(
  new URL("../../public/parking-renders/", import.meta.url),
);
const work = fileURLToPath(
  new URL("../../.data/render-parking/", import.meta.url),
);
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
function area(points) {
  let a = 0;
  for (let i = 0; i < points.length - 1; i++)
    a += points[i][0] * points[i + 1][1] - points[i + 1][0] * points[i][1];
  return Math.abs(a / 2);
}
function distance(p, a, b) {
  const dx = b[0] - a[0],
    dy = b[1] - a[1],
    len = dx * dx + dy * dy;
  if (!len) return Math.hypot(p[0] - a[0], p[1] - a[1]);
  const t = Math.max(
    0,
    Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / len),
  );
  return Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dy);
}
function simplify(points, tolerance) {
  if (points.length <= 2) return points;
  let far = 0,
    index = 0;
  for (let i = 1; i < points.length - 1; i++) {
    const d = distance(points[i], points[0], points.at(-1));
    if (d > far) {
      far = d;
      index = i;
    }
  }
  return far > tolerance
    ? [
        ...simplify(points.slice(0, index + 1), tolerance).slice(0, -1),
        ...simplify(points.slice(index), tolerance),
      ]
    : [points[0], points.at(-1)];
}
function contours(binary, w, h) {
  const stride = w + 1,
    edges = new Map();
  const add = (x1, y1, x2, y2) => {
    const a = y1 * stride + x1,
      b = y2 * stride + x2;
    if (!edges.has(a)) edges.set(a, []);
    edges.get(a).push(b);
  };
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++)
      if (binary[y * w + x]) {
        if (!y || !binary[(y - 1) * w + x]) add(x, y, x + 1, y);
        if (x === w - 1 || !binary[y * w + x + 1]) add(x + 1, y, x + 1, y + 1);
        if (y === h - 1 || !binary[(y + 1) * w + x])
          add(x + 1, y + 1, x, y + 1);
        if (!x || !binary[y * w + x - 1]) add(x, y + 1, x, y);
      }
  const result = [];
  for (const start of edges.keys())
    while (edges.get(start)?.length) {
      const loop = [];
      let current = start,
        count = 0;
      do {
        loop.push([current % stride, Math.floor(current / stride)]);
        const next = edges.get(current)?.pop();
        if (next === undefined) throw Error("Open mask contour");
        current = next;
        if (++count > 500000) throw Error("Mask contour bound exceeded");
      } while (current !== start);
      loop.push(loop[0]);
      if (area(loop) < 8) continue;
      let tolerance = 0.8;
      let reduced = simplify(loop, tolerance);
      while (reduced.length > 512) {
        tolerance *= 1.5;
        reduced = simplify(loop, tolerance);
      }
      if (reduced.length >= 4)
        result.push(
          reduced
            .slice(0, -1)
            .map(([x, y]) => [+(x / w).toFixed(7), +(y / h).toFixed(7)]),
        );
    }
  if (result.length > 64) throw Error("More than 64 mask contours");
  return result;
}
for (const level of [1, 2]) {
  const name = `demo-level-minus-${level}`,
    metadataPath = `${folder}${name}.json`;
  const metadata = JSON.parse(await readFile(metadataPath, "utf8"));
  for (const space of metadata.spaces) {
    const input = `${work}${name}-space-${space.number}-mask-raw.png`;
    const { data, info } = await sharp(input)
      .removeAlpha()
      .greyscale()
      .raw()
      .toBuffer({ resolveWithObject: true });
    if (info.width !== metadata.width || info.height !== metadata.height)
      throw Error("Mask and beauty dimensions differ");
    const w = info.width,
      h = info.height,
      rgba = Buffer.alloc(w * h * 4, 255),
      binary = new Uint8Array(w * h);
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++) {
        const i = y * w + x;
        const rawAlpha = inside((x + 0.5) / w, (y + 0.5) / h, space.polygon)
          ? data[i]
          : 0;
        // Remove Blender's one-byte PNG dithering at solid black/white endpoints.
        const alpha = rawAlpha <= 2 ? 0 : rawAlpha >= 253 ? 255 : rawAlpha;
        rgba[i * 4 + 3] = alpha;
        binary[i] = alpha >= 128 ? 1 : 0;
      }
    const maskName = `${name}-space-${space.number}-mask.png`,
      path = `${folder}${maskName}`;
    await sharp(rgba, { raw: { width: w, height: h, channels: 4 } })
      .png({ compressionLevel: 9 })
      .toFile(path);
    const bytes = await readFile(path);
    space.mask = `/parking-renders/${maskName}`;
    space.maskHash = createHash("sha256").update(bytes).digest("hex");
    space.hitContours = contours(binary, w, h);
    if (!space.hitContours.length) throw Error("Empty visible hit region");
    console.log(
      JSON.stringify({
        level: -level,
        space: space.number,
        maskBytes: bytes.length,
        contours: space.hitContours.length,
        maxContourPoints: Math.max(...space.hitContours.map((c) => c.length)),
      }),
    );
  }
  metadata.occlusion = {
    method: "Identical-camera Cycles opaque emission geometry pass",
    samples: 8,
    hitThreshold: 128,
    maxContours: 64,
    maxPointsPerContour: 512,
    simplificationPx: 0.8,
    hashAlgorithm: "SHA-256",
  };
  await writeFile(metadataPath, `${JSON.stringify(metadata, null, 2)}\n`);
}
