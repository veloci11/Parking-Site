import { test, after } from "node:test";
import assert from "node:assert/strict";
import {
  mkdtempSync,
  rmSync,
  mkdirSync,
  writeFileSync,
  readFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import { Readable } from "node:stream";
import {
  buildPrivacyArchive,
  EXPORT_LIMITS,
  EXPORT_POLICY,
} from "../src/server/privacy-archive";
import {
  processLocalExport,
  purgeLocalExport,
} from "../src/server/privacy-export-local-worker";
import {
  handlePrivacyExports,
  localExportDB,
} from "../src/server/privacy-exports";
import { handleAuthCommands } from "../src/server/auth-commands";
import { localAuthPolicy } from "../src/lib/auth-return";
import { db, resetDbForTests } from "../src/server/db";
import { sceneDB } from "../src/server/scenes/local";
const root = mkdtempSync(join(tmpdir(), "gp-private-archive-"));
process.env.GP_FORCE_LOCAL_DEMO = "true";
process.env.GP_DATABASE_PATH = join(root, "qa.sqlite");
process.env.GP_MEDIA_PATH = join(root, "media");
process.env.GP_EXPORT_PATH = join(root, "exports");
mkdirSync(process.env.GP_MEDIA_PATH);
after(() => {
  resetDbForTests();
  rmSync(root, { recursive: true, force: true });
});
const req = (path: string, body?: unknown, cookie = "") =>
  new Request("http://127.0.0.1:3000/api/" + path, {
    method: body ? "POST" : "GET",
    headers: {
      origin: "http://127.0.0.1:3000",
      "content-type": "application/json",
      cookie,
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
test("archive en streaming bornée refuse une source manquante ou trop grosse sans archive prête", async () => {
  const file = {
    id: randomUUID(),
    kind: "source" as const,
    bucket: "scene-sources" as const,
    objectKey: "test",
    mime: "application/pdf" as const,
  };
  await assert.rejects(
    () =>
      buildPrivacyArchive({}, [file], async () => {
        throw new Error("missing");
      }),
    /SOURCE_UNAVAILABLE/,
  );
  await assert.rejects(
    () =>
      buildPrivacyArchive(
        {},
        [file],
        async () => Readable.from(Buffer.alloc(21)),
        { ...EXPORT_LIMITS, fileBytes: 20 },
      ),
    /EXPORT_TOO_LARGE/,
  );
  const archive = await buildPrivacyArchive({ own: "only" }, [file], async () =>
    Readable.from(Buffer.from("%PDF-inert-own")),
  );
  try {
    assert.equal(archive.fileCount, 1);
    assert.equal(
      JSON.parse(
        execFileSync("unzip", [
          "-p",
          archive.archivePath,
          "manifest.json",
        ]).toString(),
      ).complete,
      true,
    );
    assert.equal(
      execFileSync("unzip", [
        "-p",
        archive.archivePath,
        `files/source/${file.id}.pdf`,
      ]).toString(),
      "%PDF-inert-own",
    );
  } finally {
    await archive.cleanup();
  }
});
test("compte vide avant premier upload : archive JSON prête sans dossier média existant", async () => {
  const previous = process.env.GP_MEDIA_PATH;
  process.env.GP_MEDIA_PATH = join(root, "no-media-yet");
  const sql = localExportDB(),
    owner = String(
      sql.prepare("SELECT id FROM users WHERE role='member' LIMIT 1").get()!.id,
    ),
    id = randomUUID();
  sql
    .prepare(
      "INSERT INTO export_jobs(id,user_id,state,snapshot_json,files_json,created_at) VALUES(?,?,'queued',?,'[]',?)",
    )
    .run(
      id,
      owner,
      JSON.stringify({ profile: { id: owner }, files: [] }),
      new Date().toISOString(),
    );
  try {
    const built = await processLocalExport(id, EXPORT_POLICY);
    assert.equal(built.state, "ready");
    assert.equal(built.files, 0);
    const row = sql.prepare("SELECT * FROM export_jobs WHERE id=?").get(id)!;
    const manifest = JSON.parse(
      execFileSync("unzip", [
        "-p",
        String(row.archive_path),
        "manifest.json",
      ]).toString(),
    );
    assert.equal(manifest.complete, true);
    assert.equal(manifest.files.length, 0);
  } finally {
    process.env.GP_MEDIA_PATH = previous;
  }
});
test("job durable propre, image/PDF inclus, contributeur tiers exclu, proxy réauth, expiration et purge bornée", async () => {
  const password = "Archive-QA-password-123",
    created = await handleAuthCommands(
      req("auth/commands/register", {
        name: "QA Archive",
        email: randomUUID() + "@test.invalid",
        password,
        termsAccepted: true,
        ...localAuthPolicy,
      }),
    );
  assert.equal(created.status, 201);
  const user = (await created.json()).data,
    cookie = created.headers
      .getSetCookie()
      .map((v) => v.split(";")[0])
      .join("; "),
    sql = sceneDB();
  const listing = randomUUID(),
    now = new Date().toISOString();
  sql
    .prepare(
      "INSERT INTO listings(id,seller_id,draft_json,status,created_at,updated_at) VALUES(?,?,?,'draft',?,?)",
    )
    .run(
      listing,
      user.id,
      JSON.stringify({ spaces: [], title: "Own" }),
      now,
      now,
    );
  const imageId = randomUUID(),
    image = join(process.env.GP_MEDIA_PATH!, imageId + ".webp");
  writeFileSync(image, Buffer.from("RIFF-inert-own-image"));
  sql
    .prepare("INSERT INTO media VALUES(?,?,?,?,?,?)")
    .run(imageId, user.id, listing, image, "image/webp", now);
  const sourceId = randomUUID(),
    source = join(process.env.GP_MEDIA_PATH!, sourceId + ".pdf");
  writeFileSync(source, "%PDF-inert-own-document");
  sql
    .prepare(
      "INSERT INTO scene_sources(id,listing_id,owner_id,uploader_id,object_key,mime,byte_size,sha256,created_at,processing_state) VALUES(?,?,?,?,?,?,?,?,?,'ready')",
    )
    .run(
      sourceId,
      listing,
      user.id,
      user.id,
      source,
      "application/pdf",
      24,
      "a".repeat(64),
      now,
    );
  const other = String(
      sql.prepare("SELECT id FROM users WHERE id<>? LIMIT 1").get(user.id)!.id,
    ),
    thirdId = randomUUID(),
    third = join(process.env.GP_MEDIA_PATH!, thirdId + ".pdf");
  writeFileSync(third, "%PDF-private-other-contributor");
  sql
    .prepare(
      "INSERT INTO scene_sources(id,listing_id,owner_id,uploader_id,object_key,mime,byte_size,sha256,created_at,processing_state) VALUES(?,?,?,?,?,?,?,?,?,'ready')",
    )
    .run(
      thirdId,
      listing,
      user.id,
      other,
      third,
      "application/pdf",
      30,
      "b".repeat(64),
      now,
    );
  const queued = await handlePrivacyExports(
    req("privacy/exports", { password }, cookie),
  );
  assert.equal(queued.status, 201);
  const job = (await queued.json()).data;
  assert.equal(job.state, "queued");
  assert.equal(
    (await handlePrivacyExports(req("privacy/exports", { password }, cookie)))
      .status,
    409,
  );
  assert.equal(
    (
      await handlePrivacyExports(
        req(`privacy/exports/${job.id}/download`, { password }, cookie),
      )
    ).status,
    409,
  );
  const built = await processLocalExport(job.id, EXPORT_POLICY);
  assert.equal(built.state, "ready");
  assert.equal(built.files, 2);
  const row = localExportDB()
    .prepare("SELECT * FROM export_jobs WHERE id=?")
    .get(job.id)!;
  assert.equal(row.snapshot_json, "{}");
  const zipPath = String(row.archive_path),
    paths = execFileSync("unzip", ["-Z1", zipPath]).toString();
  assert.match(paths, new RegExp(sourceId));
  assert.match(paths, new RegExp(imageId));
  assert.equal(paths.includes(thirdId), false);
  const json = execFileSync("unzip", [
    "-p",
    zipPath,
    "account.json",
  ]).toString();
  assert.equal(json.includes(thirdId), false);
  assert.equal(json.includes("token_hash"), false);
  assert.equal(json.includes(password), false);
  assert.equal(
    (
      await handlePrivacyExports(
        req(
          `privacy/exports/${job.id}/download`,
          { password: "wrong" },
          cookie,
        ),
      )
    ).status,
    403,
  );
  const downloaded = await handlePrivacyExports(
    req(`privacy/exports/${job.id}/download`, { password }, cookie),
  );
  assert.equal(downloaded.status, 200);
  assert.equal(downloaded.headers.get("content-type"), "application/zip");
  assert.deepEqual(
    Buffer.from(await downloaded.arrayBuffer()),
    readFileSync(zipPath),
  );
  await assert.rejects(
    () => purgeLocalExport(job.id, EXPORT_POLICY),
    /EXPORT_NOT_EXPIRED/,
  );
  localExportDB()
    .prepare("UPDATE export_jobs SET expires_at=? WHERE id=?")
    .run(new Date(Date.now() - 1000).toISOString(), job.id);
  sql
    .prepare("DELETE FROM rate_limits WHERE bucket=?")
    .run(`privacy-export-reauth:${user.id}`);
  assert.equal(
    (
      await handlePrivacyExports(
        req(`privacy/exports/${job.id}/download`, { password }, cookie),
      )
    ).status,
    409,
  );
  assert.equal(
    (await purgeLocalExport(job.id, EXPORT_POLICY)).state,
    "expired",
  );
});
