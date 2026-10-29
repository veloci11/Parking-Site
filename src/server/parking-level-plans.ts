import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { db } from "./db";
import { sceneDB } from "./scenes/local";
import { ApiError, audit } from "./security";
import { polygonArea, type SceneManifest } from "@/lib/scene-contract";
import type {
  RegistryCommand,
  RegistryLevelPlanHistory,
  RegistryLevelPlanRevisionSummary,
  PublicParking,
  PublicParkingLevelPlan,
} from "@/lib/parking-registry";
import type { User } from "@/lib/types";

export function levelPlanDB() {
  const sql = sceneDB();
  sql.exec(
    `CREATE TABLE IF NOT EXISTS parking_level_plans(level_id TEXT PRIMARY KEY REFERENCES parking_levels(id),public_alias TEXT NOT NULL UNIQUE,manifest TEXT NOT NULL,evidence_ids TEXT NOT NULL,state TEXT NOT NULL,version INTEGER NOT NULL,reviewer_id TEXT,reason TEXT NOT NULL,reviewed_at TEXT NOT NULL,is_demo INTEGER NOT NULL DEFAULT 0);
    CREATE TABLE IF NOT EXISTS parking_level_plan_revisions(level_id TEXT NOT NULL REFERENCES parking_levels(id),row_version INTEGER NOT NULL,manifest TEXT NOT NULL,physical_mapping TEXT NOT NULL,evidence_ids TEXT NOT NULL,evidence_snapshot TEXT NOT NULL,state TEXT NOT NULL,action TEXT NOT NULL,reviewer_id TEXT,reason TEXT NOT NULL,created_at TEXT NOT NULL,restored_from_version INTEGER,is_demo INTEGER NOT NULL DEFAULT 0,PRIMARY KEY(level_id,row_version));
    CREATE TRIGGER IF NOT EXISTS level_plan_history_no_update BEFORE UPDATE ON parking_level_plan_revisions BEGIN SELECT RAISE(ABORT,'PLAN_HISTORY_IMMUTABLE'); END;
    CREATE TRIGGER IF NOT EXISTS level_plan_history_no_delete BEFORE DELETE ON parking_level_plan_revisions BEGIN SELECT RAISE(ABORT,'PLAN_HISTORY_IMMUTABLE'); END;`,
  );
  for (const row of sql
    .prepare(
      `SELECT p.* FROM parking_level_plans p WHERE NOT EXISTS(SELECT 1 FROM parking_level_plan_revisions r WHERE r.level_id=p.level_id AND r.row_version=p.version)`,
    )
    .all()) {
    snapshot(sql, row, "legacy_snapshot");
    sql
      .prepare(
        "INSERT INTO audit(id,actor_id,action,target_id,detail,created_at) VALUES(?,NULL,'registry.level_plan_history_backfill',?,?,?)",
      )
      .run(
        randomUUID(),
        String(row.level_id),
        "État antérieur conservé ; aucune nouvelle vérification de source n’est attestée.",
        new Date().toISOString(),
      );
  }
  return sql;
}
type SQL = ReturnType<typeof db>;
type Row = Record<string, unknown>;
const parse = <T>(value: unknown): T => JSON.parse(String(value));
function physicalMapping(sql: SQL, levelId: string) {
  return sql
    .prepare(
      "SELECT id,public_alias,level_id,number,dimensions FROM parking_spaces WHERE level_id=? ORDER BY id",
    )
    .all(levelId)
    .map((row) => ({
      spaceId: String(row.id),
      publicAlias: String(row.public_alias),
      levelId: String(row.level_id),
      number: String(row.number),
      dimensions: parse<Record<string, number | null>>(row.dimensions),
    }));
}
function sourceSnapshot(sql: SQL, ids: string[]) {
  return [...ids].sort().flatMap((id) => {
    const row = sql.prepare("SELECT * FROM scene_sources WHERE id=?").get(id);
    return row
      ? [
          {
            id,
            listingId: String(row.listing_id),
            ownerId: String(row.owner_id),
            sha256: String(row.sha256),
            mime: String(row.mime),
            byteSize: Number(row.byte_size),
            objectKey: String(row.object_key),
          },
        ]
      : [];
  });
}
function snapshot(
  sql: SQL,
  row: Row,
  action: RegistryLevelPlanRevisionSummary["action"],
  restoredFrom?: number,
) {
  sql
    .prepare(
      "INSERT INTO parking_level_plan_revisions VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)",
    )
    .run(
      row.level_id as string,
      row.version as number,
      row.manifest as string,
      JSON.stringify(physicalMapping(sql, String(row.level_id))),
      row.evidence_ids as string,
      JSON.stringify(sourceSnapshot(sql, parse<string[]>(row.evidence_ids))),
      row.state as string,
      action,
      row.reviewer_id as string | null,
      row.reason as string,
      row.reviewed_at as string,
      restoredFrom ?? null,
      row.is_demo as number,
    );
}
function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object")
    return `{${Object.entries(value)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, v]) => `${JSON.stringify(key)}:${canonical(v)}`)
      .join(",")}}`;
  return JSON.stringify(value);
}
export function localLevelPlanHistory(
  levelId: string,
  beforeVersion?: number,
): RegistryLevelPlanHistory {
  const sql = levelPlanDB();
  if (!sql.prepare("SELECT id FROM parking_levels WHERE id=?").get(levelId))
    throw new ApiError(404, "Niveau introuvable.", "NOT_FOUND");
  const rows = sql
    .prepare(
      "SELECT * FROM parking_level_plan_revisions WHERE level_id=? AND row_version<? ORDER BY row_version DESC LIMIT 26",
    )
    .all(levelId, beforeVersion ?? 2147483647);
  const items = rows.slice(0, 25).map((row) => ({
    version: Number(row.row_version),
    state: row.state as "published" | "withdrawn",
    action: row.action as RegistryLevelPlanRevisionSummary["action"],
    reason: String(row.reason),
    createdAt: String(row.created_at),
    spaceCount: parse<{ spaces: unknown[] }>(row.manifest).spaces.length,
    evidenceCount: parse<string[]>(row.evidence_ids).length,
    isDemo: Boolean(row.is_demo),
    ...(row.restored_from_version
      ? { restoredFromVersion: Number(row.restored_from_version) }
      : {}),
  }));
  return {
    levelId,
    currentVersion: Number(
      sql
        .prepare("SELECT version FROM parking_level_plans WHERE level_id=?")
        .get(levelId)?.version ?? 0,
    ),
    items,
    hasMore: rows.length > 25,
    ...(rows.length > 25 ? { nextBeforeVersion: items.at(-1)!.version } : {}),
  };
}
const invalid = () =>
  new ApiError(
    400,
    "Le plan commun, son repère et les places doivent être rapprochés des sources.",
    "COMMON_PLAN_INVALID",
  );
