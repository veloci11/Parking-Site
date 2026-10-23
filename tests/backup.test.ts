import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createHash } from "node:crypto";
import {
  safeBackupPath,
  assertDifferentDestination,
  verifyBackup,
} from "../scripts/backup-project";
test("backup paths refuse traversal and restore refuses source project or missing confirmation", () => {
  for (const path of ["../secret", "/etc/passwd", "a/../../b", "a\\b", "a//b"])
    assert.throws(() => safeBackupPath("/tmp/archive", path));
  assert.equal(
    safeBackupPath("/tmp/archive", "objects/1.bin"),
    "/tmp/archive/objects/1.bin",
  );
  assert.throws(() =>
    assertDifferentDestination(
      "source",
      "https://source.supabase.co",
      "source",
    ),
  );
  assert.throws(() =>
    assertDifferentDestination("source", "https://other.supabase.co"),
  );
  assert.equal(
    assertDifferentDestination("source", "https://other.supabase.co", "other"),
    "other",
  );
});
test("local backup manifest verifies exact bytes and detects corruption", async () => {
  const root = await mkdtemp(join(tmpdir(), "gp-backup-test-"));
  try {
    const bytes = Buffer.from("inert custom dump fixture, not a real database");
    await writeFile(join(root, "database.dump"), bytes);
    await writeFile(
      join(root, "manifest.json"),
      JSON.stringify({
        version: 1,
        sourceProject: "fixture",
        createdAt: new Date().toISOString(),
        databaseScope:
          "pg_dump full database custom; provider-managed roles excluded",
        buckets: [],
        files: [
          {
            path: "database.dump",
            bytes: bytes.length,
            sha256: createHash("sha256").update(bytes).digest("hex"),
          },
        ],
      }),
    );
    assert.equal((await verifyBackup(root)).files.length, 1);
    await writeFile(join(root, "database.dump"), "corrupted");
    await assert.rejects(verifyBackup(root), /integrity/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
