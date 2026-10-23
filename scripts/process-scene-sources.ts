/** Operator only. Default dry-run; never imported by the web app. */
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import {
  processSceneSource,
  SOURCE_PROCESSOR_VERSION,
  assertSourceProcessorReady,
} from "../src/server/scenes/source-processing";
async function main() {
  const endpoint = process.env.GP_SOURCE_SUPABASE_URL,
    key = process.env.GP_SOURCE_SERVICE_ROLE_KEY;
  if (!endpoint || !key) throw new Error("CONFIGURATION");
  const client = createClient(endpoint, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await client
    .from("parking_scene_sources")
    .select("id,processing_state,processing_attempts")
    .eq("processing_state", "processing")
    .limit(50);
  if (error) throw new Error("PLAN");
  if (!process.argv.includes("--execute")) {
    console.log(
      JSON.stringify({
        mode: "dry_run",
        sources: data,
        processor: SOURCE_PROCESSOR_VERSION,
      }),
    );
    return;
  }
  if (!process.argv.includes("--isolated-host-confirmed"))
    throw new Error("OS_ISOLATION_REQUIRED");
  // Configuration/daemon outages must not consume leases or reject documents.
  await assertSourceProcessorReady();
  const option = process.argv.indexOf("--ids");
  const ids = z
    .array(z.string().uuid())
    .min(1)
    .max(10)
    .refine((v) => new Set(v).size === v.length)
    .parse((process.argv[option + 1] || "").split(","));
  if (option < 0) throw new Error("BOUNDED_IDS_REQUIRED");
  for (const id of ids) {
    const claim = await client.rpc("gp_source_claim", { p_id: id });
    if (claim.error) throw new Error("CLAIM");
    const source = claim.data;
    const uploaded: string[] = [];
    try {
      const file = await client.storage
        .from("scene-sources")
        .download(source.objectKey);
      if (file.error || !file.data) throw new Error("DOWNLOAD");
      const result = await processSceneSource(
        Buffer.from(await file.data.arrayBuffer()),
      );
      if (result.sha256 !== source.sha256) throw new Error("HASH");
      for (let index = 0; index < result.previews.length; index++) {
        const name =
          source.objectKey.replace(/\.(pdf|webp)$/, "") +
          `.preview-${index + 1}.png`;
        const upload = await client.storage
          .from("scene-sources")
          .upload(name, result.previews[index], {
            contentType: "image/png",
            upsert: true,
          });
        if (upload.error) throw new Error("UPLOAD");
        uploaded.push(name);
      }
      const finish = await client.rpc("gp_source_complete", {
        p_id: id,
        p_token: source.token,
        p_ready: true,
        p_previews: uploaded,
        p_pages: result.pageCount,
        p_version: SOURCE_PROCESSOR_VERSION,
      });
      if (finish.error) throw new Error("COMPLETE");
      console.log(
        JSON.stringify({ id, state: "ready", previews: uploaded.length }),
      );
    } catch {
      // Keys belong only to this lease; remove through Storage API, never SQL rows.
      if (uploaded.length)
        await client.storage.from("scene-sources").remove(uploaded);
      const finish = await client.rpc("gp_source_complete", {
        p_id: id,
        p_token: source.token,
        p_ready: false,
        p_previews: [],
        p_pages: null,
        p_version: SOURCE_PROCESSOR_VERSION,
      });
      if (finish.error) throw new Error("REJECTION_NOT_RECORDED");
      console.log(JSON.stringify({ id, state: "rejected" }));
    }
  }
}
void main().catch(() => {
  console.error(
    "Source worker refused or failed. Check private operator configuration, isolation and bounded IDs.",
  );
  process.exitCode = 1;
});
