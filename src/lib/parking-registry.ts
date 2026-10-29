import { z } from "zod";
import type { Listing, Space } from "./types";
import { sceneManifestSchema, type PublicScene } from "./scene-contract";
const uuid = z.string().uuid(),
  text = z.string().trim();
const dimension = (max: number) =>
  z.number().positive().max(max).nullable().default(null);
const planChecks = z
  .object({
    coordinateFrameConfirmed: z.literal(true),
    mappingChecked: z.literal(true),
    sourcesChecked: z.literal(true),
  })
  .strict();
export const registryCommandSchema = z.discriminatedUnion("action", [
  z
    .object({
      action: z.literal("restore_level_plan"),
      levelId: uuid,
      version: z.number().int().positive().max(2147483646),
      sourceVersion: z.number().int().positive().max(2147483646),
      rightsAttested: z.literal(true),
      checks: planChecks,
      reason: text.min(15).max(2000),
    })
    .strict(),
  z
    .object({
      action: z.literal("publish_level_plan"),
      levelId: uuid,
      version: z.number().int().min(0),
      manifest: sceneManifestSchema.refine(
        (m) =>
          m.provenance.calibrated &&
          ["plan_derived", "measured"].includes(
            m.provenance.geometrySource || "",
          ) &&
          !!m.provenance.geometryEvidenceIds?.length &&
          m.observations.length === 0,
        "Un plan commun exige un repère calibré et des sources géométriques ; les observations restent propres aux annonces.",
      ),
      evidenceIds: z
        .array(uuid)
        .min(1)
        .max(20)
        .refine((ids) => new Set(ids).size === ids.length),
      rightsAttested: z.literal(true),
      checks: planChecks,
      reason: text.min(15).max(2000),
    })
    .strict(),
  z
    .object({
      action: z.literal("withdraw_level_plan"),
      levelId: uuid,
      version: z.number().int().positive(),
      reason: text.min(15).max(2000),
    })
    .strict(),
  z
    .object({
      action: z.literal("create_site"),
      publicName: text.min(2).max(100),
      internalReference: text.min(1).max(100),
      exactAddress: text.max(250).optional(),
      coordinates: z
        .tuple([z.number().min(-180).max(180), z.number().min(-90).max(90)])
        .optional(),
    })
    .strict(),
  z
    .object({
      action: z.literal("add_level"),
      siteId: uuid,
      code: text.min(1).max(30),
      label: text.max(100),
      number: z.number().int().min(-20).max(50),
      sortOrder: z.number().int().min(-100).max(100).default(0),
    })
    .strict(),
  z
    .object({
      action: z.literal("add_space"),
      levelId: uuid,
      number: text.max(40).default(""),
      privateLotReference: text.max(80).default(""),
      areaM2: dimension(500),
      lengthM: dimension(50),
      widthM: dimension(50),
      clearanceM: dimension(20),
    })
    .strict(),
  z
    .object({
      action: z.literal("set_contributor"),
      siteId: uuid,
      userId: uuid,
      scope: z.literal("common_reference").nullable(),
    })
    .strict(),
  z
    .object({
      action: z.literal("link_listing"),
      listingId: uuid,
      version: z.number().int().positive(),
      siteId: uuid,
      units: z
        .array(z.object({ unitId: uuid, spaceId: uuid }).strict())
        .min(1)
        .max(500),
      reason: text.min(15).max(2000),
    })
    .strict(),
]);
export type RegistryCommand = z.infer<typeof registryCommandSchema>;
export const levelPlanHistoryQuerySchema = z
  .object({
    levelId: uuid,
    beforeVersion: z.number().int().positive().max(2147483647).optional(),
  })
  .strict();
export interface RegistryLevelPlanRevisionSummary {
  version: number;
  state: "published" | "withdrawn";
  action:
    | "publish_level_plan"
    | "withdraw_level_plan"
    | "restore_level_plan"
    | "legacy_snapshot";
  reason: string;
  createdAt: string;
  spaceCount: number;
  evidenceCount: number;
  restoredFromVersion?: number;
  isDemo: boolean;
}
export interface RegistryLevelPlanHistory {
  levelId: string;
  currentVersion: number;
  items: RegistryLevelPlanRevisionSummary[];
  hasMore: boolean;
  nextBeforeVersion?: number;
}
export interface RegistrySpace {
  id: string;
  publicAlias: string;
  number: string;
  privateLotReference?: string;
  areaM2: number | null;
  lengthM: number | null;
  widthM: number | null;
  clearanceM: number | null;
}
export interface RegistryLevel {
  id: string;
  publicAlias: string;
  code: string;
  label: string;
  number: number;
  sortOrder: number;
  spaces: RegistrySpace[];
  planVersion?: number;
  planState?: "published" | "withdrawn";
}
export interface RegistrySite {
  id: string;
  publicAlias: string;
  publicName: string;
  internalReference: string;
  exactAddress?: string;
  coordinates?: [number, number];
  levels: RegistryLevel[];
  contributors: { userId: string; scope: "common_reference" }[];
}
export interface RegistryLink {
  listingId: string;
  unitId: string;
  spaceId: string;
  siteId: string;
}
export interface RegistryConflict {
  id: string;
  listingId: string;
  status: "open" | "resolved";
  createdAt: string;
}
export interface RegistryAdminData {
  sites: RegistrySite[];
  links: RegistryLink[];
  conflicts: RegistryConflict[];
}
export interface ContributorSite {
  id: string;
  publicName: string;
  scope: "common_reference";
  levels: Omit<RegistryLevel, "publicAlias" | "spaces">[];
}
export interface PublicParking {
  id: string;
  publicName: string;
  levels: {
    id: string;
    code: string;
    label: string;
    number: number;
    spaces: {
      id: string;
      number: string;
      listingId: string;
      listingUnitId: string;
    }[];
    scenes: { listingId: string; level: number; sceneAvailable: boolean }[];
    commonPlan?: PublicParkingLevelPlan | null;
  }[];
  listings: Listing[];
}
/** One explicitly reviewed coordinate frame. Individual listing scenes are never merged. */
export interface PublicParkingLevelPlan {
  id: string;
  parkingId: string;
  version: number;
  fidelity: "measured" | "schematic";
  reviewedAt: string;
  isDemo: boolean;
  manifest: PublicScene["manifest"];
}
export interface PublicParkingSceneGroup {
  parkingId: string;
  name: string;
  listings: Listing[];
  levels: {
    id: string;
    level: number;
    label: string;
    spaces: {
      id: string;
      listingId: string;
      listingUnitId: string;
      space: Space;
    }[];
    scene: PublicParkingLevelPlan | null;
  }[];
}
export function parkingSceneGroup(
  parking: PublicParking,
): PublicParkingSceneGroup {
  return {
    parkingId: parking.id,
    name: parking.publicName,
    listings: parking.listings,
    levels: parking.levels.map((level) => ({
      id: level.id,
      level: level.number,
      label: level.label || level.code || `Niveau ${level.number}`,
      spaces: level.spaces.flatMap((ref) => {
        const unit = parking.listings
          .find((l) => l.id === ref.listingId)
          ?.spaces.find((s) => s.id === ref.listingUnitId);
        return unit ? [{ ...ref, space: { ...unit, id: ref.id } }] : [];
      }),
      scene: level.commonPlan ?? null,
    })),
  };
}
export interface RegistryMutationResult {
  status: "saved" | "conflict";
  id?: string;
  listingId?: string;
  version?: number;
  message?: string;
}
