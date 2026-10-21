/** Opt-in operator tool. Never uses the app's credentials or defaults to a remote project. */
import { createClient } from "@supabase/supabase-js";
import { createHash } from "node:crypto";
import {
  readFile,
  writeFile,
  mkdir,
  chmod,
  realpath,
  lstat,
} from "node:fs/promises";
import { resolve, relative, isAbsolute, basename, dirname } from "node:path";
import { homedir } from "node:os";
import { spawn } from "node:child_process";
import { z } from "zod";
const fileSchema = z
  .object({
    path: z.string(),
    sha256: z.string().regex(/^[a-f0-9]{64}$/),
    bytes: z.number().int().nonnegative(),
    bucket: z.string().optional(),
    key: z.string().optional(),
    contentType: z.string().optional(),
  })
  .strict();
export const backupManifestSchema = z
  .object({
    version: z.literal(1),
    sourceProject: z.string().regex(/^[a-z0-9-]+$/),
    createdAt: z.string().datetime(),
    databaseScope: z.literal(
      "pg_dump full database custom; provider-managed roles excluded",
    ),
    buckets: z.array(
      z
        .object({
          id: z.string(),
          public: z.boolean(),
          fileSizeLimit: z.number().nullable(),
          allowedMimeTypes: z.array(z.string()).nullable(),
        })
        .strict(),
    ),
    files: z.array(fileSchema),
  })
  .strict();
export type BackupManifest = z.infer<typeof backupManifestSchema>;
export function safeBackupPath(root: string, path: string) {
  if (
    !path ||
    path.includes("\\") ||
    path.includes("\0") ||
    isAbsolute(path) ||
    path.split("/").some((v) => v === ".." || v === "" || v === ".")
  )
    throw new Error("Unsafe backup path");
  const target = resolve(root, path);
  if (relative(resolve(root), target).startsWith(".."))
    throw new Error("Outside backup directory");
  return target;
}
export function projectRef(url: string) {
  const parsed = new URL(url);
  if (parsed.protocol !== "https:" || !parsed.hostname.endsWith(".supabase.co"))
    throw new Error("Use an explicit https://PROJECT.supabase.co URL");
  return parsed.hostname.split(".")[0];
}
export function assertDifferentDestination(
  source: string,
  url: string,
  confirmation?: string,
) {
  const destination = projectRef(url);
  if (source === destination)
    throw new Error("Restore into source project is forbidden");
  if (confirmation !== destination)
    throw new Error("Explicit --confirm-destination PROJECT is required");
  return destination;
}
const digest = (bytes: Uint8Array) =>
  createHash("sha256").update(bytes).digest("hex");
