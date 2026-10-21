import test from "node:test";
import assert from "node:assert/strict";
import sharp from "sharp";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { randomUUID } from "node:crypto";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  processSceneSource,
  SOURCE_LIMIT,
  sourceContainerArguments,
  assertSourceProcessorReady,
} from "../src/server/scenes/source-processing";
const execute = promisify(execFile);
const environment: Record<string, string | undefined> = process.env;
process.env.GP_SOURCE_INERT_TEST_WORKER = "1";
function inertPDF(active = false) {
  const objects = [
    active
      ? "<< /Type /Catalog /Pages 2 0 R /OpenAction << /S /JavaScript /JS (app.alert) >> >>"
      : "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 200 120] /Resources << >> /Contents 4 0 R >>",
    "<< /Length 23 >>\nstream\n0.7 g 10 10 80 60 re f\nendstream",
  ];
  let text = "%PDF-1.4\n";
  const offsets = [0];
  objects.forEach((o, i) => {
    offsets.push(Buffer.byteLength(text));
    text += `${i + 1} 0 obj\n${o}\nendobj\n`;
  });
  const xref = Buffer.byteLength(text);
  text += `xref\n0 5\n0000000000 65535 f \n${offsets
    .slice(1)
    .map((o) => String(o).padStart(10, "0") + " 00000 n ")
    .join(
      "\n",
    )}\ntrailer\n<< /Size 5 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(text);
}
test("explicit inert test worker renders a PDF as private PNG and records input hash", async () => {
  const result = await processSceneSource(inertPDF());
  assert.equal(result.pageCount, 1);
  assert.equal(result.previews.length, 1);
  assert.match(result.sha256, /^[a-f0-9]{64}$/);
  assert.equal((await sharp(result.previews[0]).metadata()).format, "png");
});
test("explicit inert test worker decodes an image and refuses corrupt, oversized and timed-out input", async () => {
  const image = await sharp({
    create: { width: 40, height: 30, channels: 3, background: "#cccccc" },
  })
    .png()
    .toBuffer();
  const result = await processSceneSource(image);
  assert.equal(result.pageCount, 1);
  assert.equal((await sharp(result.previews[0]).metadata()).width, 40);
  await assert.rejects(processSceneSource(Buffer.alloc(40)), /SOURCE_REJECTED/);
  await assert.rejects(processSceneSource(inertPDF(true)), /SOURCE_REJECTED/);
  await assert.rejects(
    processSceneSource(Buffer.alloc(SOURCE_LIMIT + 1)),
    /SOURCE_SIZE/,
  );
  await assert.rejects(
    processSceneSource(inertPDF(), { timeoutMs: 1 }),
    /SOURCE_TIMEOUT/,
  );
});
test("source raster fails closed without an immutable image and forbids the test bypass in production", async () => {
  const previousImage = process.env.GP_SOURCE_RASTER_IMAGE;
  const previousNodeEnv = process.env.NODE_ENV;
  try {
    delete process.env.GP_SOURCE_INERT_TEST_WORKER;
    delete process.env.GP_SOURCE_RASTER_IMAGE;
    await assert.rejects(
      processSceneSource(inertPDF()),
      /SOURCE_ISOLATION_REQUIRED/,
    );
    process.env.GP_SOURCE_RASTER_IMAGE = "gp-source-raster:latest";
    await assert.rejects(
      processSceneSource(inertPDF()),
      /SOURCE_ISOLATION_REQUIRED/,
    );
    process.env.GP_SOURCE_INERT_TEST_WORKER = "1";
    environment.NODE_ENV = "production";
    await assert.rejects(
      processSceneSource(inertPDF()),
      /SOURCE_TEST_MODE_FORBIDDEN/,
    );
  } finally {
    process.env.GP_SOURCE_INERT_TEST_WORKER = "1";
    if (previousImage === undefined) delete process.env.GP_SOURCE_RASTER_IMAGE;
    else process.env.GP_SOURCE_RASTER_IMAGE = previousImage;
    if (previousNodeEnv === undefined) delete environment.NODE_ENV;
    else environment.NODE_ENV = previousNodeEnv;
  }
});

test("private input cannot be sent to a remote Docker endpoint", async () => {
  const saved = {
    image: process.env.GP_SOURCE_RASTER_IMAGE,
    host: process.env.DOCKER_HOST,
    context: process.env.DOCKER_CONTEXT,
  };
  delete process.env.GP_SOURCE_INERT_TEST_WORKER;
  process.env.GP_SOURCE_RASTER_IMAGE = `sha256:${"a".repeat(64)}`;
  delete process.env.DOCKER_CONTEXT;
  try {
    for (const endpoint of [
      "tcp://renderer.invalid:2376",
      "ssh://renderer.invalid",
      "unix://relative.sock",
    ]) {
      process.env.DOCKER_HOST = endpoint;
      await assert.rejects(
        processSceneSource(inertPDF()),
        /SOURCE_LOCAL_DOCKER_REQUIRED/,
      );
    }
  } finally {
    for (const [key, value] of [
      ["GP_SOURCE_RASTER_IMAGE", saved.image],
      ["DOCKER_HOST", saved.host],
      ["DOCKER_CONTEXT", saved.context],
    ]) {
      if (value === undefined) delete process.env[key!];
      else process.env[key!] = value;
    }
    process.env.GP_SOURCE_INERT_TEST_WORKER = "1";
  }
});

test("parent rejects malformed, oversized and trailing output from an untrusted renderer", async () => {
  const directory = await mkdtemp(join(tmpdir(), "gp-raster-protocol-test-"));
  const image = `sha256:${"a".repeat(64)}`;
  const previousImage = process.env.GP_SOURCE_RASTER_IMAGE;
  const previousPath = process.env.PATH;
  const png = await sharp({
    create: { width: 8, height: 8, channels: 3, background: "#cccccc" },
  })
    .png()
    .toBuffer();
  const header = Buffer.from(
    JSON.stringify({ pageCount: 1, previews: [png.length] }),
  );
  const prefix = Buffer.alloc(8);
  prefix.write("GPR1");
  prefix.writeUInt32BE(header.length, 4);
  const tooLongHeader = Buffer.from(prefix);
  tooLongHeader.writeUInt32BE(1025, 4);
  const outputs = [
    "Buffer.from('parser diagnostic')",
    `Buffer.from('${tooLongHeader.toString("base64")}', 'base64')`,
    `Buffer.from('${Buffer.concat([prefix, header, png, Buffer.from("trailing")]).toString("base64")}', 'base64')`,
    "Buffer.alloc(13 * 1024 * 1024)",
  ];
  try {
    process.env.PATH = `${directory}:${previousPath}`;
    process.env.GP_SOURCE_RASTER_IMAGE = image;
    delete process.env.GP_SOURCE_INERT_TEST_WORKER;
    for (const output of outputs) {
      await writeFile(
        join(directory, "docker"),
        `#!${process.execPath}\nconst command=process.argv[2];\nif(command==='context') process.stdout.write(JSON.stringify('unix:///tmp/gp-raster-protocol-test.sock'));\nelse if(command==='info') process.stdout.write(JSON.stringify({OSType:'linux',MemoryLimit:true,SwapLimit:true,PidsLimit:true,SecurityOptions:['name=seccomp,profile=builtin']}));\nelse if(command==='image') process.stdout.write('${image}');\nelse if(command==='run') {process.stdin.resume();process.stdin.on('end',()=>process.stdout.write(${output}));}\n`,
        { mode: 0o700 },
      );
      await assert.rejects(processSceneSource(inertPDF()), /SOURCE_RESULT/);
    }
  } finally {
    if (previousPath === undefined) delete process.env.PATH;
    else process.env.PATH = previousPath;
    if (previousImage === undefined) delete process.env.GP_SOURCE_RASTER_IMAGE;
    else process.env.GP_SOURCE_RASTER_IMAGE = previousImage;
    process.env.GP_SOURCE_INERT_TEST_WORKER = "1";
    await rm(directory, { recursive: true, force: true });
  }
});

