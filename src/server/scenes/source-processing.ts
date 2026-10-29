import { spawn, execFile } from "node:child_process";
import { resolve } from "node:path";
import { createHash, randomUUID } from "node:crypto";
export const SOURCE_PROCESSOR_VERSION = "gp-source-raster/1";
export const SOURCE_LIMIT = 25 * 1024 * 1024;
const PREVIEW_LIMIT = 4 * 1024 * 1024;
const HEADER_LIMIT = 1024;
const OUTPUT_LIMIT = 8 + HEADER_LIMIT + 3 * PREVIEW_LIMIT;
const PNG_SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
export interface ProcessedSource {
  pageCount: number;
  previews: Buffer[];
  sha256: string;
  processorVersion: string;
}

/** Tags are mutable. Only a preloaded image ID or registry digest may execute. */
export function sourceRasterImage() {
  const image = process.env.GP_SOURCE_RASTER_IMAGE || "";
  if (
    !/^(?:sha256:[a-f0-9]{64}|[a-z0-9][a-z0-9./:_-]*@sha256:[a-f0-9]{64})$/.test(
      image,
    )
  )
    throw new Error("SOURCE_ISOLATION_REQUIRED");
  return image;
}

/** Exported so the live Docker test inspects the exact production policy. */
export function sourceContainerArguments(image: string, name: string) {
  return [
    "run",
    "--rm",
    "--interactive",
    "--pull=never",
    `--name=${name}`,
    "--label=com.gppark.source-raster=1",
    "--network=none",
    "--ipc=none",
    "--read-only",
    "--tmpfs=/tmp:rw,noexec,nosuid,nodev,size=64m,mode=1777",
    "--memory=384m",
    "--memory-swap=384m",
    "--pids-limit=48",
    "--cpus=1",
    "--cap-drop=ALL",
    "--security-opt=no-new-privileges=true",
    "--user=65532:65532",
    "--ulimit=nofile=64:64",
    "--ulimit=core=0:0",
    "--log-driver=none",
    "--stop-timeout=1",
    "--env=TMPDIR=/tmp",
    "--env=LANG=C",
    "--env=NODE_ENV=production",
    "--env=RAYON_NUM_THREADS=2",
    "--env=UV_THREADPOOL_SIZE=2",
    "--workdir=/worker",
    "--entrypoint=/usr/local/bin/node",
    image,
    "--max-old-space-size=160",
    "--permission",
    "--allow-fs-read=/worker",
    "--allow-fs-write=/tmp",
    "--allow-addons",
    "/worker/scene-source.mjs",
  ];
}

function dockerEnvironment(): NodeJS.ProcessEnv {
  // Host CLI configuration only. No environment file, bind, socket or host
  // environment is forwarded to the renderer inside the container.
  const env: NodeJS.ProcessEnv = { LANG: "C", NODE_ENV: "production" };
  for (const key of [
    "PATH",
    "HOME",
    "DOCKER_HOST",
    "DOCKER_CONTEXT",
    "DOCKER_CONFIG",
    "DOCKER_TLS_VERIFY",
    "DOCKER_CERT_PATH",
  ])
    if (process.env[key]) env[key] = process.env[key];
  return env;
}

