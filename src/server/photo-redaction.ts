/** Local operator preparation only. Never imported by a web route or uploader. */
import sharp from "sharp";
import { createHash, randomUUID } from "node:crypto";
import { constants } from "node:fs";
import { open, lstat, realpath, mkdir, rm } from "node:fs/promises";
import { join, resolve } from "node:path";
import { z } from "zod";

export const PHOTO_MAX_BYTES = 10 * 1024 * 1024;
export const PHOTO_MAX_PIXELS = 30_000_000;
const version = "gp-photo-redaction/1";
const hash = (bytes: Buffer) =>
  createHash("sha256").update(bytes).digest("hex");
const reference = z
  .string()
  .trim()
  .min(3)
  .max(160)
  .regex(/^[^\r\n\0]+$/);
const reason = z
  .string()
  .trim()
  .min(15)
  .max(2000)
  .regex(/^[^\0]+$/);
const declaredAt = z.string().datetime({ offset: true });
const digest = z.string().regex(/^[a-f0-9]{64}$/);
const pixel = z.number().int().min(0).max(30_000);
const rectangle = z
  .object({
    kind: z.enum(["plate", "face", "other_sensitive"]),
    x: pixel,
    y: pixel,
    width: pixel.positive(),
    height: pixel.positive(),
    wholePlateIncludingBlue: z.literal(true).optional(),
  })
  .strict()
  .refine((r) => r.kind !== "plate" || r.wholePlateIncludingBlue === true);
export const photoRedactionPlanSchema = z
  .object({
    version: z.literal(1),
    coordinateSpace: z.literal("exif-oriented-pixels"),
    sourceSha256: digest,
    width: pixel.positive(),
    height: pixel.positive(),
    outputFormat: z.enum(["png", "webp"]),
    operatorReference: reference,
    reason,
    declaredAt,
    rectangles: z.array(rectangle).min(1).max(100),
  })
  .strict();
const reviewSchema = z
  .object({
    version: z.literal(1),
    outputSha256: digest,
    reviewerReference: reference,
    reason,
    declaredAt,
    attestations: z
      .object({
        fullImageInspected: z.literal(true),
        allSensitiveContentCovered: z.literal(true),
        platesIncludingBlueCovered: z.literal(true),
        sceneNotBeautified: z.literal(true),
      })
      .strict(),
  })
  .strict();
const fraction = z.number().min(0).max(1);
const traceSchema = photoRedactionPlanSchema
  .omit({ version: true })
  .extend({
    artifactId: z.string().uuid(),
    toolVersion: z.literal(version),
    state: z.literal("pending_human_review"),
    outputSha256: digest,
    preparedAt: declaredAt,
    rectangles: z
      .array(
        z
          .object({
            ...rectangle.shape,
            normalized: z
              .object({
                x: fraction,
                y: fraction,
                width: fraction.positive(),
                height: fraction.positive(),
              })
              .strict(),
          })
          .strict()
          .refine(
            (r) => r.kind !== "plate" || r.wholePlateIncludingBlue === true,
          ),
      )
      .min(1)
      .max(100),
  })
  .strict();
