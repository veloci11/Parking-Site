import { ZipFile } from "yazl";
import { createReadStream, createWriteStream } from "node:fs";
import { mkdtemp, rm, chmod, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Transform, type Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { createHash } from "node:crypto";
import { z } from "zod";
export const EXPORT_POLICY = "private-export-v1";
export const EXPORT_LIMITS = {
  files: 250,
  fileBytes: 25 * 1024 * 1024,
  totalBytes: 512 * 1024 * 1024,
  jsonBytes: 32 * 1024 * 1024,
};
export const exportFileSchema = z
  .object({
    id: z.string().uuid(),
    kind: z.enum(["media", "source", "preview"]),
    bucket: z.enum(["private-uploads", "scene-sources"]),
    objectKey: z.string().max(1000),
    mime: z.enum(["image/webp", "image/png", "application/pdf"]),
  })
  .strict();
export type ExportFile = z.infer<typeof exportFileSchema>;
export class ArchiveFailure extends Error {
  constructor(
    public code: "EXPORT_TOO_LARGE" | "SOURCE_UNAVAILABLE" | "BUILD_FAILED",
  ) {
    super(code);
  }
}
function extension(mime: string) {
  return mime === "application/pdf"
    ? "pdf"
    : mime === "image/png"
      ? "png"
      : "webp";
}
function byteLimiter(limit: number, onBytes?: (size: number) => void) {
  let bytes = 0;
  return new Transform({
    transform(chunk, encoding, done) {
      bytes += chunk.length;
      if (bytes > limit) {
        done(new ArchiveFailure("EXPORT_TOO_LARGE"));
        return;
      }
      try {
        onBytes?.(chunk.length);
        done(null, chunk);
      } catch (e) {
        done(e as Error);
      }
    },
  });
}
/** Everything is private temporary disk, sequential input and streamed ZIP output. A failure leaves no ready archive. */
export async function buildPrivacyArchive(
  snapshot: unknown,
  files: ExportFile[],
  openSource: (file: ExportFile) => Promise<Readable>,
  limits = EXPORT_LIMITS,
) {
  if (files.length > limits.files) throw new ArchiveFailure("EXPORT_TOO_LARGE");
  const descriptors = z.array(exportFileSchema).max(limits.files).parse(files),
    json = Buffer.from(JSON.stringify(snapshot, null, 2));
  if (json.length > limits.jsonBytes)
    throw new ArchiveFailure("EXPORT_TOO_LARGE");
  if (
    new Set(descriptors.map((v) => v.kind + ":" + v.id)).size !==
    descriptors.length
  )
    throw new ArchiveFailure("BUILD_FAILED");
  const directory = await mkdtemp(join(tmpdir(), "gp-private-export-"));
  await chmod(directory, 0o700);
  const archivePath = join(directory, "archive.zip");
  let total = json.length;
  const manifest: {
    id: string;
    kind: string;
    path: string;
    bytes: number;
    sha256: string;
  }[] = [];
  try {
    for (const file of descriptors) {
      const path = `files/${file.kind}/${file.id}.${extension(file.mime)}`,
        local = join(directory, `${file.kind}-${file.id}`),
        hash = createHash("sha256");
      const source = await openSource(file);
      const counter = byteLimiter(limits.fileBytes, (n) => {
        total += n;
        if (total > limits.totalBytes)
          throw new ArchiveFailure("EXPORT_TOO_LARGE");
      });
      counter.on("data", (chunk) => hash.update(chunk));
      await pipeline(
        source,
        counter,
        createWriteStream(local, { mode: 0o600, flags: "wx" }),
      );
      const metadata = await stat(local);
      manifest.push({
        id: file.id,
        kind: file.kind,
        path,
        bytes: metadata.size,
        sha256: hash.digest("hex"),
      });
    }
    const zip = new ZipFile();
    zip.on("error", (error) => (zip.outputStream as Readable).destroy(error));
    zip.addBuffer(json, "account.json");
    zip.addBuffer(
      Buffer.from(
        JSON.stringify(
          {
            formatVersion: "gp-private-archive-v1",
            complete: true,
            files: manifest,
            excluded:
              "Files uploaded by other contributors, credentials and internal moderation evidence are excluded.",
          },
          null,
          2,
        ),
      ),
      "manifest.json",
    );
    for (const file of manifest)
      zip.addFile(join(directory, `${file.kind}-${file.id}`), file.path);
    const writing = pipeline(
      zip.outputStream,
      byteLimiter(limits.totalBytes),
      createWriteStream(archivePath, { mode: 0o600, flags: "wx" }),
    );
    zip.end();
    await writing;
    const hash = createHash("sha256");
    for await (const chunk of createReadStream(archivePath)) hash.update(chunk);
    return {
      archivePath,
      byteSize: (await stat(archivePath)).size,
      sha256: hash.digest("hex"),
      fileCount: manifest.length,
      cleanup: () => rm(directory, { recursive: true, force: true }),
    };
  } catch (e) {
    await rm(directory, { recursive: true, force: true });
    if (e instanceof ArchiveFailure) throw e;
    throw new ArchiveFailure("SOURCE_UNAVAILABLE");
  }
}