/** Fail before a lease/download if the renderer or required OS controls are absent. */
export async function assertSourceProcessorReady() {
  const image = sourceRasterImage();
  const env = dockerEnvironment();
  const run = (args: string[]) =>
    new Promise<string>((done, reject) => {
      execFile(
        "docker",
        args,
        {
          env,
          timeout: 5000,
          maxBuffer: 65536,
          encoding: "utf8",
        },
        (error, stdout) => {
          if (error) reject(new Error("SOURCE_ISOLATION_UNAVAILABLE"));
          else done(stdout);
        },
      );
    });
  let endpoint: string;
  if (env.DOCKER_HOST && !env.DOCKER_CONTEXT) endpoint = env.DOCKER_HOST;
  else {
    const contextArgs = [
      "context",
      "inspect",
      "--format",
      "{{json .Endpoints.docker.Host}}",
    ];
    if (env.DOCKER_CONTEXT) contextArgs.push("--", env.DOCKER_CONTEXT);
    try {
      endpoint = JSON.parse(await run(contextArgs));
    } catch {
      throw new Error("SOURCE_ISOLATION_UNAVAILABLE");
    }
  }
  if (
    typeof endpoint !== "string" ||
    !/^unix:\/\/\/[^\r\n\0?#]+$/.test(endpoint)
  )
    throw new Error("SOURCE_LOCAL_DOCKER_REQUIRED");
  // Freeze the resolved local socket. A changing current context must never
  // redirect private input bytes to an unknown remote daemon after preflight.
  delete env.DOCKER_CONTEXT;
  env.DOCKER_HOST = endpoint;
  let info;
  try {
    info = JSON.parse(await run(["info", "--format", "{{json .}}"]));
  } catch {
    throw new Error("SOURCE_ISOLATION_UNAVAILABLE");
  }
  if (
    info.OSType !== "linux" ||
    info.MemoryLimit !== true ||
    info.SwapLimit !== true ||
    info.PidsLimit !== true ||
    !Array.isArray(info.SecurityOptions) ||
    !info.SecurityOptions.some((option: string) =>
      option.startsWith("name=seccomp"),
    )
  )
    throw new Error("SOURCE_ISOLATION_UNAVAILABLE");
  const id = (
    await run(["image", "inspect", image, "--format", "{{.Id}}"])
  ).trim();
  if (
    !/^sha256:[a-f0-9]{64}$/.test(id) ||
    (image.startsWith("sha256:") && image !== id)
  )
    throw new Error("SOURCE_ISOLATION_UNAVAILABLE");
  return env;
}

function decodeResult(
  output: Buffer,
): Pick<ProcessedSource, "pageCount" | "previews"> {
  if (output.length < 8 || output.subarray(0, 4).toString() !== "GPR1")
    throw new Error("SOURCE_RESULT");
  const headerSize = output.readUInt32BE(4);
  if (
    headerSize < 1 ||
    headerSize > HEADER_LIMIT ||
    output.length < 8 + headerSize
  )
    throw new Error("SOURCE_RESULT");
  let result;
  try {
    result = JSON.parse(output.subarray(8, 8 + headerSize).toString("utf8"));
  } catch {
    throw new Error("SOURCE_RESULT");
  }
  if (
    !result ||
    !Number.isInteger(result.pageCount) ||
    result.pageCount < 1 ||
    result.pageCount > 30 ||
    !Array.isArray(result.previews) ||
    result.previews.length !== Math.min(result.pageCount, 3)
  )
    throw new Error("SOURCE_RESULT");
  const previews: Buffer[] = [];
  let offset = 8 + headerSize;
  for (const size of result.previews) {
    if (
      !Number.isInteger(size) ||
      size < 33 ||
      size > PREVIEW_LIMIT ||
      offset + size > output.length
    )
      throw new Error("SOURCE_RESULT");
    const png = output.subarray(offset, offset + size);
    // Inspect the fixed PNG header only; no hostile native image decoder runs
    // in the parent. The PNG remains an untrusted, private raster asset.
    if (
      !png.subarray(0, 8).equals(PNG_SIGNATURE) ||
      png.readUInt32BE(8) !== 13 ||
      png.subarray(12, 16).toString() !== "IHDR" ||
      png.readUInt32BE(16) < 1 ||
      png.readUInt32BE(20) < 1 ||
      png.readUInt32BE(16) > 1800 ||
      png.readUInt32BE(20) > 1800
    )
      throw new Error("SOURCE_RESULT");
    previews.push(png);
    offset += size;
  }
  if (offset !== output.length) throw new Error("SOURCE_RESULT");
  return { pageCount: result.pageCount, previews };
}

/** Input bytes enter stdin; only a bounded, framed JSON/PNG result can return. */
export async function processSceneSource(
  bytes: Buffer,
  options: { timeoutMs?: number } = {},
): Promise<ProcessedSource> {
  if (bytes.length < 20 || bytes.length > SOURCE_LIMIT)
    throw new Error("SOURCE_SIZE");
  const inertTest = process.env.GP_SOURCE_INERT_TEST_WORKER === "1";
  if (
    inertTest &&
    (!process.env.NODE_TEST_CONTEXT || process.env.NODE_ENV === "production")
  )
    throw new Error("SOURCE_TEST_MODE_FORBIDDEN");
  const image = inertTest ? undefined : sourceRasterImage();
  const dockerEnv = inertTest ? undefined : await assertSourceProcessorReady();
  const name = `gp-source-${randomUUID()}`;
  const entry = resolve("scripts/workers/scene-source.mjs");
  const command = inertTest ? process.execPath : "docker";
  const args = inertTest
    ? [
        "--max-old-space-size=160",
        "--permission",
        `--allow-fs-read=${entry}`,
        `--allow-fs-read=${resolve("node_modules")}`,
        `--allow-fs-read=${resolve("package.json")}`,
        "--allow-addons",
        entry,
      ]
    : sourceContainerArguments(image!, name);
  const env: NodeJS.ProcessEnv = inertTest
    ? { LANG: "C", NODE_ENV: "test" }
    : dockerEnv!;
  try {
    const output = await new Promise<Buffer>((done, reject) => {
      const child = spawn(command, args, {
        env,
        stdio: ["pipe", "pipe", "ignore"],
      });
      let settled = false,
        size = 0;
      const chunks: Buffer[] = [];
      const finish = (error?: Error) => {
        if (settled) return;
        settled = true;
        clearTimeout(timeout);
        clearInterval(rss);
        if (error) {
          child.kill("SIGKILL");
          reject(error);
        } else done(Buffer.concat(chunks, size));
      };
      const timeout = setTimeout(
        () => finish(new Error("SOURCE_TIMEOUT")),
        Math.max(1, Math.min(options.timeoutMs ?? 20000, 20000)),
      );
      // Production limits cover the entire container via the OS cgroup.
      // The explicit inert test mode retains the host RSS guard as well.
      const rss = setInterval(() => {
        if (!inertTest || !child.pid) return;
        execFile(
          "/bin/ps",
          ["-o", "rss=", "-p", String(child.pid)],
          { timeout: 1000 },
          (error, stdout) => {
            if (!error && Number(stdout.trim()) > 384 * 1024)
              finish(new Error("SOURCE_MEMORY"));
          },
        );
      }, 250);
      child.stdout.on("data", (chunk: Buffer) => {
        size += chunk.length;
        if (size > OUTPUT_LIMIT) finish(new Error("SOURCE_RESULT"));
        else chunks.push(chunk);
      });
      child.stdout.once("error", () => finish(new Error("SOURCE_WORKER")));
      child.stdin.on("error", () => {
        /* Exit/timeout determines the generic error. */
      });
      child.once("error", () => finish(new Error("SOURCE_WORKER")));
      // close follows drained stdout, unlike exit.
      child.once("close", (code) =>
        finish(code === 0 ? undefined : new Error("SOURCE_REJECTED")),
      );
      child.stdin.end(bytes);
    });
    return {
      ...decodeResult(output),
      sha256: createHash("sha256").update(bytes).digest("hex"),
      processorVersion: SOURCE_PROCESSOR_VERSION,
    };
  } finally {
    if (!inertTest) {
      // Killing only the CLI does not kill its container. Remove the exact
      // random name on success and on every failure, without shell expansion.
      await new Promise<void>((done) => {
        execFile(
          "docker",
          ["rm", "--force", name],
          { env, timeout: 5000, maxBuffer: 1024 },
          () => done(),
        );
      });
    }
  }
}