test("real Docker raster uses the enforced isolation policy and renders/rejects inert fixtures", async (t) => {
  const image = process.env.GP_SOURCE_RASTER_IMAGE;
  if (!image)
    return t.skip(
      "No pinned GP_SOURCE_RASTER_IMAGE; real container was not executed.",
    );
  try {
    await execute("docker", ["info", "--format", "{{.ServerVersion}}"], {
      timeout: 5000,
    });
  } catch {
    return t.skip(
      "Docker daemon unavailable; real container was not executed.",
    );
  }
  delete process.env.GP_SOURCE_INERT_TEST_WORKER;
  const name = `gp-source-policy-${randomUUID()}`;
  let dockerEnv: NodeJS.ProcessEnv | undefined;
  try {
    dockerEnv = await assertSourceProcessorReady();
    const args = sourceContainerArguments(image, name);
    args[0] = "create";
    await execute("docker", args, { env: dockerEnv, timeout: 10000 });
    const inspected = await execute("docker", ["inspect", name], {
      timeout: 5000,
      env: dockerEnv,
    });
    const [container] = JSON.parse(inspected.stdout);
    const host = container.HostConfig;
    assert.equal(host.NetworkMode, "none");
    assert.equal(host.IpcMode, "none");
    assert.equal(host.ReadonlyRootfs, true);
    assert.equal(host.Memory, 384 * 1024 * 1024);
    assert.equal(host.MemorySwap, host.Memory);
    assert.equal(host.PidsLimit, 48);
    assert.deepEqual(host.CapDrop, ["ALL"]);
    assert.ok(host.SecurityOpt.includes("no-new-privileges=true"));
    assert.match(host.Tmpfs["/tmp"], /size=64m/);
    assert.equal(container.Config.User, "65532:65532");
    assert.deepEqual(container.Mounts, []);
    assert.equal(host.Binds, null);
    assert.ok(
      !container.Config.Env.some((v: string) =>
        /SUPABASE|SERVICE_ROLE|SMTP|AUTH_FLOW/.test(v),
      ),
    );
    const result = await processSceneSource(inertPDF());
    assert.equal(result.pageCount, 1);
    assert.equal((await sharp(result.previews[0]).metadata()).format, "png");
    await assert.rejects(processSceneSource(inertPDF(true)), /SOURCE_REJECTED/);
    await assert.rejects(
      processSceneSource(Buffer.alloc(40)),
      /SOURCE_REJECTED/,
    );
    await assert.rejects(
      processSceneSource(inertPDF(), { timeoutMs: 1 }),
      /SOURCE_TIMEOUT/,
    );
  } finally {
    process.env.GP_SOURCE_INERT_TEST_WORKER = "1";
    if (dockerEnv)
      await execute("docker", ["rm", "--force", name], {
        env: dockerEnv,
        timeout: 5000,
      }).catch(() => {});
  }
});
