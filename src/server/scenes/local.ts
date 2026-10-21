import { randomUUID } from "node:crypto";
import { db, transact } from "../db";
import { ApiError, audit } from "../security";
import {
  assertSceneMapping,
  publicSceneProjection,
  type SceneManifest,
  type SceneReview,
} from "@/lib/scene-contract";
import type { Listing, User } from "@/lib/types";
export interface SceneRow {
  id: string;
  listing_id: string;
  owner_id: string;
  creator_id: string;
  manifest: SceneManifest;
  evidence_ids: string[];
  state: string;
  row_version: number;
  approved_mapping: unknown;
  reviewed_at: string | null;
  review_reason: string | null;
  created_at: string;
}
export function sceneDB() {
  const sql = db();
  sql.exec(
    `CREATE TABLE IF NOT EXISTS scene_sources(id TEXT PRIMARY KEY,listing_id TEXT NOT NULL REFERENCES listings(id),owner_id TEXT NOT NULL REFERENCES users(id),uploader_id TEXT NOT NULL REFERENCES users(id),object_key TEXT NOT NULL,mime TEXT NOT NULL,byte_size INTEGER NOT NULL,sha256 TEXT NOT NULL,created_at TEXT NOT NULL);CREATE TABLE IF NOT EXISTS scene_models(id TEXT PRIMARY KEY,listing_id TEXT NOT NULL REFERENCES listings(id),owner_id TEXT NOT NULL REFERENCES users(id),creator_id TEXT NOT NULL REFERENCES users(id),manifest TEXT NOT NULL,evidence_ids TEXT NOT NULL,state TEXT NOT NULL,row_version INTEGER NOT NULL DEFAULT 1,approved_mapping TEXT,reviewed_at TEXT,reviewer_id TEXT,review_reason TEXT,review_checks TEXT,created_at TEXT NOT NULL,updated_at TEXT NOT NULL);`,
  );
  if (
    !sql
      .prepare("PRAGMA table_info(scene_models)")
      .all()
      .some((column) => column.name === "creator_id")
  )
    sql.exec("ALTER TABLE scene_models ADD COLUMN creator_id TEXT");
  return sql;
}
const unpack = (row: Record<string, unknown>): SceneRow => ({
  ...row,
  id: String(row.id),
  listing_id: String(row.listing_id),
  owner_id: String(row.owner_id),
  creator_id: String(row.creator_id || ""),
  manifest: JSON.parse(String(row.manifest)),
  evidence_ids: JSON.parse(String(row.evidence_ids)),
  state: String(row.state),
  row_version: Number(row.row_version),
  approved_mapping: row.approved_mapping
    ? JSON.parse(String(row.approved_mapping))
    : null,
  reviewed_at: row.reviewed_at as string | null,
  review_reason: row.review_reason as string | null,
  created_at: String(row.created_at),
});
export function localSceneListing(id: string, user: User) {
  const row = sceneDB().prepare("SELECT * FROM listings WHERE id=?").get(id);
  if (
    !row ||
    (row.seller_id !== user.id && !["moderator", "admin"].includes(user.role))
  )
    throw new ApiError(404, "Annonce introuvable.", "NOT_FOUND");
  return row;
}
export function listLocalScenes(user: User, review = false): SceneRow[] {
  return sceneDB()
    .prepare(
      review
        ? "SELECT * FROM scene_models WHERE state='pending_review' ORDER BY created_at DESC"
        : "SELECT * FROM scene_models WHERE owner_id=? ORDER BY created_at DESC",
    )
    .all(...(review ? [] : [user.id]))
    .map(unpack);
}
export function getLocalPublicScene(listingId: string, level?: number | null) {
  const listingRow = sceneDB()
    .prepare(
      "SELECT * FROM listings WHERE id=? AND public_json IS NOT NULL AND status NOT IN ('sold','withdrawn','paused')",
    )
    .get(listingId);
  if (!listingRow) return null;
  const listing: Listing = JSON.parse(String(listingRow.public_json));
  if (listing.locationPrecision !== "exact_opt_in") return null;
  const rows = sceneDB()
    .prepare(
      "SELECT * FROM scene_models WHERE listing_id=? AND state='approved' ORDER BY reviewed_at DESC",
    )
    .all(listingId);
  const row = rows
    .map(unpack)
    .find(
      (item) =>
        (level === null ||
          level === undefined ||
          item.manifest.level === level) &&
        JSON.stringify(item.approved_mapping) ===
          JSON.stringify(listing.spaces),
    );
  if (!row || !row.reviewed_at) return null;
  try {
    return publicSceneProjection(
      {
        id: row.id,
        listingId,
        version: row.row_version,
        reviewedAt: row.reviewed_at,
        manifest: row.manifest,
      },
      listing,
    );
  } catch {
    return null;
  }
}
export function createLocalScene(
  input: { listingId: string; manifest: SceneManifest; evidenceIds: string[] },
  user: User,
) {
  const listingRow = localSceneListing(input.listingId, user);
  const listing: Listing = JSON.parse(String(listingRow.draft_json));
  assertSceneMapping(input.manifest, listing);
  for (const id of input.evidenceIds)
    if (
      !sceneDB()
        .prepare("SELECT id FROM scene_sources WHERE id=? AND listing_id=?")
        .get(id, input.listingId)
    )
      throw new ApiError(
        400,
        "Source privée manquante.",
        "SCENE_EVIDENCE_REQUIRED",
      );
  const id = randomUUID(),
    date = new Date().toISOString();
  sceneDB()
    .prepare(
      "INSERT INTO scene_models(id,listing_id,owner_id,creator_id,manifest,evidence_ids,state,created_at,updated_at) VALUES(?,?,?,?,?,?,'pending_review',?,?)",
    )
    .run(
      id,
      input.listingId,
      String(listingRow.seller_id),
      user.id,
      JSON.stringify(input.manifest),
      JSON.stringify(input.evidenceIds),
      date,
      date,
    );
  audit(user.id, "scene.submit", id);
  return unpack(
    sceneDB().prepare("SELECT * FROM scene_models WHERE id=?").get(id)!,
  );
}
export function reviewLocalScene(id: string, input: SceneReview, user: User) {
  return transact(() => {
    const raw = sceneDB()
      .prepare("SELECT * FROM scene_models WHERE id=?")
      .get(id);
    if (!raw) throw new ApiError(404, "Plan introuvable.", "NOT_FOUND");
    const row = unpack(raw);
    if (
      row.owner_id === user.id ||
      row.creator_id === user.id ||
      !row.creator_id
    )
      throw new ApiError(
        403,
        "Un autre modérateur doit contrôler ce plan.",
        "SCENE_PEER_REVIEW_REQUIRED",
      );
    if (row.row_version !== input.version || row.state !== "pending_review")
      throw new ApiError(409, "Le plan a changé.", "VERSION_CONFLICT");
    let approvedMapping: string | null = null;
    if (input.decision === "approve") {
      const listingRow = sceneDB()
        .prepare(
          "SELECT * FROM listings WHERE id=? AND public_json IS NOT NULL AND status NOT IN ('sold','withdrawn','paused')",
        )
        .get(row.listing_id);
      if (!listingRow)
        throw new ApiError(
          400,
          "Publiez d’abord l’annonce avec consentement de localisation exacte.",
        );
      const listing: Listing = JSON.parse(String(listingRow.public_json));
      assertSceneMapping(row.manifest, listing, true);
      approvedMapping = JSON.stringify(listing.spaces);
      sceneDB()
        .prepare(
          "UPDATE scene_models SET state='retired',row_version=row_version+1 WHERE listing_id=? AND state='approved' AND json_extract(manifest,'$.level')=?",
        )
        .run(row.listing_id, row.manifest.level);
    }
    const state =
      input.decision === "approve"
        ? "approved"
        : input.decision === "reject"
          ? "rejected"
          : "changes_requested";
    const date = new Date().toISOString();
    sceneDB()
      .prepare(
        "UPDATE scene_models SET state=?,row_version=row_version+1,approved_mapping=?,reviewed_at=?,reviewer_id=?,review_reason=?,review_checks=?,updated_at=? WHERE id=?",
      )
      .run(
        state,
        approvedMapping,
        date,
        user.id,
        input.reason || null,
        JSON.stringify(input.checks || null),
        date,
        id,
      );
    audit(user.id, `scene.${input.decision}`, id);
    return unpack(
      sceneDB().prepare("SELECT * FROM scene_models WHERE id=?").get(id)!,
    );
  });
}
