/** Explicit operator maintenance. Reads a plan by default; retention never purges data. */
import { createClient } from "@supabase/supabase-js";
import { readdir, lstat } from "node:fs/promises";
import { resolve } from "node:path";
import { createHash } from "node:crypto";
import { z } from "zod";
import { MAINTENANCE_POLICY } from "../src/server/lifecycle";
function option(name: string) {
  const index = process.argv.indexOf(name);
  return index < 0 ? undefined : process.argv[index + 1];
}
async function main() {
  const endpoint = process.env.GP_MAINTENANCE_SUPABASE_URL,
    key = process.env.GP_MAINTENANCE_SERVICE_ROLE_KEY;
  if (!endpoint || !key)
    throw new Error("Private maintenance credentials required");
  const client = createClient(endpoint, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: plan, error } = await client.rpc("gp_maintenance_plan", {
    p_limit: 100,
  });
  if (error) throw new Error("Plan unavailable");
  const exportCandidates = [];
  if (process.env.GP_EXPORT_PATH) {
    const directory = resolve(process.env.GP_EXPORT_PATH);
    for (const item of await readdir(directory, { withFileTypes: true })) {
      if (!item.isFile() || item.isSymbolicLink()) continue;
      const stat = await lstat(resolve(directory, item.name));
      if (stat.mtimeMs < Date.now() - 7 * 86400000)
        exportCandidates.push({
          nameHash: createHash("sha256").update(item.name).digest("hex"),
          bytes: stat.size,
        });
    }
  }
  if (!process.argv.includes("--execute")) {
    console.log(
      JSON.stringify(
        {
          mode: "dry_run",
          ...plan,
          exportCandidates7d: exportCandidates,
          retentionPurged: false,
        },
        null,
        2,
      ),
    );
    return;
  }
  if (option("--policy") !== MAINTENANCE_POLICY)
    throw new Error("Explicit policy version required");
  const ids = z
    .array(z.string().uuid())
    .min(1)
    .max(100)
    .refine((ids) => new Set(ids).size === ids.length)
    .parse((option("--ids") || "").split(",").filter(Boolean));
  const { data: result, error: jobError } = await client.rpc(
    "gp_run_availability",
    { p_ids: ids, p_policy: MAINTENANCE_POLICY },
  );
  if (jobError) throw new Error("Availability run refused");
  const deleted = [];
  // SQL locks these expired listings against re-publication until Storage cleanup
  // completes, so this API removal cannot race with a new approved publication.
  for (const name of result.publicObjects as string[]) {
    if (!/^[a-f0-9-]{36}\.webp$/.test(name))
      throw new Error("Invalid cleanup object");
    const { data, error: removeError } = await client.storage
      .from("public-approved")
      .remove([name]);
    if (removeError)
      throw new Error(
        "Storage cleanup incomplete; expired listing remains hidden and publication locked",
      );
    deleted.push(...(data || []).map((item) => item.name));
  }
  for (const id of result.expiredIds as string[]) {
    const { error: finishError } = await client.rpc(
      "gp_finish_availability_cleanup",
      { p_id: id, p_version: result.versions[id] },
    );
    if (finishError)
      throw new Error(
        "Cleanup finish conflict; rerun the same bounded IDs after inspection",
      );
  }
  console.log(
    JSON.stringify({
      mode: "executed",
      policyVersion: MAINTENANCE_POLICY,
      expiredIds: result.expiredIds,
      reminderCandidates: result.reminderCandidates,
      publicObjectsRemoved: deleted.length,
      retentionPurged: false,
    }),
  );
}
void main().catch(() => {
  console.error(
    "Maintenance failed or refused. Check private configuration, explicit IDs/policy, and migration readiness. No retention purge was performed.",
  );
  process.exitCode = 1;
});