export async function verifyBackup(root: string) {
  const manifest = backupManifestSchema.parse(
    JSON.parse(await readFile(resolve(root, "manifest.json"), "utf8")),
  );
  const seen = new Set<string>();
  for (const file of manifest.files) {
    if (seen.has(file.path)) throw new Error("Duplicate backup path");
    seen.add(file.path);
    const path = safeBackupPath(root, file.path),
      stat = await lstat(path);
    if (!stat.isFile() || stat.isSymbolicLink())
      throw new Error("Backup must contain regular files");
    const resolved = await realpath(path);
    if (relative(await realpath(root), resolved).startsWith(".."))
      throw new Error("Symlink outside backup directory");
    const bytes = await readFile(path);
    if (bytes.length !== file.bytes || digest(bytes) !== file.sha256)
      throw new Error("Backup integrity mismatch");
  }
  if (!manifest.files.some((f) => f.path === "database.dump"))
    throw new Error("Database dump missing");
  return manifest;
}
function option(name: string) {
  const index = process.argv.indexOf(name);
  return index < 0 ? undefined : process.argv[index + 1];
}
function required(name: string) {
  const value = process.env[name];
  if (!value) throw new Error(`Missing ${name}`);
  return value;
}
async function dump(path: string) {
  const url = new URL(required("GP_BACKUP_DATABASE_URL"));
  if (!["postgres:", "postgresql:"].includes(url.protocol))
    throw new Error("Invalid database protocol");
  const child = spawn(
    process.env.GP_PG_DUMP_BIN || "pg_dump",
    ["--format=custom", "--no-owner", "--no-privileges", "--file", path],
    {
      stdio: ["ignore", "ignore", "pipe"],
      env: {
        ...process.env,
        PGHOST: url.hostname,
        PGPORT: url.port || "5432",
        PGUSER: decodeURIComponent(url.username),
        PGPASSWORD: decodeURIComponent(url.password),
        PGDATABASE: decodeURIComponent(url.pathname.slice(1)),
        PGSSLMODE: "require",
      },
    },
  );
  await new Promise<void>((yes, no) => {
    child.on("error", () => no(new Error("pg_dump unavailable")));
    child.stderr?.resume();
    child.on("exit", (code) =>
      code === 0
        ? yes()
        : no(
            new Error(
              "pg_dump failed; inspect connection and client version locally",
            ),
          ),
    );
  });
  await chmod(path, 0o600);
}
async function main() {
  const mode = process.argv[2] || "help",
    root = resolve(
      option("--dir") ||
        resolve(
          homedir(),
          ".gp-parking-backups",
          new Date().toISOString().replace(/[:.]/g, "-"),
        ),
    );
  if (mode === "verify") {
    const manifest = await verifyBackup(root);
    console.log(
      JSON.stringify({
        status: "verified",
        files: manifest.files.length,
        buckets: manifest.buckets.length,
      }),
    );
    return;
  }
  if (mode === "restore-plan") {
    const manifest = await verifyBackup(root);
    const destination = assertDifferentDestination(
      manifest.sourceProject,
      required("GP_RESTORE_SUPABASE_URL"),
      option("--confirm-destination"),
    );
    console.log(
      JSON.stringify({
        mode: "manual_restore_plan_only",
        destination,
        verifiedFiles: manifest.files.length,
        steps: [
          "Create a separate staging project; preserve this verified backup read-only.",
          "Use matching pg_restore --list database.dump and review provider-managed auth/storage objects with your operator.",
          "Restore reviewed application/auth data and database functions through a scoped database connection. Do not blindly overwrite provider-managed schemas.",
          "Create each manifest bucket with its recorded privacy and limits. Upload each storage file to its exact bucket/key using the Storage API, after its database references exist.",
          "Check auth users, roles/RLS, private attachment denial, listing/media visibility, scenes and approvals, then compare hashes/object inventory.",
          "Run an isolated restore drill before accepting recovery. No source project action is performed.",
        ],
        databaseRestored: false,
        storageRestored: false,
      }),
    );
    return;
  }
  if (mode !== "backup") {
    console.log(
      "backup [--execute] [--dir PRIVATE_DIR]; verify --dir PRIVATE_DIR; restore-plan --dir PRIVATE_DIR --confirm-destination DIFFERENT_PROJECT. See docs/OPS_BACKUP.md.",
    );
    return;
  }
  const source = projectRef(required("GP_BACKUP_SUPABASE_URL"));
  if (!process.argv.includes("--execute")) {
    console.log(
      JSON.stringify({
        mode: "dry_run",
        sourceProject: source,
        destination: root,
        actions: [
          "pg_dump custom",
          "Storage API inventory and download all public/private buckets",
          "SHA-256 manifest",
        ],
        remoteReads: false,
      }),
    );
    return;
  }
  if (
    !relative(process.cwd(), root).startsWith("..") &&
    !isAbsolute(relative(process.cwd(), root))
  )
    throw new Error("Choose a private backup directory outside the repository");
  await mkdir(dirname(root), { recursive: true, mode: 0o700 });
  // Exclusive creation prevents overwriting a previous backup or following an existing symlink.
  await mkdir(root, { mode: 0o700, recursive: false });
  const manifest: BackupManifest = {
    version: 1,
    sourceProject: source,
    createdAt: new Date().toISOString(),
    databaseScope:
      "pg_dump full database custom; provider-managed roles excluded",
    buckets: [],
    files: [],
  };
  await dump(resolve(root, "database.dump"));
  const db = await readFile(resolve(root, "database.dump"));
  manifest.files.push({
    path: "database.dump",
    sha256: digest(db),
    bytes: db.length,
  });
  const client = createClient(
    required("GP_BACKUP_SUPABASE_URL"),
    required("GP_BACKUP_SERVICE_ROLE_KEY"),
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
  const { data: buckets, error } = await client.storage.listBuckets();
  if (error) throw new Error("Cannot inventory Storage buckets");
  for (const bucket of buckets) {
    manifest.buckets.push({
      id: bucket.id,
      public: bucket.public,
      fileSizeLimit: bucket.file_size_limit ?? null,
      allowedMimeTypes: bucket.allowed_mime_types ?? null,
    });
    const visit = async (prefix: string) => {
      for (let offset = 0; ; offset += 1000) {
        const { data: items, error: listError } = await client.storage
          .from(bucket.id)
          .list(prefix, {
            limit: 1000,
            offset,
            sortBy: { column: "name", order: "asc" },
          });
        if (listError) throw new Error("Storage inventory failed");
        for (const item of items || []) {
          const key = prefix ? `${prefix}/${item.name}` : item.name;
          if (!item.id) {
            await visit(key);
            continue;
          }
          const { data: blob, error: downloadError } = await client.storage
            .from(bucket.id)
            .download(key);
          if (downloadError || !blob)
            throw new Error("Storage download failed");
          const bytes = new Uint8Array(await blob.arrayBuffer());
          const path = `objects/${manifest.files.length.toString().padStart(8, "0")}.bin`;
          await mkdir(resolve(root, "objects"), {
            recursive: true,
            mode: 0o700,
          });
          await writeFile(safeBackupPath(root, path), bytes, {
            mode: 0o600,
            flag: "wx",
          });
          manifest.files.push({
            path,
            sha256: digest(bytes),
            bytes: bytes.length,
            bucket: bucket.id,
            key,
            contentType: blob.type,
          });
        }
        if ((items?.length || 0) < 1000) break;
      }
    };
    await visit("");
  }
  await writeFile(
    resolve(root, "manifest.json"),
    JSON.stringify(manifest, null, 2) + "\n",
    { mode: 0o600, flag: "wx" },
  );
  await verifyBackup(root);
  console.log(
    JSON.stringify({
      status: "backup_verified",
      directory: root,
      files: manifest.files.length,
      buckets: manifest.buckets.length,
      consistentSnapshot: false,
    }),
  );
}
if (basename(process.argv[1] || "") === "backup-project.ts")
  main().catch(() => {
    console.error(
      "Operation failed. Incomplete directories have no valid manifest. Check configuration and private local diagnostics; never paste credentials.",
    );
    process.exitCode = 1;
  });
