import { z } from "zod";
import type { Listing } from "./types";
const coordinate = z.number().finite().min(-250).max(250);
export const pointXZ = z.tuple([coordinate, coordinate]);
export function polygonArea(points: readonly (readonly [number, number])[]) {
  return Math.abs(
    points.reduce((sum, p, i) => {
      const next = points[(i + 1) % points.length];
      return sum + p[0] * next[1] - next[0] * p[1];
    }, 0) / 2,
  );
}
export function pointInPolygon(
  point: readonly [number, number],
  polygon: readonly (readonly [number, number])[],
) {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const a = polygon[i],
      b = polygon[j];
    const cross =
      (point[0] - a[0]) * (b[1] - a[1]) - (point[1] - a[1]) * (b[0] - a[0]);
    if (
      Math.abs(cross) < 1e-7 &&
      point[0] >= Math.min(a[0], b[0]) - 1e-7 &&
      point[0] <= Math.max(a[0], b[0]) + 1e-7 &&
      point[1] >= Math.min(a[1], b[1]) - 1e-7 &&
      point[1] <= Math.max(a[1], b[1]) + 1e-7
    )
      return true;
    if (
      a[1] > point[1] !== b[1] > point[1] &&
      point[0] < ((b[0] - a[0]) * (point[1] - a[1])) / (b[1] - a[1]) + a[0]
    )
      inside = !inside;
  }
  return inside;
}
function simplePolygon(points: readonly (readonly [number, number])[]) {
  const orient = (
    a: readonly number[],
    b: readonly number[],
    c: readonly number[],
  ) => (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
  for (let i = 0; i < points.length; i++) {
    const a = points[i],
      b = points[(i + 1) % points.length];
    if (Math.hypot(a[0] - b[0], a[1] - b[1]) < 0.01) return false;
    for (let j = i + 1; j < points.length; j++) {
      if (j === i + 1 || (i === 0 && j === points.length - 1)) continue;
      const c = points[j],
        d = points[(j + 1) % points.length];
      if (
        orient(a, b, c) * orient(a, b, d) < 0 &&
        orient(c, d, a) * orient(c, d, b) < 0
      )
        return false;
    }
  }
  return (
    new Set(points.map((p) => p.join(","))).size === points.length &&
    polygonArea(points) >= 0.05
  );
}
export const footprint = z
  .array(pointXZ)
  .min(3)
  .max(64)
  .refine(
    simplePolygon,
    "Le polygone doit être simple, non croisé et avoir une surface positive.",
  );
const dimensions = z
  .object({
    lengthM: z.number().positive().max(50).nullable(),
    widthM: z.number().positive().max(50).nullable(),
    clearanceM: z.number().positive().max(20).nullable(),
  })
  .strict();
export const sceneManifestSchema = z
  .object({
    schemaVersion: z.literal("1.0"),
    unit: z.literal("m"),
    upAxis: z.literal("Y"),
    level: z.number().int().min(-20).max(20),
    floor: z
      .object({
        footprintXZ: footprint,
        thicknessM: z.number().min(0.05).max(1),
      })
      .strict(),
    spaces: z
      .array(
        z
          .object({
            spaceId: z.string().uuid(),
            displayNumber: z.string().trim().min(1).max(30),
            footprintXZ: footprint,
            dimensions,
          })
          .strict(),
      )
      .min(1)
      .max(500),
    contextSpaces: z
      .array(z.object({ footprintXZ: footprint }).strict())
      .max(500),
    obstacles: z
      .array(
        z
          .object({
            kind: z.enum(["wall", "column", "ramp"]),
            footprintXZ: footprint,
            baseM: z.number().min(-5).max(15),
            heightM: z.number().positive().max(15),
            endHeightM: z.number().min(0).max(15).optional(),
          })
          .strict(),
      )
      .max(500),
    provenance: z
      .object({
        calibrated: z.boolean(),
        accuracyM: z.number().positive().max(0.5).nullable(),
        controlDistances: z
          .array(
            z
              .object({
                fromXZ: pointXZ,
                toXZ: pointXZ,
                measuredM: z.number().min(0.1).max(500),
              })
              .strict(),
          )
          .max(10),
        observedAt: z.string().datetime({ offset: true }),
        publicSummary: z.string().trim().min(10).max(400),
      })
      .strict(),
    observations: z
      .array(
        z
          .object({
            positionXZ: pointXZ,
            category: z.enum([
              "floor",
              "humidity",
              "lighting",
              "access",
              "obstacle",
              "other",
            ]),
            description: z.string().trim().min(3).max(500),
          })
          .strict(),
      )
      .max(100),
  })
  .strict()
  .superRefine((value, ctx) => {
    const crossesFloor = (points: [number, number][]) => {
      const o = (a: number[], b: number[], c: number[]) =>
        (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
      for (let i = 0; i < points.length; i++)
        for (let j = 0; j < value.floor.footprintXZ.length; j++) {
          const a = points[i],
            b = points[(i + 1) % points.length],
            c = value.floor.footprintXZ[j],
            d =
              value.floor.footprintXZ[(j + 1) % value.floor.footprintXZ.length];
          if (o(a, b, c) * o(a, b, d) < 0 && o(c, d, a) * o(c, d, b) < 0)
            return true;
        }
      return false;
    };
    const seen = new Set<string>();
    for (const [i, space] of value.spaces.entries()) {
      if (seen.has(space.spaceId))
        ctx.addIssue({
          code: "custom",
          path: ["spaces", i, "spaceId"],
          message: "Chaque place doit avoir une identité distincte.",
        });
      seen.add(space.spaceId);
    }
    for (const [kind, shapes] of [
      ["spaces", value.spaces],
      ["contextSpaces", value.contextSpaces],
      ["obstacles", value.obstacles],
    ] as const)
      for (const [i, shape] of shapes.entries())
        if (
          !shape.footprintXZ.every((point) =>
            pointInPolygon(point, value.floor.footprintXZ),
          ) ||
          crossesFloor(shape.footprintXZ)
        )
          ctx.addIssue({
            code: "custom",
            path: [kind, i, "footprintXZ"],
            message: "La géométrie dépasse le sol déclaré.",
          });
    for (const [i, observation] of value.observations.entries())
      if (!pointInPolygon(observation.positionXZ, value.floor.footprintXZ))
        ctx.addIssue({
          code: "custom",
          path: ["observations", i],
          message: "L’observation dépasse le sol déclaré.",
        });
    for (const [i, d] of value.provenance.controlDistances.entries())
      if (
        !pointInPolygon(d.fromXZ, value.floor.footprintXZ) ||
        !pointInPolygon(d.toXZ, value.floor.footprintXZ)
      )
        ctx.addIssue({
          code: "custom",
          path: ["provenance", "controlDistances", i],
          message: "Les mesures de contrôle dépassent le sol déclaré.",
        });
    if (new Date(value.provenance.observedAt).getTime() > Date.now() + 300000)
      ctx.addIssue({
        code: "custom",
        path: ["provenance", "observedAt"],
        message: "La date du relevé ne peut pas être future.",
      });
    if (value.provenance.calibrated) {
      if (
        value.provenance.accuracyM === null ||
        value.provenance.controlDistances.length < 2
      )
        ctx.addIssue({
          code: "custom",
          path: ["provenance"],
          message:
            "Un modèle calibré exige une précision et deux distances indépendantes.",
        });
      const controls = value.provenance.controlDistances;
      const keys = controls.map((d) =>
        [d.fromXZ.join(","), d.toXZ.join(",")].sort().join(":"),
      );
      if (new Set(keys).size !== keys.length)
        ctx.addIssue({
          code: "custom",
          path: ["provenance", "controlDistances"],
          message: "Les distances de contrôle doivent être distinctes.",
        });
      for (const [i, d] of controls.entries()) {
        if (
          Math.abs(
            Math.hypot(d.toXZ[0] - d.fromXZ[0], d.toXZ[1] - d.fromXZ[1]) -
              d.measuredM,
          ) > (value.provenance.accuracyM ?? 0)
        )
          ctx.addIssue({
            code: "custom",
            path: ["provenance", "controlDistances", i],
            message:
              "La distance du modèle ne correspond pas à la mesure de contrôle.",
          });
      }
    }
  });
export type SceneManifest = z.infer<typeof sceneManifestSchema>;
export const sceneSubmissionSchema = z
  .object({
    listingId: z.string().uuid(),
    manifest: sceneManifestSchema,
    evidenceIds: z.array(z.string().uuid()).min(1).max(20),
    rightsAttested: z.literal(true),
  })
  .strict();
export const sceneReviewSchema = z
  .object({
    version: z.number().int().positive(),
    decision: z.enum(["approve", "reject", "changes_requested"]),
    reason: z.string().trim().max(2000).optional(),
    checks: z
      .object({
        geometryMatchesSources: z.literal(true),
        numbersAndLevelChecked: z.literal(true),
        conditionMatchesPhotos: z.literal(true),
        locationConsentChecked: z.literal(true),
      })
      .strict()
      .optional(),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (value.decision === "approve" && !value.checks)
      ctx.addIssue({
        code: "custom",
        path: ["checks"],
        message: "Les quatre contrôles doivent être confirmés.",
      });
    if (value.decision !== "approve" && !value.reason)
      ctx.addIssue({
        code: "custom",
        path: ["reason"],
        message: "Indiquez le motif de la décision.",
      });
  });
export type SceneReview = z.infer<typeof sceneReviewSchema>;
export interface PublicScene {
  id: string;
  listingId: string;
  version: number;
  fidelity: "measured";
  reviewedAt: string;
  manifest: Omit<SceneManifest, "spaces" | "provenance"> & {
    spaces: Array<
      Omit<SceneManifest["spaces"][number], "spaceId"> & { id: string }
    >;
    provenance: {
      calibrated: true;
      accuracyM: number;
      controlDistancesCount: number;
      observedAt: string;
      publicSummary: string;
    };
  };
}
export function assertSceneMapping(
  manifest: SceneManifest,
  listing: Listing,
  forApproval = false,
) {
  if (forApproval && listing.locationPrecision !== "exact_opt_in")
    throw new Error(
      "La localisation exacte doit être consentie dans l’annonce publiée.",
    );
  const declared = listing.spaces.filter(
    (space) => space.level === manifest.level,
  );
  if (!declared.length || declared.length !== manifest.spaces.length)
    throw new Error(
      "Toutes les places annoncées de ce niveau doivent être représentées.",
    );
  for (const space of manifest.spaces) {
    const reference = declared.find((unit) => unit.id === space.spaceId);
    if (!reference || reference.number !== space.displayNumber)
      throw new Error("Identité, numéro ou niveau de place incohérent.");
    for (const key of ["lengthM", "widthM", "clearanceM"] as const)
      if (
        reference[key] !== null &&
        (space.dimensions[key] === null ||
          Math.abs(reference[key]! - space.dimensions[key]!) >
            (manifest.provenance.accuracyM ?? 0.05))
      )
        throw new Error(
          "Les dimensions ne correspondent pas à celles de l’annonce.",
        );
  }
  if (
    forApproval &&
    (!manifest.provenance.calibrated ||
      manifest.provenance.controlDistances.length < 2 ||
      manifest.provenance.accuracyM === null)
  )
    throw new Error(
      "Deux distances indépendantes et une échelle calibrée sont requises.",
    );
}
export function publicSceneProjection(
  input: {
    id: string;
    listingId: string;
    version: number;
    reviewedAt: string;
    manifest: SceneManifest;
  },
  listing: Listing,
): PublicScene {
  assertSceneMapping(input.manifest, listing, true);
  const { provenance, ...geometry } = input.manifest;
  return {
    id: input.id,
    listingId: input.listingId,
    version: input.version,
    reviewedAt: input.reviewedAt,
    fidelity: "measured",
    manifest: {
      ...geometry,
      spaces: input.manifest.spaces.map((space) => {
        const { spaceId, ...publicSpace } = space;
        return {
          ...publicSpace,
          id: `${listing.id}:unit:${listing.spaces.findIndex((unit) => unit.id === spaceId) + 1}`,
        };
      }),
      provenance: {
        calibrated: true,
        accuracyM: provenance.accuracyM!,
        controlDistancesCount: provenance.controlDistances.length,
        observedAt: provenance.observedAt,
        publicSummary: provenance.publicSummary,
      },
    },
  };
}
export function exampleSceneManifest(listing: Listing): SceneManifest {
  const units = listing.spaces.filter(
    (space) => space.level === (listing.spaces[0]?.level ?? -1),
  );
  const width = Math.max(10, units.length * 3 + 2);
  return {
    schemaVersion: "1.0",
    unit: "m",
    upAxis: "Y",
    level: listing.spaces[0]?.level ?? -1,
    floor: {
      footprintXZ: [
        [0, 0],
        [width, 0],
        [width, 10],
        [0, 10],
      ],
      thicknessM: 0.2,
    },
    spaces: units.map((unit, i) => ({
      spaceId: unit.id,
      displayNumber: unit.number,
      footprintXZ: [
        [1 + i * 3, 1],
        [3.4 + i * 3, 1],
        [3.4 + i * 3, 6],
        [1 + i * 3, 6],
      ],
      dimensions: {
        lengthM: unit.lengthM,
        widthM: unit.widthM,
        clearanceM: unit.clearanceM,
      },
    })),
    contextSpaces: [],
    obstacles: [],
    provenance: {
      calibrated: false,
      accuracyM: null,
      controlDistances: [],
      observedAt: new Date().toISOString(),
      publicSummary:
        "Gabarit fictif à remplacer intégralement par les relevés du parking.",
    },
    observations: [],
  };
}
