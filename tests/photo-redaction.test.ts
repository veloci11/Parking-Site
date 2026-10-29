import test from "node:test";
import assert from "node:assert/strict";
import sharp from "sharp";
import { createHash } from "node:crypto";
import {
  mkdtemp,
  realpath,
  readFile,
  writeFile,
  chmod,
  stat,
  mkdir,
  symlink,
  rm,
  access,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { main } from "../scripts/prepare-photo";
import {
  inspectPhoto,
  redactPhoto,
  preparePhotoFile,
  reviewPhotoFile,
  PHOTO_MAX_BYTES,
} from "../src/server/photo-redaction";

const sha = (bytes: Buffer) => createHash("sha256").update(bytes).digest("hex");
async function fixture() {
  const bytes = Buffer.alloc(8 * 6 * 3);
  for (let pixel = 0; pixel < 48; pixel++) {
    bytes[pixel * 3] = 40 + pixel;
    bytes[pixel * 3 + 1] = 90;
    bytes[pixel * 3 + 2] = 220; // includes a blue plate band, not just its text.
  }
  return sharp(bytes, { raw: { width: 8, height: 6, channels: 3 } })
    .withExif({ IFD0: { Artist: "PRIVATE fixture author" } })
    .png()
    .toBuffer();
}
function plan(input: Buffer) {
  return {
    version: 1,
    coordinateSpace: "exif-oriented-pixels",
    sourceSha256: sha(input),
    width: 8,
    height: 6,
    outputFormat: "png",
    operatorReference: "fixture-operator",
    reason: "Cover every plate pixel including its full blue band.",
    declaredAt: new Date().toISOString(),
    rectangles: [
      {
        kind: "plate",
        x: 1,
        y: 1,
        width: 5,
        height: 2,
        wholePlateIncludingBlue: true,
      },
      { kind: "face", x: 7, y: 5, width: 1, height: 1 },
    ],
  };
}
function review(outputSha256: string) {
  return {
    version: 1,
    outputSha256,
    reviewerReference: "fixture-human-reviewer",
    reason: "Synthetic full image and all opaque regions inspected.",
    declaredAt: new Date().toISOString(),
    attestations: {
      fullImageInspected: true,
      allSensitiveContentCovered: true,
      platesIncludingBlueCovered: true,
      sceneNotBeautified: true,
    },
  };
}
test("opaque masking covers the entire blue plate and face, leaves exterior pixels and input intact", async () => {
  const source = await fixture(),
    original = Buffer.from(source);
  const result = await redactPhoto(source, plan(source));
  const before = await sharp(source).removeAlpha().raw().toBuffer();
  const after = await sharp(result.bytes).raw().toBuffer();
  for (let y = 0; y < 6; y++)
    for (let x = 0; x < 8; x++) {
      const offset = (y * 8 + x) * 3;
      const masked =
        (x >= 1 && x < 6 && y >= 1 && y < 3) || (x === 7 && y === 5);
      assert.deepEqual(
        after.subarray(offset, offset + 3),
        masked ? Buffer.alloc(3) : before.subarray(offset, offset + 3),
      );
    }
  assert.deepEqual(source, original);
  assert.equal(result.trace.sourceSha256, sha(original));
  assert.equal(result.trace.outputSha256, sha(result.bytes));
  assert.deepEqual(result.trace.rectangles[0].normalized, {
    x: 1 / 8,
    y: 1 / 6,
    width: 5 / 8,
    height: 2 / 6,
  });
  const metadata = await sharp(result.bytes).metadata();
  assert.equal(metadata.format, "png");
  for (const key of ["exif", "icc", "iptc", "xmp"] as const)
    assert.equal(metadata[key], undefined);
  assert.equal(metadata.hasAlpha, false);
});
test("EXIF rotation is applied before rectangle coordinates and lossless WebP strips orientation metadata", async () => {
  const source = await sharp({
    create: { width: 4, height: 2, channels: 3, background: "#2266cc" },
  })
    .withMetadata({ orientation: 6 })
    .jpeg()
    .toBuffer();
  assert.equal((await sharp(source).metadata()).orientation, 6);
  assert.deepEqual(await inspectPhoto(source), {
    sourceSha256: sha(source),
    width: 2,
    height: 4,
    coordinateSpace: "exif-oriented-pixels",
  });
  const p = {
    ...plan(source),
    width: 2,
    height: 4,
    outputFormat: "webp",
    rectangles: [{ kind: "face", x: 0, y: 0, width: 1, height: 4 }],
  };
  const output = await redactPhoto(source, p);
  const meta = await sharp(output.bytes).metadata();
  assert.equal(meta.format, "webp");
  assert.equal(meta.width, 2);
  assert.equal(meta.height, 4);
  assert.equal(meta.orientation, undefined);
  assert.equal(meta.exif, undefined);
  assert.equal(meta.icc, undefined);
  const actual = await sharp(output.bytes).raw().toBuffer();
  const expected = await sharp(source)
    .autoOrient()
    .toColourspace("srgb")
    .removeAlpha()
    .raw()
    .toBuffer();
  for (let y = 0; y < 4; y++) {
    assert.deepEqual(actual.subarray(y * 6, y * 6 + 3), Buffer.alloc(3));
    assert.deepEqual(
      actual.subarray(y * 6 + 3, y * 6 + 6),
      expected.subarray(y * 6 + 3, y * 6 + 6),
    );
  }
});
test("plan rejects empty masks, wrong source/dimensions, bounds, incomplete plate attestation and extra fields", async () => {
  const source = await fixture(),
    p = plan(source);
  for (const invalid of [
    { ...p, rectangles: [] },
    { ...p, sourceSha256: "0".repeat(64) },
    { ...p, width: 7 },
    { ...p, rectangles: [{ ...p.rectangles[0], x: -1 }] },
    { ...p, rectangles: [{ ...p.rectangles[0], x: 7 }] },
    {
      ...p,
      rectangles: [{ ...p.rectangles[0], wholePlateIncludingBlue: undefined }],
    },
    { ...p, rectangles: [{ ...p.rectangles[0], width: 0 }] },
    { ...p, unknown: "must fail closed" },
    { ...p, declaredAt: "2099-01-01T00:00:00Z" },
  ])
    await assert.rejects(redactPhoto(source, invalid), /PHOTO_/);
});
test("real type, malformed/oversized files and animation containers are refused before publication", async () => {
  const png = await fixture();
  // APNG's animation-control chunk inserted ahead of the image data. CRC is not
  // needed here: the container is refused before native decoding.
  const actl = Buffer.alloc(20);
  actl.writeUInt32BE(8);
  actl.write("acTL", 4);
  actl.writeUInt32BE(2, 8);
  const apng = Buffer.concat([png.subarray(0, 33), actl, png.subarray(33)]);
  const webp = await sharp(png).webp().toBuffer();
  const anim = Buffer.alloc(14);
  anim.write("ANIM");
  anim.writeUInt32LE(6, 4);
  const animatedWebp = Buffer.concat([webp, anim]);
  animatedWebp.writeUInt32LE(animatedWebp.length - 8, 4);
  for (const bytes of [
    Buffer.from("<svg width='8' height='6'></svg>"),
    Buffer.from("GIF89a".repeat(5)),
    Buffer.alloc(30),
    Buffer.alloc(PHOTO_MAX_BYTES + 1),
    apng,
    animatedWebp,
  ])
    await assert.rejects(inspectPhoto(bytes), /PHOTO_/);
  const oversizedDimensions = Buffer.from(png);
  oversizedDimensions.writeUInt32BE(30_000, 16);
  oversizedDimensions.writeUInt32BE(30_000, 20);
  await assert.rejects(inspectPhoto(oversizedDimensions), /PHOTO_DECODE/);
});
test("private prepare/review preserves source and requires an explicit review bound to unchanged output", async () => {
  const root = await mkdtemp(join(await realpath(tmpdir()), "gp-photo-test-"));
  try {
    const input = join(root, "original.png"),
      p = join(root, "plan.json"),
      r = join(root, "human.json"),
      source = await fixture();
    await writeFile(input, source, { mode: 0o600 });
    await writeFile(p, JSON.stringify(plan(source)), { mode: 0o600 });
    const prepared = await preparePhotoFile(input, p, root),
      bundle = join(root, prepared.artifactId);
    assert.equal(prepared.requiresHumanReview, true);
    await assert.rejects(access(join(bundle, "upload.png")));
    const trace = JSON.parse(
      await readFile(join(bundle, "trace.json"), "utf8"),
    );
    assert.equal(trace.state, "pending_human_review");
    assert.equal(JSON.stringify(trace).includes(input), false);
    assert.equal((await stat(bundle)).mode & 0o077, 0);
    assert.equal((await stat(join(bundle, "trace.json"))).mode & 0o077, 0);
    await writeFile(
      r,
      JSON.stringify({ ...review(trace.outputSha256), attestations: {} }),
      { mode: 0o600 },
    );
    await assert.rejects(reviewPhotoFile(bundle, r), /PHOTO_PLAN_INVALID/);
    const candidate = await readFile(join(bundle, "candidate.png"));
    await writeFile(
      join(bundle, "candidate.png"),
      Buffer.from("tampered synthetic output"),
    );
    await writeFile(r, JSON.stringify(review(trace.outputSha256)), {
      mode: 0o600,
    });
    await assert.rejects(reviewPhotoFile(bundle, r), /PHOTO_OUTPUT_CHANGED/);
    await writeFile(join(bundle, "candidate.png"), candidate);
    const accepted = await reviewPhotoFile(bundle, r);
    assert.equal(accepted.state, "human_reviewed");
    assert.deepEqual(await readFile(join(bundle, "upload.png")), candidate);
    assert.deepEqual(await readFile(input), source);
    assert.equal((await stat(join(bundle, "upload.png"))).mode & 0o077, 0);
    await assert.rejects(reviewPhotoFile(bundle, r), /EEXIST/);
    const receipt = JSON.parse(
      await readFile(join(bundle, "review.json"), "utf8"),
    );
    assert.equal(receipt.outputSha256, sha(candidate));
    assert.equal(
      receipt.preparedTraceSha256,
      sha(await readFile(join(bundle, "trace.json"))),
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
test("unsafe/public directories, symlinks, nonprivate plans and in-place/unknown CLI options are refused", async () => {
  const root = await mkdtemp(
    join(await realpath(tmpdir()), "gp-photo-path-test-"),
  );
  try {
    const input = join(root, "original.png"),
      p = join(root, "plan.json"),
      source = await fixture();
    await writeFile(input, source, { mode: 0o600 });
    await writeFile(p, JSON.stringify(plan(source)), { mode: 0o600 });
    const publicDir = join(root, "public");
    await mkdir(publicDir, { mode: 0o700 });
    await assert.rejects(
      preparePhotoFile(input, p, publicDir),
      /PHOTO_UNSAFE_DIRECTORY/,
    );
    const link = join(root, "source-link.png");
    await symlink(input, link);
    await assert.rejects(
      preparePhotoFile(link, p, root),
      /PHOTO_REGULAR_FILE_REQUIRED/,
    );
    await chmod(p, 0o644);
    await assert.rejects(
      preparePhotoFile(input, p, root),
      /PHOTO_PRIVATE_FILE_REQUIRED/,
    );
    await chmod(root, 0o755);
    await assert.rejects(
      preparePhotoFile(input, p, root),
      /PHOTO_PRIVATE_DIRECTORY_REQUIRED/,
    );
    await assert.rejects(
      main(["prepare", "--input", input, "--plan", p, "--output", input]),
    );
    await assert.rejects(
      main(["inspect", "--input", input, "--review", p]),
      /PHOTO_ARGUMENTS/,
    );
    assert.deepEqual(await readFile(input), source);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
