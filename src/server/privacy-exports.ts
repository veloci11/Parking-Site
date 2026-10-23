import { createClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { sceneContext } from "./scenes/context";
import { readBoundedJson } from "./json-body";
import { ApiError, passwordMatches, rateLimit, audit } from "./security";
import { db } from "./db";
import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { Readable } from "node:stream";
async function passwordBody(request: Request) {
  if (
    !request.headers
      .get("content-type")
      ?.startsWith("application/x-www-form-urlencoded")
  )
    return readBoundedJson(request, 16384);
  if (!request.body) throw new ApiError(400, "Demande vide.");
  const reader = request.body.getReader(),
    chunks: Uint8Array[] = [];
  let size = 0;
  try {
    for (;;) {
      const part = await reader.read();
      if (part.done) break;
      size += part.value.byteLength;
      if (size > 16384) {
        await reader.cancel();
        throw new ApiError(413, "Demande trop volumineuse.");
      }
      chunks.push(part.value);
    }
  } finally {
    reader.releaseLock();
  }
  const values = new URLSearchParams(Buffer.concat(chunks).toString("utf8"));
  if (
    values.getAll("password").length !== 1 ||
    [...values.keys()].some((k) => k !== "password")
  )
    throw new ApiError(400, "Demande invalide.");
  return { password: values.get("password") };
}
export interface ExportJob {
  id: string;
  state: "queued" | "processing" | "ready" | "failed" | "expired";
  createdAt: string;
  readyAt: string | null;
  expiresAt: string | null;
  byteSize: number | null;
  errorCode: string | null;
}
export function localExportDB() {
  const sql = db();
  sql.exec(
    "CREATE TABLE IF NOT EXISTS export_jobs(id TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES users(id),state TEXT NOT NULL,snapshot_json TEXT NOT NULL,files_json TEXT NOT NULL,archive_path TEXT,byte_size INTEGER,sha256 TEXT,error_code TEXT,created_at TEXT NOT NULL,ready_at TEXT,expires_at TEXT)",
  );
  return sql;
}
export function localJob(row: Record<string, unknown>): ExportJob {
  return {
    id: String(row.id),
    state: (row.state === "ready" &&
    Date.parse(String(row.expires_at)) <= Date.now()
      ? "expired"
      : row.state) as ExportJob["state"],
    createdAt: String(row.created_at),
    readyAt: row.ready_at as string | null,
    expiresAt: row.expires_at as string | null,
    byteSize: row.byte_size as number | null,
    errorCode: row.error_code as string | null,
  };
}
export async function handlePrivacyExports(
  request: Request,
): Promise<Response> {
  let ctx: ReturnType<typeof sceneContext> | undefined;
  try {
    ctx = sceneContext(request);
    const { client, user, headers } = ctx,
      u = (await user())!,
      path = new URL(request.url).pathname;
    const matched = /^\/api\/privacy\/exports\/([a-f0-9-]{36})\/download$/.exec(
        path,
      ),
      download = matched ? z.string().uuid().parse(matched[1]) : null;
    if (request.method === "GET" && path === "/api/privacy/exports") {
      if (client) {
        const r = await client.rpc("gp_export_history");
        if (r.error)
          throw new ApiError(
            503,
            "Votre historique d’exports est indisponible.",
          );
        return Response.json({ data: r.data }, { headers: headers() });
      }
      return Response.json(
        {
          data: localExportDB()
            .prepare(
              "SELECT * FROM export_jobs WHERE user_id=? ORDER BY created_at DESC LIMIT 50",
            )
            .all(u.id)
            .map(localJob),
        },
        { headers: headers() },
      );
    }
    if (
      request.method !== "POST" ||
      (!download && path !== "/api/privacy/exports")
    )
      throw new ApiError(
        405,
        "Utilisez la confirmation de mot de passe pour demander ou télécharger une archive.",
      );
    const input = z
      .object({ password: z.string().min(1).max(128) })
      .strict()
      .parse(await passwordBody(request));
    if (!client) {
      rateLimit(`privacy-export-reauth:${u.id}`, 5, 600);
      const row = db()
        .prepare("SELECT password FROM users WHERE id=?")
        .get(u.id);
      if (
        !row?.password ||
        !passwordMatches(input.password, String(row.password))
      )
        throw new ApiError(
          403,
          "Confirmez votre mot de passe.",
          "REAUTH_REQUIRED",
        );
      const sql = localExportDB();
      if (download) {
        const job = sql
          .prepare("SELECT * FROM export_jobs WHERE id=? AND user_id=?")
          .get(download, u.id);
        if (!job) throw new ApiError(404, "Archive introuvable.");
        if (localJob(job).state !== "ready" || !job.archive_path)
          throw new ApiError(
            409,
            "Cette archive n’est pas disponible ou a expiré.",
          );
        const file = String(job.archive_path),
          metadata = await stat(file);
        if (metadata.size !== job.byte_size)
          throw new ApiError(503, "Archive indisponible.");
        audit(u.id, "privacy.export_download", download);
        const h = headers();
        h.set("Content-Type", "application/zip");
        h.set(
          "Content-Disposition",
          'attachment; filename="mes-donnees-gp.zip"',
        );
        h.set("Content-Length", String(metadata.size));
        return new Response(
          Readable.toWeb(createReadStream(file)) as ReadableStream,
          { headers: h },
        );
      }
      if (
        sql
          .prepare(
            "SELECT id FROM export_jobs WHERE user_id=? AND state IN('queued','processing')",
          )
          .get(u.id)
      )
        throw new ApiError(
          409,
          "Une demande est déjà en cours. Consultez son état.",
          "EXPORT_PENDING",
        );
      rateLimit(`privacy-export-job:${u.id}`, 3, 3600);
      const { localPrivacyExport } = await import("./privacy-commands");
      const snapshot = localPrivacyExport(u),
        files: Record<string, unknown>[] = [];
      for (const row of sql
        .prepare("SELECT * FROM media WHERE owner_id=?")
        .all(u.id))
        files.push({
          id: row.id,
          kind: "media",
          bucket: "private-uploads",
          objectKey: row.path,
          mime: row.mime,
        });
      if (
        sql
          .prepare(
            "SELECT name FROM sqlite_master WHERE type='table' AND name='scene_sources'",
          )
          .get()
      )
        for (const row of sql
          .prepare(
            "SELECT * FROM scene_sources WHERE owner_id=? AND uploader_id=?",
          )
          .all(u.id, u.id))
          files.push({
            id: row.id,
            kind: "source",
            bucket: "scene-sources",
            objectKey: row.object_key,
            mime: row.mime,
          });
      if (
        files.length > 250 ||
        Buffer.byteLength(JSON.stringify(snapshot)) > 32 * 1024 * 1024
      )
        throw new ApiError(
          413,
          "Cet export dépasse la limite automatique. Aucun fichier incomplet ne sera déclaré prêt.",
          "EXPORT_TOO_LARGE",
        );
      const id = randomUUID(),
        now = new Date().toISOString();
      sql
        .prepare(
          "INSERT INTO export_jobs(id,user_id,state,snapshot_json,files_json,created_at) VALUES(?,?,'queued',?,?,?)",
        )
        .run(id, u.id, JSON.stringify(snapshot), JSON.stringify(files), now);
      audit(u.id, "privacy.export_requested", id);
      return Response.json(
        {
          data: localJob(
            sql.prepare("SELECT * FROM export_jobs WHERE id=?").get(id)!,
          ),
        },
        { status: 201, headers: headers() },
      );
    }
    const reauth = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { auth: { persistSession: false, autoRefreshToken: false } },
    );
    const fresh = await reauth.auth.signInWithPassword({
      email: u.email,
      password: input.password,
    });
    if (fresh.error || fresh.data.user?.id !== u.id) {
      await reauth.auth.signOut({ scope: "local" });
      throw new ApiError(
        403,
        "Confirmez votre mot de passe.",
        "REAUTH_REQUIRED",
      );
    }
    try {
      const r = download
        ? await reauth.rpc("gp_export_download", { p_id: download })
        : await reauth.rpc("gp_export_request");
      if (r.error) {
        const code = [
          "EXPORT_PENDING",
          "EXPORT_TOO_LARGE",
          "EXPORT_NOT_READY",
          "NOT_FOUND",
        ].find((c) => r.error!.message.includes(c));
        throw new ApiError(
          code === "EXPORT_TOO_LARGE" ? 413 : code === "NOT_FOUND" ? 404 : 409,
          code === "EXPORT_TOO_LARGE"
            ? "Cet export dépasse la limite automatique. Aucune archive partielle ne sera produite."
            : code === "EXPORT_PENDING"
              ? "Une demande est déjà en cours. Consultez son état."
              : "L’archive n’est pas disponible. Réessayez ou demandez un nouvel export.",
          code,
        );
      }
      if (!download)
        return Response.json(
          { data: r.data },
          { status: 201, headers: headers() },
        );
      const token = fresh.data.session?.access_token,
        key = String(r.data.objectKey);
      if (
        !token ||
        !key.startsWith(u.id + "/") ||
        key.split("/").some((v) => v === "." || v === ".." || !v)
      )
        throw new ApiError(503, "Archive indisponible.");
      const upstream = await fetch(
        `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/authenticated/private-exports/${key.split("/").map(encodeURIComponent).join("/")}`,
        {
          headers: {
            apikey:
              process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
              process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
            Authorization: `Bearer ${token}`,
          },
          signal: AbortSignal.timeout(120000),
        },
      );
      if (!upstream.ok || !upstream.body)
        throw new ApiError(503, "Le téléchargement privé a échoué. Réessayez.");
      const h = headers();
      h.set("Content-Type", "application/zip");
      h.set("Content-Disposition", 'attachment; filename="mes-donnees-gp.zip"');
      h.set("Content-Length", String(r.data.byteSize));
      return new Response(upstream.body, { headers: h });
    } finally {
      await reauth.auth.signOut({ scope: "local" });
    }
  } catch (error) {
    const h =
      ctx?.headers() || new Headers({ "Cache-Control": "private, no-store" });
    return Response.json(
      {
        error:
          error instanceof ApiError
            ? error.message
            : error instanceof z.ZodError
              ? "Vérifiez votre demande."
              : "Le service d’export privé est indisponible.",
        code: error instanceof ApiError ? error.code : "EXPORT_UNAVAILABLE",
      },
      {
        status:
          error instanceof ApiError
            ? error.status
            : error instanceof z.ZodError
              ? 400
              : 503,
        headers: h,
      },
    );
  }
}
