/** Private operator worker: dry-run by default, explicit bounded IDs and policy to build/purge. */
import { localExportDB } from "../src/server/privacy-exports";
import {
  processLocalExport,
  purgeLocalExport,
} from "../src/server/privacy-export-local-worker";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import { EXPORT_POLICY } from "../src/server/privacy-archive";
import {
  processRemoteExport,
  purgeRemoteExport,
} from "../src/server/privacy-export-worker";
function option(name: string) {
  const i = process.argv.indexOf(name);
  return i < 0 ? undefined : process.argv[i + 1];
}
async function main() {
  if (process.argv.includes("--local")) {
    if (
      process.env.GP_FORCE_LOCAL_DEMO !== "true" ||
      !process.env.GP_DATABASE_PATH
    )
      throw new Error("Explicit local demo database required");
    const sql = localExportDB();
    if (!process.argv.includes("--execute")) {
      console.log(
        JSON.stringify({
          mode: "dry_run",
          policy: EXPORT_POLICY,
          queuedIds: sql
            .prepare(
              "SELECT id FROM export_jobs WHERE state='queued' LIMIT 100",
            )
            .all(),
          expiredIds: sql
            .prepare(
              "SELECT id FROM export_jobs WHERE state='ready' AND expires_at<=? LIMIT 100",
            )
            .all(new Date().toISOString()),
        }),
      );
      return;
    }
    if (option("--policy") !== EXPORT_POLICY)
      throw new Error("Explicit policy required");
    const ids = z
      .array(z.string().uuid())
      .min(1)
      .max(20)
      .refine((v) => new Set(v).size === v.length)
      .parse((option("--ids") || "").split(",").filter(Boolean));
    const result = [];
    for (const id of ids)
      result.push(
        process.argv.includes("--purge")
          ? await purgeLocalExport(id, EXPORT_POLICY)
          : await processLocalExport(id, EXPORT_POLICY),
      );
    console.log(JSON.stringify({ mode: "executed", results: result }));
    return;
  }
  const origin = process.env.GP_MAINTENANCE_SUPABASE_URL,
    key = process.env.GP_MAINTENANCE_SERVICE_ROLE_KEY;
  if (!origin || !key) throw new Error("Private configuration required");
  const client = createClient(origin, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  if (!process.argv.includes("--execute")) {
    const plan = await client.rpc("gp_export_worker_plan");
    if (plan.error) throw new Error("Plan unavailable");
    console.log(JSON.stringify({ mode: "dry_run", ...plan.data }));
    return;
  }
  if (option("--policy") !== EXPORT_POLICY)
    throw new Error("Explicit policy required");
  const ids = z
    .array(z.string().uuid())
    .min(1)
    .max(20)
    .refine((v) => new Set(v).size === v.length)
    .parse((option("--ids") || "").split(",").filter(Boolean));
  const result = [];
  for (const id of ids)
    result.push(
      process.argv.includes("--purge")
        ? await purgeRemoteExport(client, id)
        : await processRemoteExport(client, origin, key, id),
    );
  console.log(
    JSON.stringify({
      mode: "executed",
      operation: process.argv.includes("--purge") ? "purge" : "build",
      results: result,
    }),
  );
}
void main().catch(() => {
  console.error(
    "Private export worker refused or failed. Inspect job states and bounded IDs; no partial archive is declared ready.",
  );
  process.exitCode = 1;
});
