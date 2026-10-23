/** Opt-in021 recipe for dedicated confirmed QA identities only. No signup/email/deploy.
 * Default smoke covers queued jobs/history/reauth only. --worker additionally requires private operator env and acknowledgement.
 * Does not expire/purge a fresh archive artificially; SQL rollback covers the7day boundary.
 */
import assert from "node:assert/strict";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { createClient } from "@supabase/supabase-js";
import { processRemoteExport } from "../src/server/privacy-export-worker";
if (!process.argv.includes("--run")) {
  console.info(
    "Prepared only. Run after migration freeze and coordinator fixture/worker approval.",
  );
  process.exit(0);
}
const checks: { name: string; passed: boolean }[] = [];
let failure: string | null = null;
let workerExecuted = false;
function check(name: string, value: unknown) {
  checks.push({ name, passed: !!value });
  assert.ok(value, name);
}
async function main() {
  const config = JSON.parse(await readFile(".data/supabase-qa.json", "utf8")),
    user = config.users.seller,
    other = config.users.outsider;
  assert.match(config.origin, /^http:\/\/(127\.0\.0\.1|localhost):\d+$/);
  if (process.argv.includes("--worker")) {
    assert.equal(
      process.env.GP_QA_EXPORT_WORKER_CONFIRMED,
      "true",
      "Dedicated-fixture worker acknowledgement required",
    );
    assert.ok(
      process.env.GP_MAINTENANCE_SERVICE_ROLE_KEY,
      "Private worker configuration required",
    );
    assert.equal(process.env.GP_MAINTENANCE_SUPABASE_URL, config.supabaseUrl);
  }
  assert.ok(
    user.email.endsWith(".invalid") && other.email.endsWith(".invalid"),
    "Refusing identities outside the dedicated fixture domain",
  );
  class Client {
    cookies = new Map<string, string>();
    async request(path: string, method = "GET", body?: unknown) {
      const r = await fetch(config.origin + "/api/" + path, {
        method,
        headers: {
          Origin: config.origin,
          Cookie: [...this.cookies].map(([k, v]) => `${k}=${v}`).join("; "),
          ...(body ? { "Content-Type": "application/json" } : {}),
        },
        ...(body ? { body: JSON.stringify(body) } : {}),
        redirect: "manual",
        signal: AbortSignal.timeout(120000),
      });
      for (const cookie of r.headers.getSetCookie()) {
        const pair = cookie.split(";")[0],
          i = pair.indexOf("=");
        if (pair.slice(i + 1))
          this.cookies.set(pair.slice(0, i), pair.slice(i + 1));
        else this.cookies.delete(pair.slice(0, i));
      }
      if (r.headers.get("content-type") === "application/zip")
        return {
          status: r.status,
          data: null,
          archive: Buffer.from(await r.arrayBuffer()),
        };
      const raw = await r.json().catch(() => ({}));
      return { status: r.status, data: raw.data, archive: null };
    }
  }
  const owner = new Client(),
    outsider = new Client();
  check(
    "owner_login",
    (
      await owner.request("auth/login", "POST", {
        email: user.email,
        password: user.password,
      })
    ).status === 200,
  );
  check(
    "outsider_login",
    (
      await outsider.request("auth/login", "POST", {
        email: other.email,
        password: other.password,
      })
    ).status === 200,
  );
  check(
    "connected_mode",
    (await owner.request("session")).data?.id === user.id,
  );
  check(
    "legacy_export_cannot_skip_reauth",
    (await owner.request("me/export")).status === 405,
  );
  check(
    "wrong_password_refused",
    (
      await owner.request("privacy/exports", "POST", {
        password: "incorrect-fixture-only",
      })
    ).status === 403,
  );
  const queued = await owner.request("privacy/exports", "POST", {
    password: user.password,
  });
  check(
    "durable_request_queued",
    queued.status === 201 && queued.data.state === "queued",
  );
  const job = queued.data;
  await mkdir(".data", { recursive: true });
  await writeFile(
    ".data/supabase-export-qa-result.json",
    JSON.stringify(
      {
        userId: user.id,
        jobId: job.id,
        storagePrefix: `${user.id}/${job.id}/`,
        cleanup: "coordinator_required",
        externalEmailSent: false,
      },
      null,
      2,
    ) + "\n",
    { mode: 0o600 },
  );
  check(
    "history_contains_own_job",
    (await owner.request("privacy/exports")).data.some(
      (j: any) => j.id === job.id,
    ),
  );
  check(
    "not_downloadable_before_build",
    (
      await owner.request(`privacy/exports/${job.id}/download`, "POST", {
        password: user.password,
      })
    ).status === 409,
  );
  check(
    "outsider_history_excludes_job",
    !(await outsider.request("privacy/exports")).data.some(
      (j: any) => j.id === job.id,
    ),
  );
  check(
    "outsider_queued_download_denied",
    (
      await outsider.request(`privacy/exports/${job.id}/download`, "POST", {
        password: other.password,
      })
    ).status === 404,
  );
  const duplicate = await owner.request("privacy/exports", "POST", {
    password: user.password,
  });
  check("duplicate_pending_export_refused", duplicate.status === 409);
  if (!process.argv.includes("--worker")) return;
  const client = createClient(
      config.supabaseUrl,
      process.env.GP_MAINTENANCE_SERVICE_ROLE_KEY!,
      { auth: { persistSession: false, autoRefreshToken: false } },
    ),
    built = await (async () => {
      workerExecuted = true;
      return processRemoteExport(
        client,
        config.supabaseUrl,
        process.env.GP_MAINTENANCE_SERVICE_ROLE_KEY!,
        job.id,
      );
    })();
  check("operator_archive_ready", built.state === "ready");
  const history = await owner.request("privacy/exports"),
    ready = history.data.find((j: any) => j.id === job.id);
  check(
    "archive_valid_for_seven_days",
    ready.state === "ready" &&
      Date.parse(ready.expiresAt) - Date.parse(ready.readyAt) === 7 * 86400000,
  );
  check(
    "outsider_download_denied",
    (
      await outsider.request(`privacy/exports/${job.id}/download`, "POST", {
        password: other.password,
      })
    ).status === 404,
  );
  const downloaded = await owner.request(
    `privacy/exports/${job.id}/download`,
    "POST",
    { password: user.password },
  );
  check(
    "private_proxy_zip",
    downloaded.status === 200 &&
      downloaded.archive?.subarray(0, 2).toString() === "PK",
  );
  check(
    "reported_byte_size_matches",
    downloaded.archive?.byteLength === ready.byteSize,
  );
  const publicObject = await client.storage
    .from("private-exports")
    .list(`${user.id}/${job.id}`, { limit: 10 });
  check(
    "one_bounded_archive_object",
    !publicObject.error && publicObject.data.length === 1,
  );
  const name = publicObject.data![0].name;
  const publicResponse = await fetch(
    `${config.supabaseUrl}/storage/v1/object/public/private-exports/${user.id}/${job.id}/${name}`,
  );
  check("no_public_archive_route", publicResponse.status !== 200);
}
async function runRecipe() {
  try {
    await main();
  } catch (e) {
    failure =
      e instanceof assert.AssertionError
        ? "assertion_failed"
        : e instanceof Error && /^[a-zA-Z0-9_ -]{1,100}$/.test(e.message)
          ? e.message
          : "private_export_recipe_failed";
    process.exitCode = 1;
  } finally {
    await mkdir("docs/qa", { recursive: true });
    await writeFile(
      "docs/qa/privacy-export-integration.json",
      JSON.stringify(
        {
          scope: process.argv.includes("--worker")
            ? "connected-worker-archive"
            : "connected-queued-history-reauth-smoke",
          workerExecuted,
          archiveStorageExercised: workerExecuted && !failure,
          limitations: process.argv.includes("--worker")
            ? ["Fresh archive expiry not forced"]
            : [
                "Archive build, download bytes, expiry and purge require the separately configured operator worker; not exercised by this smoke",
              ],
          status: failure ? "failed" : "passed",
          checks,
          failure,
          externalEmailSent: false,
          realUserDeleted: false,
          productionDeployed: false,
          freshArchiveExpiryNotForced: true,
        },
        null,
        2,
      ) + "\n",
    );
    console.info(
      JSON.stringify({
        status: failure ? "failed" : "passed",
        passed: checks.filter((c) => c.passed).length,
        total: checks.length,
        report: "docs/qa/privacy-export-integration.json",
      }),
    );
  }
}
void runRecipe().catch(() => {
  console.error("Private export QA report could not be written.");
  process.exitCode = 1;
});
