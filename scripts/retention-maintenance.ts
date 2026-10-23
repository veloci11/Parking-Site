/** Private operator CLI. Dry-run by default; never schedules itself or invents retention periods. */
import { createClient } from "@supabase/supabase-js";
import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { resolve } from "node:path";
import { z } from "zod";
import {
  executeRetentionJob,
  retentionKind,
  retentionPolicy,
} from "../src/server/retention-policy";
function option(name: string) {
  const index = process.argv.indexOf(name);
  return index < 0 ? undefined : process.argv[index + 1];
}
export async function main() {
  const execute = process.argv.includes("--execute");
  const file = option("--policy-file");
  const policy = file
    ? retentionPolicy.parse(JSON.parse(await readFile(file, "utf8")))
    : null;
  if (!execute && policy && process.argv.includes("--approve-policy")) {
    console.log(
      JSON.stringify({
        dryRun: true,
        policyValid: true,
        policyKey: policy.key,
        policyVersion: policy.version,
        remoteMutation: false,
      }),
    );
    return;
  }
  const endpoint = process.env.GP_RETENTION_SUPABASE_URL,
    key = process.env.GP_RETENTION_SERVICE_ROLE_KEY;
  if (!endpoint || !key)
    throw new Error("PRIVATE_OPERATOR_CONFIGURATION_REQUIRED");
  const client = createClient(z.string().url().parse(endpoint), key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const rpc = async (name: string, args: Record<string, unknown>) => {
    const r = await client.rpc(name, args);
    if (r.error) throw new Error(r.error.message);
    return r.data;
  };
  if (process.argv.includes("--approve-policy")) {
    if (!execute || !policy)
      throw new Error("EXPLICIT_VALIDATED_POLICY_REQUIRED");
    const data = await rpc("gp_retention_approve_policy", {
      p_key: policy.key,
      p_version: policy.version,
      p_rules: policy.rules,
      p_operator_reference: policy.operatorReference,
      p_reason: policy.reason,
    });
    console.log(JSON.stringify(data));
    return;
  }
  const job = option("--job");
  if (job) {
    const id = z.string().uuid().parse(job);
    if (!execute) {
      console.log(
        JSON.stringify({
          dryRun: true,
          data: await rpc("gp_retention_job", { p_job: id }),
        }),
      );
      return;
    }
    const version = z.coerce
      .number()
      .int()
      .positive()
      .parse(option("--expected-version"));
    const result = await executeRetentionJob(
      {
        rpc,
        removeObject: async (bucket, name) => {
          const r = await client.storage.from(bucket).remove([name]);
          if (r.error) throw new Error("STORAGE_FAILED");
        },
        authUserExists: async (id) => {
          const r = await client.auth.admin.getUserById(id);
          if (r.error) {
            if (r.error.status === 404 || r.error.code === "user_not_found")
              return false;
            throw new Error("AUTH_READ_FAILED");
          }
          return !!r.data.user;
        },
        deleteAuthUser: async (id) => {
          const r = await client.auth.admin.deleteUser(id);
          if (r.error) throw new Error("AUTH_DELETE_FAILED");
        },
      },
      id,
      version,
    );
    console.log(JSON.stringify({ jobId: id, ...result }));
    return;
  }
  const kind = retentionKind.parse(option("--kind"));
  const ids = z
    .array(z.string().uuid())
    .min(1)
    .max(100)
    .refine((v) => new Set(v).size === v.length)
    .parse((option("--ids") || "").split(",").filter(Boolean));
  const policyKey = z.string().min(3).parse(option("--policy"));
  const policyVersion = z.coerce
    .number()
    .int()
    .positive()
    .parse(option("--policy-version"));
  const plan = await rpc("gp_retention_plan", {
    p_kind: kind,
    p_ids: ids,
    p_policy_key: policyKey,
    p_policy_version: policyVersion,
  });
  if (!execute) {
    console.log(
      JSON.stringify(
        {
          dryRun: true,
          policyKey,
          policyVersion,
          items: plan.items.map((x: any) => ({
            id: x.id,
            eligible: x.eligible,
            blockers: x.blockers,
            graphHash: x.graphHash,
            objects: x.objects.length,
          })),
        },
        null,
        2,
      ),
    );
    return;
  }
  if (!process.argv.includes("--prepare") || ids.length !== 1)
    throw new Error("PREPARE_ONE_REVIEWED_TARGET_REQUIRED");
  const hash = z
    .string()
    .regex(/^[a-f0-9]{64}$/)
    .parse(option("--expected-hash"));
  const operator = z
    .string()
    .trim()
    .min(5)
    .max(200)
    .parse(option("--operator-reference"));
  const review = z
    .string()
    .trim()
    .min(15)
    .max(2000)
    .parse(option("--review-reference"));
  const backup = z
    .string()
    .trim()
    .min(15)
    .max(2000)
    .parse(option("--backup-reference"));
  console.log(
    JSON.stringify(
      await rpc("gp_retention_prepare", {
        p_kind: kind,
        p_id: ids[0],
        p_graph_hash: hash,
        p_policy_key: policyKey,
        p_policy_version: policyVersion,
        p_operator_reference: operator,
        p_review_reference: review,
        p_backup_reference: backup,
      }),
    ),
  );
}
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
)
  void main().catch(() => {
    console.error(
      "Retention refused or interrupted. Inspect private policy, reviewed IDs/versions and resumable job status; no complete erasure is claimed.",
    );
    process.exitCode = 1;
  });
