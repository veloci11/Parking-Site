/** Operator-only limited cleanup. Dry-run default; never claims final account erasure. */
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
const policy = "privacy-limited-cleanup-v1";
function option(name: string) {
  const i = process.argv.indexOf(name);
  return i < 0 ? undefined : process.argv[i + 1];
}
async function main() {
  const endpoint = process.env.GP_MAINTENANCE_SUPABASE_URL,
    key = process.env.GP_MAINTENANCE_SERVICE_ROLE_KEY;
  if (!endpoint || !key)
    throw new Error("Private maintenance configuration required");
  const client = createClient(endpoint, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  if (!process.argv.includes("--execute")) {
    const r = await client.rpc("gp_privacy_cleanup_plan", { p_limit: 100 });
    if (r.error) throw new Error("Plan unavailable");
    console.log(JSON.stringify({ mode: "dry_run", ...r.data }));
    return;
  }
  if (option("--policy") !== policy)
    throw new Error("Explicit policy required");
  const ids = z
    .array(z.string().uuid())
    .min(1)
    .max(100)
    .refine((v) => new Set(v).size === v.length)
    .parse((option("--ids") || "").split(",").filter(Boolean));
  const r = await client.rpc("gp_privacy_cleanup", {
    p_ids: ids,
    p_policy: policy,
  });
  if (r.error) throw new Error("Cleanup refused");
  console.log(JSON.stringify({ mode: "executed", policy, ...r.data }));
}
void main().catch(() => {
  console.error(
    "Privacy maintenance failed or refused. Inspect the private configuration and explicit bounded IDs; no complete erasure is claimed.",
  );
  process.exitCode = 1;
});