function fail(code: string): never {
  throw new Error(`PHOTO_${code}`);
}
function parse<T>(schema: z.ZodType<T>, value: unknown): T {
  const parsed = schema.safeParse(value);
  if (!parsed.success) fail("PLAN_INVALID");
  return parsed.data;
}
function checkDeclaredDate(value: string) {
  if (Date.parse(value) > Date.now() + 300_000) fail("DATE_IN_FUTURE");
}
function fileFormat(bytes: Buffer): "jpeg" | "png" | "webp" {
  if (bytes.length < 20 || bytes.length > PHOTO_MAX_BYTES) fail("SIZE");
  if (bytes.subarray(0, 3).equals(Buffer.from([255, 216, 255]))) return "jpeg";
  const png = bytes
    .subarray(0, 8)
    .equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  const webp =
    bytes.toString("ascii", 0, 4) === "RIFF" &&
    bytes.toString("ascii", 8, 12) === "WEBP";
  if (!png && !webp) fail("FORMAT");
  // Detect animation containers before decoding just their first frame.
  for (let offset = png ? 8 : 12; offset + 8 <= bytes.length;) {
    const type = bytes.toString(
      "ascii",
      offset + (png ? 4 : 0),
      offset + (png ? 8 : 4),
    );
    const size = png
      ? bytes.readUInt32BE(offset)
      : bytes.readUInt32LE(offset + 4);
    if (["acTL", "fcTL", "fdAT", "ANIM", "ANMF"].includes(type))
      fail("ANIMATED");
    const end = offset + 8 + size + (png ? 4 : size % 2);
    if (end > bytes.length || end <= offset) fail("FORMAT");
    offset = end;
  }
  return png ? "png" : "webp";
}
async function normalizedPixels(bytes: Buffer) {
  const format = fileFormat(bytes);
  try {
    const image = sharp(bytes, {
      limitInputPixels: PHOTO_MAX_PIXELS,
      failOn: "warning",
    });
    const metadata = await image.metadata();
    if (metadata.format !== format || (metadata.pages || 1) !== 1)
      fail("ANIMATED_OR_FORMAT");
    const result = await image
      .autoOrient()
      .toColourspace("srgb")
      .flatten({ background: "#ffffff" })
      .removeAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
    if (
      result.info.channels !== 3 ||
      result.info.width * result.info.height > PHOTO_MAX_PIXELS
    )
      fail("PIXELS");
    return result;
  } catch (error) {
    if (error instanceof Error && error.message.startsWith("PHOTO_"))
      throw error;
    fail("DECODE");
  }
}
export async function inspectPhoto(bytes: Buffer) {
  const { info } = await normalizedPixels(bytes);
  return {
    sourceSha256: hash(bytes),
    width: info.width,
    height: info.height,
    coordinateSpace: "exif-oriented-pixels",
  };
}
export async function redactPhoto(bytes: Buffer, value: unknown) {
  const plan = parse(photoRedactionPlanSchema, value);
  checkDeclaredDate(plan.declaredAt);
  if (hash(bytes) !== plan.sourceSha256) fail("SOURCE_CHANGED");
  const { data, info } = await normalizedPixels(bytes);
  if (plan.width !== info.width || plan.height !== info.height)
    fail("DIMENSIONS");
  for (const r of plan.rectangles) {
    if (r.x + r.width > info.width || r.y + r.height > info.height)
      fail("RECTANGLE_BOUNDS");
    // Replace every RGB sample, including the blue plate band. No blur/alpha/layer
    // can retain the covered input pixels in this freshly encoded output.
    for (let y = r.y; y < r.y + r.height; y++)
      data.fill(
        0,
        (y * info.width + r.x) * 3,
        (y * info.width + r.x + r.width) * 3,
      );
  }
  const output = sharp(data, {
    raw: { width: info.width, height: info.height, channels: 3 },
  });
  const prepared = await (
    plan.outputFormat === "png" ? output.png() : output.webp({ lossless: true })
  ).toBuffer();
  if (prepared.length > PHOTO_MAX_BYTES) fail("OUTPUT_SIZE");
  return {
    bytes: prepared,
    trace: {
      toolVersion: version,
      state: "pending_human_review" as const,
      sourceSha256: plan.sourceSha256,
      outputSha256: hash(prepared),
      width: info.width,
      height: info.height,
      outputFormat: plan.outputFormat,
      coordinateSpace: plan.coordinateSpace,
      operatorReference: plan.operatorReference,
      reason: plan.reason,
      declaredAt: plan.declaredAt,
      preparedAt: new Date().toISOString(),
      rectangles: plan.rectangles.map((r) => ({
        ...r,
        normalized: {
          x: r.x / info.width,
          y: r.y / info.height,
          width: r.width / info.width,
          height: r.height / info.height,
        },
      })),
    },
  };
}

