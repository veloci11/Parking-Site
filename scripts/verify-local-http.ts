/** Disposable loopback-only acceptance database. Never connects to Supabase or sends email. */
import { spawn, type ChildProcess } from "node:child_process";
import { randomBytes, randomUUID } from "node:crypto";
import {
  mkdtempSync,
  openSync,
  closeSync,
  rmSync,
  writeFileSync,
  readFileSync,
  existsSync,
} from "node:fs";
import { resolve, join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { mkdirSync } from "node:fs";

const port = Number(process.env.GP_HTTP_QA_PORT || "3002");
if (!Number.isInteger(port) || port < 1024 || port > 65535)
  throw new Error("Invalid local QA port");
const origin = `http://127.0.0.1:${port}`;
mkdirSync(resolve(".data"), { recursive: true });
const folder = mkdtempSync(resolve(".data/http-acceptance-"));
const database = join(folder, "qa.sqlite");
const resultPath = resolve("docs/qa/http-acceptance-latest.json");
const password = randomBytes(32).toString("base64url") + "Aa1";
const email = `qa-admin-${randomUUID()}@test.invalid`;
const log = openSync(join(folder, "server.log"), "w");
let server: ChildProcess | undefined;
let acceptanceResult: Record<string, unknown> | undefined;
const environment = {
  ...process.env,
  GP_FORCE_LOCAL_DEMO: "true",
  GP_LOCAL_DEMO: "true",
  GP_DATABASE_PATH: database,
  GP_MEDIA_PATH: join(folder, "media"),
  GP_EXPORT_PATH: join(folder, "exports"),
  NEXT_PUBLIC_SITE_URL: origin,
};
function exit(child: ChildProcess): Promise<number> {
  return new Promise((yes, no) => {
    child.on("error", no);
    child.on("exit", (code) => yes(code ?? 1));
  });
}
async function ready() {
  for (let attempt = 0; attempt < 80; attempt++) {
    if (server?.exitCode !== null) throw new Error("QA server exited");
    try {
      const response = await fetch(`${origin}/api/ready`, {
        signal: AbortSignal.timeout(500),
      });
      if (response.ok) return;
    } catch {}
    await delay(250);
  }
  throw new Error("QA server did not become ready");
}
async function runAcceptance() {
  try {
    // Respect an existing listener. This runner owns only a new isolated instance.
    try {
      await fetch(`${origin}/api/ready`, { signal: AbortSignal.timeout(500) });
      throw new Error("The QA port is already in use");
    } catch (error) {
      if (
        error instanceof Error &&
        error.message === "The QA port is already in use"
      )
        throw error;
    }
    process.env.GP_DATABASE_PATH = database;
    const { db, resetDbForTests } = await import("../src/server/db");
    const { passwordHash } = await import("../src/server/security");
    db()
      .prepare(
        "INSERT INTO users(id,name,email,password,role,verified,status,created_at) VALUES(?,?,?,?, 'admin',1,'active',?)",
      )
      .run(
        randomUUID(),
        "Administrateur de recette fictif",
        email,
        passwordHash(password),
        new Date().toISOString(),
      );
    resetDbForTests();
    server = spawn(
      process.execPath,
      [
        "node_modules/next/dist/bin/next",
        "start",
        "--hostname",
        "127.0.0.1",
        "--port",
        String(port),
      ],
      { cwd: process.cwd(), env: environment, stdio: ["ignore", log, log] },
    );
    await ready();
    const report = join(folder, "tests.log"),
      output = openSync(report, "w");
    const tests = spawn(
      process.execPath,
      ["node_modules/tsx/dist/cli.mjs", "--test", "tests/account-flow.test.ts"],
      {
        cwd: process.cwd(),
        env: {
          ...environment,
          GP_ACCOUNT_TEST_URL: origin,
          GP_ACCOUNT_ADMIN_EMAIL: email,
          GP_ACCOUNT_ADMIN_PASSWORD: password,
        },
        stdio: ["ignore", output, output],
      },
    );
    const code = await exit(tests);
    closeSync(output);
    const text = readFileSync(report, "utf8");
    const passed = Number(
      /# pass (\d+)/.exec(text)?.[1] || /ℹ pass (\d+)/.exec(text)?.[1] || 0,
    );
    const skipped = Number(
      /# skipped (\d+)/.exec(text)?.[1] ||
        /ℹ skipped (\d+)/.exec(text)?.[1] ||
        0,
    );
    const valid = code === 0 && passed >= 2 && skipped === 0;
    const result = {
      checkedAt: new Date().toISOString(),
      scope: "isolated-local-production-build",
      origin,
      passed,
      skipped,
      exitCode: valid ? 0 : 1,
      externalEmailSent: false,
      supabaseTouched: false,
      disposableDatabaseRemoved: false,
    };
    acceptanceResult = result;
    if (!valid) {
      console.error(`Acceptance details preserved at ${report}`);
      process.exitCode = 1;
    }
  } catch (error) {
    console.error(
      error instanceof Error ? error.message : "Local acceptance failed",
    );
    process.exitCode = 1;
  } finally {
    if (server && server.exitCode === null) {
      server.kill("SIGTERM");
      await Promise.race([exit(server), delay(5000)]);
      if (server.exitCode === null) server.kill("SIGKILL");
    }
    closeSync(log);
    if (!process.exitCode) rmSync(folder, { recursive: true, force: true });
    if (acceptanceResult) {
      acceptanceResult.disposableDatabaseRemoved = !existsSync(folder);
      writeFileSync(
        resultPath,
        JSON.stringify(acceptanceResult, null, 2) + "\n",
      );
      console.info(JSON.stringify(acceptanceResult));
    }
  }
}
void runAcceptance().catch(() => {
  console.error("Local acceptance runner failed before completion.");
  process.exitCode = 1;
});
