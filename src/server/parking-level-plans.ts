import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { db } from "./db";
import { sceneDB } from "./scenes/local";
import { ApiError, audit } from "./security";
import { polygonArea, type SceneManifest } from "@/lib/scene-contract";
import type {
  RegistryCommand,
  PublicParking,
  PublicParkingLevelPlan,
} from "@/lib/parking-registry";
import type { User } from "@/lib/types";

export function levelPlanDB() {
  const sql = db();
  sql.exec(
    `CREATE TABLE IF NOT EXISTS parking_level_plans(level_id TEXT PRIMARY KEY REFERENCES parking_levels(id),public_alias TEXT NOT NULL UNIQUE,manifest TEXT NOT NULL,evidence_ids TEXT NOT NULL,state TEXT NOT NULL,version INTEGER NOT NULL,reviewer_id TEXT,reason TEXT NOT NULL,reviewed_at TEXT NOT NULL,is_demo INTEGER NOT NULL DEFAULT 0);`,
  );
  return sql;
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
      `SELECT s.object_key,s.processing_state FROM scene_sources s WHERE s.id=? AND EXISTS(SELECT 1 FROM registry_listing_units u JOIN parking_spaces sp ON sp.id=u.space_id JOIN parking_levels lev ON lev.id=sp.level_id WHERE u.listing_id=s.listing_id AND lev.site_id=?)`,
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
    { action: "publish_level_plan" | "withdraw_level_plan" }
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
    sql
      .prepare(
        "UPDATE parking_level_plans SET state='withdrawn',version=version+1,reason=?,reviewer_id=?,reviewed_at=? WHERE level_id=?",
      )
      .run(c.reason, actor.id, new Date().toISOString(), c.levelId);
  } else {
    if (c.manifest.level !== Number(level.number)) throw invalid();
    const physical = sql
      .prepare(
        "SELECT id,dimensions FROM parking_spaces WHERE level_id=? ORDER BY id",
      )
      .all(c.levelId) as { id: string; dimensions: string }[];
    assertCommonFootprint(c.manifest, physical);
    if (
      c.evidenceIds.some((id) => !sourceReady(id, String(level.site_id))) ||
      c.manifest.provenance.geometryEvidenceIds?.some(
        (id) => !c.evidenceIds.includes(id),
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
        JSON.stringify(c.manifest),
        JSON.stringify(c.evidenceIds),
        c.version + 1,
        actor.id,
        c.reason,
        new Date().toISOString(),
      );
  }
  audit(actor.id, "registry." + c.action, c.levelId, c.reason);
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
