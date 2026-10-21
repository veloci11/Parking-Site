import { randomUUID, createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import sharp from "sharp";
import { z } from "zod";
import { ApiError, rateLimit, localConsumeUpload } from "../security";
import { assertRemoteUploadQuota } from "../upload-quota";
import { boundedFormData } from "../uploads";
import { sceneSubmissionSchema, sceneReviewSchema } from "@/lib/scene-contract";
import { sceneContext, sceneError, boundedSceneJSON } from "./context";
import { processSceneSource, SOURCE_LIMIT } from "./source-processing";
import { attachPublicManifestHash } from "./public-contract";
import {
  sceneDB,
  localSceneListing,
  listLocalScenes,
  getLocalPublicScene,
  createLocalScene,
  reviewLocalScene,
} from "./local";
export async function handleScenes(request: Request): Promise<Response> {
  let context: ReturnType<typeof sceneContext> | undefined;
  try {
    context = sceneContext(request);
    const { client, user, moderator, headers } = context;
    const respond = (data: unknown, status = 200) =>
      Response.json({ data }, { status, headers: headers() });
    const url = new URL(request.url),
      path = url.pathname.replace(/^\/api\/scenes\/?/, "");
    if (path === "" && request.method === "GET") {
      const scope = url.searchParams.get("scope");
      if (scope === "listing") {
        const u = (await user())!,
          id = z.string().uuid().parse(url.searchParams.get("listingId"));
        if (client) {
          const result = await client
            .from("listings")
            .select("draft,seller_id")
            .eq("id", id)
            .maybeSingle();
          sceneError(result.error);
          if (!result.data) throw new ApiError(404, "Annonce introuvable.");
          if (result.data.seller_id !== u.id) await moderator(u);
          return respond(result.data.draft);
        }
        const row = localSceneListing(id, u);
        return respond(JSON.parse(String(row.draft_json)));
      }
      if (scope) {
        const u = (await user())!;
        if (scope === "review") await moderator(u);
        else if (scope !== "mine")
          throw new ApiError(400, "Vue de gestion inconnue.");
        if (client) {
          let query = client
            .from("parking_scenes")
            .select("*")
            .order("created_at", { ascending: false })
            .limit(100);
          query =
            scope === "review"
              ? query.eq("state", "pending_review")
              : query.eq("owner_id", u.id);
          const result = await query;
          sceneError(result.error);
          return respond(result.data || []);
        }
        return respond(listLocalScenes(u, scope === "review"));
      }
      const id = z.string().uuid().safeParse(url.searchParams.get("listingId"));
      if (!id.success)
        throw new ApiError(400, "Identifiant d’annonce invalide.");
      const rawLevel = url.searchParams.get("level");
      const level = rawLevel === null ? null : Number(rawLevel);
      if (
        level !== null &&
        (!Number.isInteger(level) || level < -20 || level > 20)
      )
        throw new ApiError(400, "Niveau invalide.");
      if (client) {
        const result = await client.rpc("gp_scene_public", {
          p_listing_id: id.data,
          p_level: level,
        });
        sceneError(result.error);
        if (!result.data)
          throw new ApiError(
            404,
            "Aucun plan approuvé pour cette annonce.",
            "NOT_FOUND",
          );
        return respond(attachPublicManifestHash(result.data));
      }
      const value = getLocalPublicScene(id.data, level);
      if (!value)
        throw new ApiError(
          404,
          "Aucun plan approuvé pour cette annonce.",
          "NOT_FOUND",
        );
      return respond(attachPublicManifestHash(value));
    }
    if (path === "" && request.method === "POST") {
      const u = (await user())!;
      if (!u.emailVerified)
        throw new ApiError(403, "Confirmez votre email.", "EMAIL_UNVERIFIED");
      const parsed = sceneSubmissionSchema.safeParse(
        await boundedSceneJSON(request),
      );
      if (!parsed.success)
        throw new ApiError(
          400,
          parsed.error.issues
            .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
            .join(" · "),
        );
      const input = parsed.data;
      if (client) {
        const result = await client.rpc("gp_scene_create", {
          p_listing_id: input.listingId,
          p_manifest: input.manifest,
          p_evidence_ids: input.evidenceIds,
          p_rights_attested: true,
        });
        sceneError(result.error);
        return respond(result.data, 201);
      }
      rateLimit(`scene:${u.id}`, 20, 86400);
      return respond(createLocalScene(input, u), 201);
    }
    const review = path.match(/^([a-f0-9-]{36})\/review$/);
    if (review && request.method === "POST") {
      const u = (await user())!;
      await moderator(u);
      const parsed = sceneReviewSchema.safeParse(
        await boundedSceneJSON(request),
      );
      if (!parsed.success)
        throw new ApiError(
          400,
          parsed.error.issues.map((issue) => issue.message).join(" · "),
        );
      const input = parsed.data;
      if (client) {
        const result = await client.rpc("gp_scene_review", {
          p_id: review[1],
          p_version: input.version,
          p_decision: input.decision,
          p_checks: input.checks || null,
          p_reason: input.reason || null,
        });
        sceneError(result.error);
        return respond(result.data);
      }
      return respond(reviewLocalScene(review[1], input, u));
    }
    if (path === "sources" && request.method === "POST") {
      const u = (await user())!;
      if (!u.emailVerified) throw new ApiError(403, "Confirmez votre email.");
      const form = await boundedFormData(request, 27 * 1024 * 1024);
      const listingId = z.string().uuid().safeParse(form.get("listingId"));
      const file = form.get("file");
      if (
        !listingId.success ||
        !(file instanceof File) ||
        file.size < 20 ||
        file.size > SOURCE_LIMIT
      )
        throw new ApiError(
          400,
          "Choisissez un plan PDF, JPEG ou PNG de 25 Mio maximum.",
        );
      let ownerId: string;
      if (client) {
        const result = await client
          .from("listings")
          .select("seller_id")
          .eq("id", listingId.data)
          .maybeSingle();
        sceneError(result.error);
        if (!result.data) throw new ApiError(404, "Annonce introuvable.");
        ownerId = result.data.seller_id;
        if (ownerId !== u.id) await moderator(u);
      } else ownerId = String(localSceneListing(listingId.data, u).seller_id);
      const source = Buffer.from(await file.arrayBuffer());
      let clean: Buffer, mime: string, extension: string;
      if (source.subarray(0, 5).toString() === "%PDF-") {
        clean = source;
        mime = "application/pdf";
        extension = "pdf";
      } else {
        try {
          const image = sharp(source, { limitInputPixels: 30000000 });
          const metadata = await image.metadata();
          if (!["jpeg", "png", "webp"].includes(metadata.format || ""))
            throw new Error();
          clean = await image
            .rotate()
            .resize({
              width: 2400,
              height: 2400,
              fit: "inside",
              withoutEnlargement: true,
            })
            .webp({ quality: 90 })
            .toBuffer();
        } catch {
          throw new ApiError(
            400,
            "Plan illisible. Utilisez un PDF simple, JPEG ou PNG.",
          );
        }
        mime = "image/webp";
        extension = "webp";
      }
      const id = randomUUID(),
        key = `${u.id}/${listingId.data}/${id}.${extension}`,
        sha256 = createHash("sha256").update(clean).digest("hex");
      if (client) {
        await assertRemoteUploadQuota(client, clean.length);
        const metadata = await client.from("parking_scene_sources").insert({
          id,
          listing_id: listingId.data,
          owner_id: ownerId,
          uploader_id: u.id,
          object_key: key,
          mime,
          byte_size: clean.length,
          sha256,
        });
        sceneError(metadata.error);
        const uploaded = await client.storage
          .from("scene-sources")
          .upload(key, clean, { contentType: mime, upsert: false });
        if (uploaded.error) await assertRemoteUploadQuota(client, clean.length);
        sceneError(uploaded.error);
      } else {
        const sql = sceneDB();
        const count = sql
          .prepare(
            "SELECT count(*) AS count FROM scene_sources WHERE listing_id=?",
          )
          .get(listingId.data);
        if (Number(count?.count) >= 10)
          throw new ApiError(
            400,
            "Limite de 10 pièces sources par annonce atteinte.",
          );
        localConsumeUpload(u.id, clean.length);
        const processed = await processSceneSource(clean).catch(() => {
          throw new ApiError(
            400,
            "Document refusé par le traitement. Exportez un PDF simple ou une image.",
          );
        });
        const directory = resolve(
          process.env.GP_MEDIA_PATH || ".data/media",
          "scene-sources",
        );
        await mkdir(directory, { recursive: true, mode: 0o700 });
        const localPath = resolve(directory, `${id}.${extension}`);
        await writeFile(localPath, clean, { mode: 0o600 });
        sql
          .prepare(
            "INSERT INTO scene_sources(id,listing_id,owner_id,uploader_id,object_key,mime,byte_size,sha256,created_at) VALUES(?,?,?,?,?,?,?,?,?)",
          )
          .run(
            id,
            listingId.data,
            ownerId,
            u.id,
            localPath,
            mime,
            clean.length,
            sha256,
            new Date().toISOString(),
          );
        const previewKeys: string[] = [];
        for (let index = 0; index < processed.previews.length; index++) {
          const preview = resolve(directory, `${id}.preview-${index + 1}.png`);
          await writeFile(preview, processed.previews[index], { mode: 0o600 });
          previewKeys.push(preview);
        }
        sql
          .prepare(
            "UPDATE scene_sources SET processing_state='ready',preview_keys=?,page_count=? WHERE id=?",
          )
          .run(JSON.stringify(previewKeys), processed.pageCount, id);
      }
      return respond(
        {
          id,
          mime,
          byteSize: clean.length,
          processing_state: client ? "processing" : "ready",
          url: `/api/scenes/sources?id=${id}`,
        },
        201,
      );
    }
    if (path === "sources" && request.method === "GET") {
      const u = (await user())!;
      if (!url.searchParams.has("id")) {
        const listingId = url.searchParams.get("listingId"),
          review = url.searchParams.get("scope") === "review";
        if (review) await moderator(u);
        if (!review && !z.string().uuid().safeParse(listingId).success)
          throw new ApiError(400, "Annonce invalide.");
        if (client) {
          let query = client
            .from("parking_scene_sources")
            .select(
              "id,listing_id,mime,byte_size,created_at,processing_state,page_count,preview_keys",
            )
            .order("created_at", { ascending: false })
            .limit(100);
          if (!review) query = query.eq("listing_id", listingId);
          const result = await query;
          sceneError(result.error);
          return respond(
            (result.data || []).map((row) => ({
              ...row,
              preview_keys: undefined,
              previewUrls: (row.preview_keys || []).map(
                (_: string, index: number) =>
                  `/api/scenes/sources?id=${row.id}&preview=${index + 1}`,
              ),
              url: `/api/scenes/sources?id=${row.id}`,
            })),
          );
        }
        if (!review) localSceneListing(listingId!, u);
        const rows = sceneDB()
          .prepare(
            review
              ? "SELECT id,listing_id,mime,byte_size,created_at,processing_state,page_count,preview_keys FROM scene_sources ORDER BY created_at DESC LIMIT 100"
              : "SELECT id,listing_id,mime,byte_size,created_at,processing_state,page_count,preview_keys FROM scene_sources WHERE listing_id=? ORDER BY created_at DESC",
          )
          .all(...(review ? [] : [listingId!]));
        return respond(
          rows.map((row) => ({
            ...row,
            preview_keys: undefined,
            previewUrls: JSON.parse(String(row.preview_keys || "[]")).map(
              (_: string, index: number) =>
                `/api/scenes/sources?id=${row.id}&preview=${index + 1}`,
            ),
            url: `/api/scenes/sources?id=${row.id}`,
          })),
        );
      }
      const parsed = z.string().uuid().safeParse(url.searchParams.get("id"));
      if (!parsed.success) throw new ApiError(400, "Source invalide.");
      const preview = url.searchParams.has("preview")
        ? Number(url.searchParams.get("preview"))
        : null;
      if (
        preview !== null &&
        (!Number.isInteger(preview) || preview < 1 || preview > 3)
      )
        throw new ApiError(400, "Aperçu invalide.");
      let bytes: Buffer, mime: string;
      if (client) {
        const result = await client
          .from("parking_scene_sources")
          .select("*")
          .eq("id", parsed.data)
          .maybeSingle();
        sceneError(result.error);
        if (!result.data) throw new ApiError(404, "Source introuvable.");
        if (result.data.owner_id !== u.id) await moderator(u);
        if (
          preview === null &&
          url.searchParams.get("download") !== "acknowledged"
        )
          throw new ApiError(
            400,
            "Consultez d’abord l’aperçu. Le téléchargement original nécessite votre accord explicite.",
          );
        if (result.data.processing_state !== "ready")
          throw new ApiError(409, "Document en traitement ou refusé.");
        const key =
          preview === null
            ? result.data.object_key
            : result.data.preview_keys?.[preview - 1];
        if (!key) throw new ApiError(404, "Aperçu introuvable.");
        const file = await client.storage.from("scene-sources").download(key);
        sceneError(file.error);
        if (!file.data) throw new ApiError(404, "Source introuvable.");
        bytes = Buffer.from(await file.data.arrayBuffer());
        mime = preview === null ? result.data.mime : "image/png";
      } else {
        const row = sceneDB()
          .prepare("SELECT * FROM scene_sources WHERE id=?")
          .get(parsed.data);
        if (
          !row ||
          (row.owner_id !== u.id && !["moderator", "admin"].includes(u.role))
        )
          throw new ApiError(404, "Source introuvable.");
        if (
          preview === null &&
          url.searchParams.get("download") !== "acknowledged"
        )
          throw new ApiError(
            400,
            "Consultez d’abord l’aperçu. Le téléchargement original nécessite votre accord explicite.",
          );
        if (row.processing_state !== "ready")
          throw new ApiError(409, "Document en traitement ou refusé.");
        const key =
          preview === null
            ? row.object_key
            : JSON.parse(String(row.preview_keys || "[]"))[preview - 1];
        if (!key) throw new ApiError(404, "Aperçu introuvable.");
        bytes = await readFile(String(key));
        mime = preview === null ? String(row.mime) : "image/png";
      }
      const h = headers();
      h.set("Content-Type", mime);
      h.set("X-Content-Type-Options", "nosniff");
      h.set(
        "Content-Disposition",
        `${preview === null ? "attachment" : "inline"}; filename="plan-${parsed.data}.${mime === "application/pdf" ? "pdf" : mime === "image/png" ? "png" : "webp"}"`,
      );
      h.set("Content-Security-Policy", "sandbox; default-src 'none'");
      return new Response(new Uint8Array(bytes), { headers: h });
    }
    throw new ApiError(404, "Ressource introuvable.", "NOT_FOUND");
  } catch (error) {
    const h = context?.headers() || { "Cache-Control": "no-store" };
    if (error instanceof ApiError) {
      if (error.status === 429) {
        if (h instanceof Headers)
          h.set("Retry-After", String(error.retryAfter ?? 60));
      }
      return Response.json(
        { error: error.message, code: error.code },
        { status: error.status, headers: h },
      );
    }
    if (
      error instanceof Error &&
      /correspond|place|calibr|échelle|mesure|localisation|géométr/i.test(
        error.message,
      )
    )
      return Response.json(
        { error: error.message, code: "SCENE_INVALID" },
        { status: 400, headers: h },
      );
    return Response.json(
      {
        error: "Le service de plans est indisponible.",
        code: "SCENE_UNAVAILABLE",
      },
      { status: 503, headers: h },
    );
  }
}
