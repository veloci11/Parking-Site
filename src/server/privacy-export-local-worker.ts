import { localExportDB } from "./privacy-exports";
import {
  buildPrivacyArchive,
  EXPORT_POLICY,
  exportFileSchema,
  ArchiveFailure,
} from "./privacy-archive";
import { z } from "zod";
import { createReadStream } from "node:fs";
import { mkdir, copyFile, realpath, rm } from "node:fs/promises";
import { resolve, sep } from "node:path";
import { audit } from "./security";
const root = () =>
  resolve(process.env.GP_EXPORT_PATH || ".data/private-exports");
export async function processLocalExport(id: string, policy: string) {
  z.string().uuid().parse(id);
  if (process.env.GP_FORCE_LOCAL_DEMO !== "true" || policy !== EXPORT_POLICY)
    throw new Error("LOCAL_EXPORT_REFUSED");
  const sql = localExportDB(),
    row = sql
      .prepare("SELECT * FROM export_jobs WHERE id=? AND state='queued'")
      .get(id);
  if (!row) throw new Error("JOB_NOT_QUEUED");
  const active = sql
    .prepare("SELECT status FROM users WHERE id=?")
    .get(row.user_id);
  if (active?.status !== "active") throw new Error("ACCOUNT_INACTIVE");
  if (
    sql
      .prepare(
        "UPDATE export_jobs SET state='processing' WHERE id=? AND state='queued'",
      )
      .run(id).changes !== 1
  )
    throw new Error("JOB_CONFLICT");
  let archive: Awaited<ReturnType<typeof buildPrivacyArchive>> | undefined;
  try {
    const files = z
      .array(exportFileSchema)
      .max(250)
      .parse(JSON.parse(String(row.files_json)));
    archive = await buildPrivacyArchive(
      JSON.parse(String(row.snapshot_json)),
      files,
      async (file) => {
        const mediaRoot = await realpath(
          resolve(process.env.GP_MEDIA_PATH || ".data/media"),
        );
        const filePath = await realpath(file.objectKey);
        if (!filePath.startsWith(mediaRoot + sep))
          throw new ArchiveFailure("SOURCE_UNAVAILABLE");
        return createReadStream(filePath);
      },
    );
    const directory = resolve(root(), String(row.user_id));
    await mkdir(directory, { recursive: true, mode: 0o700 });
    const path = resolve(directory, `${id}.zip`);
    await copyFile(archive.archivePath, path);
    const now = new Date().toISOString(),
      expires = new Date(Date.now() + 7 * 86400000).toISOString();
    sql
      .prepare(
        "UPDATE export_jobs SET state='ready',snapshot_json='{}',files_json='[]',archive_path=?,byte_size=?,sha256=?,ready_at=?,expires_at=? WHERE id=? AND state='processing'",
      )
      .run(path, archive.byteSize, archive.sha256, now, expires, id);
    audit(String(row.user_id), "privacy.export_ready", id);
    return {
      id,
      state: "ready",
      files: archive.fileCount,
      bytes: archive.byteSize,
    };
  } catch (e) {
    sql
      .prepare(
        "UPDATE export_jobs SET state='failed',error_code=?,snapshot_json='{}',files_json='[]' WHERE id=? AND state='processing'",
      )
      .run(e instanceof ArchiveFailure ? e.code : "BUILD_FAILED", id);
    return { id, state: "failed" };
  } finally {
    await archive?.cleanup();
  }
}
export async function purgeLocalExport(id: string, policy: string) {
  z.string().uuid().parse(id);
  if (process.env.GP_FORCE_LOCAL_DEMO !== "true" || policy !== EXPORT_POLICY)
    throw new Error("LOCAL_EXPORT_REFUSED");
  const sql = localExportDB(),
    row = sql
      .prepare(
        "SELECT * FROM export_jobs WHERE id=? AND state='ready' AND expires_at<=?",
      )
      .get(id, new Date().toISOString());
  if (!row) throw new Error("EXPORT_NOT_EXPIRED");
  const expected = resolve(root(), String(row.user_id), `${id}.zip`);
  if (row.archive_path !== expected) throw new Error("INVALID_ARCHIVE_PATH");
  await rm(expected, { force: true });
  sql
    .prepare(
      "UPDATE export_jobs SET state='expired',archive_path=NULL WHERE id=?",
    )
    .run(id);
  audit(String(row.user_id), "privacy.export_expired", id);
  return { id, state: "expired" };
}