async function privateDirectory(path: string) {
  const full = resolve(path);
  const stat = await lstat(full);
  if (
    !stat.isDirectory() ||
    stat.isSymbolicLink() ||
    (stat.mode & 0o077) !== 0 ||
    (process.getuid && stat.uid !== process.getuid())
  )
    fail("PRIVATE_DIRECTORY_REQUIRED");
  if (
    (await realpath(full)) !== full ||
    full
      .split(/[\\/]/)
      .some((part) => /^(public|\.git|node_modules|\.next.*)$/i.test(part))
  )
    fail("UNSAFE_DIRECTORY");
  return full;
}
async function readRegular(path: string, limit: number, privateFile = false) {
  const stat = await lstat(path);
  if (!stat.isFile() || stat.isSymbolicLink()) fail("REGULAR_FILE_REQUIRED");
  const file = await open(
    path,
    constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK,
  );
  try {
    const actual = await file.stat();
    if (!actual.isFile() || actual.size > limit || actual.size < 1)
      fail("SIZE");
    if (
      privateFile &&
      ((actual.mode & 0o077) !== 0 ||
        actual.nlink !== 1 ||
        (process.getuid && actual.uid !== process.getuid()))
    )
      fail("PRIVATE_FILE_REQUIRED");
    const bytes = Buffer.alloc(limit + 1);
    let length = 0;
    for (;;) {
      const part = await file.read(bytes, length, bytes.length - length, null);
      length += part.bytesRead;
      if (length > limit) fail("SIZE");
      if (!part.bytesRead) break;
    }
    return bytes.subarray(0, length);
  } finally {
    await file.close();
  }
}
async function readJSON(path: string) {
  try {
    return JSON.parse(
      (await readRegular(path, 128 * 1024, true)).toString("utf8"),
    );
  } catch (error) {
    if (error instanceof Error && error.message.startsWith("PHOTO_"))
      throw error;
    fail("JSON_OR_FILE");
  }
}
async function writeNew(path: string, bytes: Buffer | string) {
  const file = await open(
    path,
    constants.O_WRONLY |
      constants.O_CREAT |
      constants.O_EXCL |
      constants.O_NOFOLLOW,
    0o600,
  );
  try {
    await file.writeFile(bytes);
    await file.sync();
  } finally {
    await file.close();
  }
}
export async function inspectPhotoFile(input: string) {
  return inspectPhoto(await readRegular(input, PHOTO_MAX_BYTES));
}
export async function preparePhotoFile(
  input: string,
  planFile: string,
  outputDirectory: string,
) {
  const parent = await privateDirectory(outputDirectory);
  const result = await redactPhoto(
    await readRegular(input, PHOTO_MAX_BYTES),
    await readJSON(planFile),
  );
  const artifactId = randomUUID(),
    directory = join(parent, artifactId);
  await mkdir(directory, { mode: 0o700 });
  try {
    await writeNew(
      join(directory, `candidate.${result.trace.outputFormat}`),
      result.bytes,
    );
    await writeNew(
      join(directory, "trace.json"),
      JSON.stringify({ artifactId, ...result.trace }, null, 2) + "\n",
    );
  } catch (error) {
    await rm(directory, { recursive: true, force: true });
    throw error;
  }
  return { artifactId, state: result.trace.state, requiresHumanReview: true };
}
export async function reviewPhotoFile(bundle: string, reviewFile: string) {
  const directory = await privateDirectory(bundle);
  const traceBytes = await readRegular(
    join(directory, "trace.json"),
    128 * 1024,
    true,
  );
  let value: unknown;
  try {
    value = JSON.parse(traceBytes.toString("utf8"));
  } catch {
    fail("TRACE_INVALID");
  }
  const trace = parse(traceSchema, value);
  const review = parse(reviewSchema, await readJSON(reviewFile));
  checkDeclaredDate(review.declaredAt);
  const candidate = await readRegular(
    join(directory, `candidate.${trace.outputFormat}`),
    PHOTO_MAX_BYTES,
    true,
  );
  if (
    hash(candidate) !== trace.outputSha256 ||
    review.outputSha256 !== trace.outputSha256
  )
    fail("OUTPUT_CHANGED");
  const upload = join(directory, `upload.${trace.outputFormat}`);
  // Reserve the review receipt first, exclusively. A second review never
  // overwrites an earlier receipt, release copy, source or approved asset.
  await writeNew(
    join(directory, "review.json"),
    JSON.stringify(
      {
        ...review,
        toolVersion: version,
        artifactId: trace.artifactId,
        preparedTraceSha256: hash(traceBytes),
        reviewedAt: new Date().toISOString(),
        state: "human_reviewed",
      },
      null,
      2,
    ) + "\n",
  );
  await writeNew(upload, candidate);
  return {
    artifactId: trace.artifactId as string,
    state: "human_reviewed",
    uploadFile: `upload.${trace.outputFormat}`,
  };
}
