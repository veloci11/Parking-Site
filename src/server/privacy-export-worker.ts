import type { SupabaseClient } from "@supabase/supabase-js";
import { Readable } from "node:stream";
import { openAsBlob } from "node:fs";
import { z } from "zod";
import {
  buildPrivacyArchive,
  EXPORT_POLICY,
  exportFileSchema,
  ArchiveFailure,
} from "./privacy-archive";
const uuid = z.string().uuid();
const objectKey = /^[a-f0-9-]{36}\/[a-f0-9-]{36}\/[a-f0-9-]{36}\.zip$/;
export async function processRemoteExport(
  client: SupabaseClient,
  origin: string,
  serviceKey: string,
  id: string,
) {
  uuid.parse(id);
  const claim = await client.rpc("gp_export_claim", {
    p_id: id,
    p_policy: EXPORT_POLICY,
  });
  if (claim.error) throw new Error("EXPORT_CLAIM_REFUSED");
  if (claim.data.state === "failed") return { state: "failed" };
  const job = claim.data;
  uuid.parse(job.userId);
  uuid.parse(job.leaseToken);
  if (!objectKey.test(job.objectKey)) throw new Error("INVALID_ARCHIVE_KEY");
  let archive: Awaited<ReturnType<typeof buildPrivacyArchive>> | undefined,
    uploaded = false;
  try {
    if (job.previousObjectKey) {
      if (
        !objectKey.test(job.previousObjectKey) ||
        !job.previousObjectKey.startsWith(job.userId + "/" + id + "/")
      )
        throw new Error("INVALID_ARCHIVE_KEY");
      const prior = await client.storage
        .from("private-exports")
        .remove([job.previousObjectKey]);
      if (prior.error) throw new Error("PRIOR_OBJECT_CLEANUP_FAILED");
    }
    if (job.accountActive === false) throw new ArchiveFailure("BUILD_FAILED");
    const files = z.array(exportFileSchema).max(250).parse(job.files);
    for (const file of files)
      if (
        !file.objectKey.startsWith(job.userId + "/") ||
        file.objectKey.split("/").some((p) => p === ".." || p === "." || !p)
      )
        throw new ArchiveFailure("BUILD_FAILED");
    archive = await buildPrivacyArchive(job.snapshot, files, async (file) => {
      if (file.bucket === "scene-sources") {
        const sources = await client
          .from("parking_scene_sources")
          .select("object_key,preview_keys,processing_state")
          .eq("owner_id", job.userId)
          .eq("uploader_id", job.userId);
        if (
          sources.error ||
          !sources.data?.some(
            (source) =>
              source.processing_state === "ready" &&
              (source.object_key === file.objectKey ||
                (source.preview_keys || []).includes(file.objectKey)),
          )
        )
          throw new ArchiveFailure("SOURCE_UNAVAILABLE");
      }
      const path = file.objectKey.split("/").map(encodeURIComponent).join("/");
      const r = await fetch(
        `${origin.replace(/\/$/, "")}/storage/v1/object/authenticated/${file.bucket}/${path}`,
        {
          headers: {
            apikey: serviceKey,
            Authorization: `Bearer ${serviceKey}`,
          },
          signal: AbortSignal.timeout(60000),
        },
      );
      if (!r.ok || !r.body) throw new ArchiveFailure("SOURCE_UNAVAILABLE");
      if (Number(r.headers.get("content-length") || 0) > 25 * 1024 * 1024) {
        await r.body.cancel();
        throw new ArchiveFailure("EXPORT_TOO_LARGE");
      }
      return Readable.fromWeb(r.body as never);
    });
    const file = await openAsBlob(archive.archivePath, {
        type: "application/zip",
      }),
      upload = await client.storage
        .from("private-exports")
        .upload(job.objectKey, file, {
          contentType: "application/zip",
          upsert: false,
        });
    if (upload.error) throw new Error("UPLOAD_FAILED");
    uploaded = true;
    const finished = await client.rpc("gp_export_finish", {
      p_id: id,
      p_lease: job.leaseToken,
      p_success: true,
      p_byte_size: archive.byteSize,
      p_sha256: archive.sha256,
    });
    if (finished.error) throw new Error("FINISH_FAILED");
    return {
      state: "ready",
      id,
      files: archive.fileCount,
      bytes: archive.byteSize,
    };
  } catch (e) {
    if (uploaded)
      await client.storage.from("private-exports").remove([job.objectKey]);
    const failed = await client.rpc("gp_export_finish", {
      p_id: id,
      p_lease: job.leaseToken,
      p_success: false,
      p_error_code:
        e instanceof ArchiveFailure
          ? e.code
          : e instanceof Error && e.message === "UPLOAD_FAILED"
            ? "UPLOAD_FAILED"
            : "BUILD_FAILED",
    });
    if (failed.error) throw new Error("EXPORT_FAILURE_RECORD_CONFLICT");
    return { state: "failed", id };
  } finally {
    await archive?.cleanup();
  }
}
export async function purgeRemoteExport(client: SupabaseClient, id: string) {
  uuid.parse(id);
  const claim = await client.rpc("gp_export_purge_claim", {
    p_id: id,
    p_policy: EXPORT_POLICY,
  });
  if (claim.error) throw new Error("PURGE_REFUSED");
  const job = claim.data;
  if (!objectKey.test(job.objectKey)) throw new Error("INVALID_ARCHIVE_KEY");
  const removed = await client.storage
    .from("private-exports")
    .remove([job.objectKey]);
  if (removed.error) throw new Error("PURGE_STORAGE_FAILED");
  const done = await client.rpc("gp_export_purge_finish", {
    p_id: id,
    p_token: job.purgeToken,
  });
  if (done.error) throw new Error("PURGE_FINISH_CONFLICT");
  return { id, state: "expired" };
}