/** Dimensions come from the administered physical registry, never from a client-supplied seller ID. */
export function assertCommonFootprint(
  manifest: SceneManifest,
  physical: { id: string; dimensions: string }[],
) {
  if (manifest.spaces.length !== physical.length || !physical.length)
    throw invalid();
  for (const unit of manifest.spaces) {
    const ref = physical.find((p) => p.id === unit.spaceId);
    if (!ref) throw invalid();
    const dims = JSON.parse(ref.dimensions);
    for (const key of ["lengthM", "widthM", "clearanceM"] as const)
      if (
        dims[key] == null ||
        unit.dimensions[key] == null ||
        Math.abs(dims[key] - unit.dimensions[key]!) > 0.05
      )
        throw invalid();
    const points = unit.footprintXZ;
    if (points.length !== 4) throw invalid();
    const lengths = points
      .map((p, i) =>
        Math.hypot(
          p[0] - points[(i + 1) % 4][0],
          p[1] - points[(i + 1) % 4][1],
        ),
      )
      .sort((a, b) => a - b);
    const expected = [
      dims.widthM,
      dims.widthM,
      dims.lengthM,
      dims.lengthM,
    ].sort((a, b) => a - b);
    if (
      lengths.some((n, i) => Math.abs(n - expected[i]) > 0.05) ||
      Math.abs(polygonArea(points) - dims.lengthM * dims.widthM) > 0.1
    )
      throw invalid();
  }
  // Physical places cannot overlap. Shared boundary edges are allowed.
  for (let i = 0; i < manifest.spaces.length; i++)
    for (let j = i + 1; j < manifest.spaces.length; j++) {
      const a = manifest.spaces[i].footprintXZ,
        b = manifest.spaces[j].footprintXZ;
      const axes = [...a, ...b].map((p, k, all) => {
        const ring = k < 4 ? a : b,
          index = k % 4,
          next = ring[(index + 1) % 4];
        void all;
        return [-(next[1] - p[1]), next[0] - p[0]];
      });
      if (
        axes.every(([x, z]) => {
          const ap = a.map((p) => p[0] * x + p[1] * z),
            bp = b.map((p) => p[0] * x + p[1] * z);
          return (
            Math.min(Math.max(...ap), Math.max(...bp)) -
              Math.max(Math.min(...ap), Math.min(...bp)) >
            0.0001
          );
        })
      )
        throw invalid();
    }
}
function sourceReady(id: string, siteId: string) {
  const row = sceneDB()
    .prepare(
      `SELECT s.object_key,s.processing_state FROM scene_sources s JOIN users owner ON owner.id=s.owner_id WHERE s.id=? AND owner.status='active' AND owner.verified=1 AND EXISTS(SELECT 1 FROM registry_listing_units u JOIN parking_spaces sp ON sp.id=u.space_id JOIN parking_levels lev ON lev.id=sp.level_id WHERE u.listing_id=s.listing_id AND lev.site_id=?)`,
    )
    .get(id, siteId);
  return (
    !!row &&
    row.processing_state === "ready" &&
    existsSync(String(row.object_key))
  );
}
export function mutateLocalLevelPlan(
  c: Extract<
    RegistryCommand,
    {
      action:
        "publish_level_plan" | "withdraw_level_plan" | "restore_level_plan";
    }
  >,
  actor: User,
) {
  const sql = levelPlanDB(),
    level = sql
      .prepare("SELECT * FROM parking_levels WHERE id=?")
      .get(c.levelId);
  if (!level) throw new ApiError(404, "Niveau introuvable.", "NOT_FOUND");
  const old = sql
    .prepare("SELECT * FROM parking_level_plans WHERE level_id=?")
    .get(c.levelId);
  if (Number(old?.version ?? 0) !== c.version)
    throw new ApiError(409, "La version du plan a changé.", "VERSION_CONFLICT");
  if (c.action === "withdraw_level_plan") {
    if (!old) throw new ApiError(404, "Plan introuvable.", "NOT_FOUND");
    sql
      .prepare(
        "UPDATE parking_level_plans SET state='withdrawn',version=version+1,reason=?,reviewer_id=?,reviewed_at=? WHERE level_id=?",
      )
      .run(c.reason, actor.id, new Date().toISOString(), c.levelId);
  } else {
    let manifest, evidenceIds: string[];
    if (c.action === "restore_level_plan") {
      const revision = sql
        .prepare(
          "SELECT * FROM parking_level_plan_revisions WHERE level_id=? AND row_version=?",
        )
        .get(c.levelId, c.sourceVersion);
      if (!revision || revision.state !== "published" || revision.is_demo)
        throw new ApiError(
          400,
          "Choisissez une révision publiée issue de sources réelles.",
          "PLAN_REVISION_INVALID",
        );
      if (
        canonical(parse(revision.physical_mapping)) !==
        canonical(physicalMapping(sql, c.levelId))
      )
        throw new ApiError(
          409,
          "Le registre physique a changé ; un nouveau rapprochement est nécessaire.",
          "PLAN_HISTORY_STALE",
        );
      evidenceIds = parse<string[]>(revision.evidence_ids);
      if (
        canonical(parse(revision.evidence_snapshot)) !==
        canonical(sourceSnapshot(sql, evidenceIds))
      )
        throw new ApiError(
          409,
          "Les sources ou leurs empreintes ont changé.",
          "PLAN_HISTORY_STALE",
        );
      const consented = sql
        .prepare(
          `SELECT l.public_json FROM registry_published_units r JOIN parking_spaces p ON p.id=r.space_id JOIN listings l ON l.id=r.listing_id JOIN users owner ON owner.id=l.seller_id WHERE p.level_id=? AND l.public_json IS NOT NULL AND l.status NOT IN ('paused','sold','withdrawn','expired','suspended') AND owner.status='active' AND owner.verified=1`,
        )
        .all(c.levelId)
        .some((row) => {
          const l = parse<PublicParking["listings"][number]>(row.public_json);
          return (
            l.locationPrecision === "exact_opt_in" &&
            (!l.availabilityExpiresAt ||
              Date.parse(l.availabilityExpiresAt) > Date.now())
          );
        });
      if (!consented)
        throw new ApiError(
          409,
          "Aucune publication actuelle ne permet l’affichage exact de ce niveau.",
          "COMMON_PLAN_CONSENT_REQUIRED",
        );
      manifest = parse<SceneManifest>(revision.manifest);
    } else {
      manifest = c.manifest;
      evidenceIds = c.evidenceIds;
    }
    if (manifest.level !== Number(level.number)) throw invalid();
    const physical = sql
      .prepare(
        "SELECT id,dimensions FROM parking_spaces WHERE level_id=? ORDER BY id",
      )
      .all(c.levelId) as { id: string; dimensions: string }[];
    assertCommonFootprint(manifest, physical);
    if (
      evidenceIds.some((id) => !sourceReady(id, String(level.site_id))) ||
      manifest.provenance.geometryEvidenceIds?.some(
        (id) => !evidenceIds.includes(id),
      )
    )
      throw new ApiError(
        400,
        "Sources prêtes du même parking requises.",
        "SCENE_EVIDENCE_REQUIRED",
      );
    sql
      .prepare(
        `INSERT INTO parking_level_plans VALUES(?,?,?,?, 'published',?,?,?,?,0) ON CONFLICT(level_id) DO UPDATE SET manifest=excluded.manifest,evidence_ids=excluded.evidence_ids,state='published',version=excluded.version,reviewer_id=excluded.reviewer_id,reason=excluded.reason,reviewed_at=excluded.reviewed_at,is_demo=0`,
      )
      .run(
        c.levelId,
        old?.public_alias ?? randomUUID(),
        JSON.stringify(manifest),
        JSON.stringify(evidenceIds),
        c.version + 1,
        actor.id,
        c.reason,
        new Date().toISOString(),
      );
  }
  snapshot(
    sql,
    sql
      .prepare("SELECT * FROM parking_level_plans WHERE level_id=?")
      .get(c.levelId)!,
    c.action,
    c.action === "restore_level_plan" ? c.sourceVersion : undefined,
  );
  audit(
    actor.id,
    "registry." + c.action,
    c.levelId,
    c.action === "restore_level_plan"
      ? `sourceVersion=${c.sourceVersion}; newVersion=${c.version + 1}; ${c.reason}`
      : c.reason,
  );
  return { status: "saved" as const, id: c.levelId, version: c.version + 1 };
}
export function publicLocalLevelPlan(
  levelId: string,
  parkingId: string,
  publicLevel: PublicParking["levels"][number],
  listings: PublicParking["listings"],
): PublicParkingLevelPlan | null {
  const sql = levelPlanDB(),
    row = sql
      .prepare(
        "SELECT * FROM parking_level_plans WHERE level_id=? AND state='published'",
      )
      .get(levelId);
  if (!row) return null;
  const site = sql
    .prepare("SELECT site_id FROM parking_levels WHERE id=?")
    .get(levelId)!;
  if (
    !row.is_demo &&
    (JSON.parse(String(row.evidence_ids)) as string[]).some(
      (id) => !sourceReady(id, String(site.site_id)),
    )
  )
    return null;
  const manifest = JSON.parse(String(row.manifest)) as SceneManifest;
  const physical = sql
    .prepare(
      "SELECT id,public_alias,dimensions FROM parking_spaces WHERE level_id=?",
    )
    .all(levelId);
  try {
    assertCommonFootprint(
      manifest,
      physical.map((p) => ({
        id: String(p.id),
        dimensions: String(p.dimensions),
      })),
    );
  } catch {
    return null;
  }
  const spaces = publicLevel.spaces.map((ref) => {
    const p = physical.find((p) => p.public_alias === ref.id),
      geometry = manifest.spaces.find((u) => u.spaceId === p?.id);
    const unit = listings
      .find((l) => l.id === ref.listingId)
      ?.spaces.find((u) => u.id === ref.listingUnitId);
    if (
      !geometry ||
      !unit ||
      (["lengthM", "widthM", "clearanceM"] as const).some(
        (k) =>
          unit[k] === null ||
          geometry.dimensions[k] === null ||
          Math.abs(unit[k]! - geometry.dimensions[k]!) > 0.05,
      )
    )
      return null;
    return {
      id: ref.id,
      displayNumber: ref.number || "Place",
      footprintXZ: geometry.footprintXZ,
      dimensions: geometry.dimensions,
      source: geometry.source,
    };
  });
  if (spaces.some((s) => s === null) || !spaces.length) return null;
  return {
    id: String(row.public_alias),
    parkingId,
    version: Number(row.version),
    fidelity: row.is_demo ? "schematic" : "measured",
    reviewedAt: String(row.reviewed_at),
    isDemo: !!row.is_demo,
    manifest: {
      schemaVersion: "gp-parametric-1.1",
      unit: "m",
      upAxis: "Y",
      level: manifest.level,
      floor: manifest.floor,
      spaces: spaces.filter((s) => s !== null),
      contextSpaces: manifest.contextSpaces,
      obstacles: manifest.obstacles,
      observations: [],
      provenance: {
        calibrated: true,
        accuracyM: manifest.provenance.accuracyM!,
        controlDistancesCount: manifest.provenance.controlDistances.length,
        observedAt: manifest.provenance.observedAt,
        publicSummary: manifest.provenance.publicSummary,
        geometrySource: manifest.provenance.geometrySource,
        geometryEvidenceCount:
          manifest.provenance.geometryEvidenceIds?.length ?? 0,
      },
    },
  };
}
