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
    schemaVersion: z.enum(["1.0", "gp-parametric-1.1"]),
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
            source: z
              .enum(["unknown", "schematic", "plan_derived", "measured"])
              .optional(),
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
        geometrySource: z
          .enum(["unknown", "plan_derived", "measured"])
          .optional(),
        geometryEvidenceIds: z
          .array(z.string().uuid())
          .max(20)
          .refine((ids) => new Set(ids).size === ids.length)
          .optional(),
      })
      .strict(),
    observations: z
      .array(
        z
          .object({
            id: z.string().uuid().optional(),
            spaceId: z.string().uuid().optional(),
            source: z
              .enum([
                "unknown",
                "seller_observation",
                "photo_documented",
                "provided_document",
                "measured",
              ])
              .optional(),
            observedAt: z
              .string()
              .datetime({ offset: true })
              .nullable()
              .optional(),
            evidenceIds: z
              .array(z.string().uuid())
              .max(20)
              .refine((ids) => new Set(ids).size === ids.length)
              .optional(),
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
    const observationIds = value.observations.flatMap((note) =>
      note.id ? [note.id] : [],
    );
    if (new Set(observationIds).size !== observationIds.length)
      ctx.addIssue({
        code: "custom",
        path: ["observations"],
        message: "Les observations doivent avoir des identifiants distincts.",
      });
    value.observations.forEach((note, index) => {
      if (note.spaceId && !seen.has(note.spaceId))
        ctx.addIssue({
          code: "custom",
          path: ["observations", index, "spaceId"],
          message: "L’observation doit concerner une place du niveau.",
        });
      if (note.observedAt && Date.parse(note.observedAt) > Date.now() + 300000)
        ctx.addIssue({
          code: "custom",
          path: ["observations", index, "observedAt"],
          message: "La date ne peut pas être future.",
        });
      if (
        ["photo_documented", "provided_document"].includes(note.source || "") &&
        (!note.id || !note.observedAt || !note.evidenceIds?.length)
      )
        ctx.addIssue({
          code: "custom",
          path: ["observations", index],
          message:
            "Une observation documentée exige identité, date et preuves privées.",
        });
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
  .strict()
  .superRefine((value, ctx) => {
    const proofIds = [
      ...(value.manifest.provenance.geometryEvidenceIds || []),
      ...value.manifest.observations.flatMap((note) => note.evidenceIds || []),
    ];
    if (proofIds.some((id) => !value.evidenceIds.includes(id)))
      ctx.addIssue({
        code: "custom",
        path: ["manifest"],
        message:
          "Toute preuve doit appartenir aux sources privées jointes à cette scène.",
      });
  });
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
        observationEvidenceChecked: z.boolean().optional(),
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
  fidelity: "measured" | "reviewed";
  runtimeContract?: "gp-parametric-level/1.1";
  manifestHash?: string;
  hashAlgorithm?: string;
  isDemo?: boolean;
  documentation?: {
    geometrySource: string;
    reviewedUnitIds: string[];
    reviewedObservationIds?: string[];
    scope?: string;
    observationEvidenceChecked: boolean;
  };
  reviewedAt: string;
  manifest: Omit<SceneManifest, "spaces" | "provenance" | "observations"> & {
    observations: Array<
      Omit<
        SceneManifest["observations"][number],
        "id" | "spaceId" | "evidenceIds"
      > & { id?: string; spaceId?: string; evidenceCount?: number }
    >;
    spaces: Array<
      Omit<SceneManifest["spaces"][number], "spaceId"> & { id: string }
    >;
    provenance: {
      calibrated: true;
      accuracyM: number;
      controlDistancesCount: number;
      observedAt: string;
      publicSummary: string;
      geometrySource?: string;
      geometryEvidenceCount?: number;
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
    (space) => space.levelKnown !== false && space.level === manifest.level,
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
    observationEvidenceChecked?: boolean;
  },
  listing: Listing,
): PublicScene {
  assertSceneMapping(input.manifest, listing, true);
  const { provenance, ...geometry } = input.manifest;
  const reviewedNotes = input.observationEvidenceChecked
    ? input.manifest.observations.flatMap((note, index) =>
        note.id &&
        note.observedAt &&
        note.evidenceIds?.length &&
        ["photo_documented", "provided_document", "measured"].includes(
          note.source || "",
        )
          ? [{ note, index }]
          : [],
      )
    : [];
  const reviewedUnits = [
    ...new Set(
      reviewedNotes.flatMap(({ note }) =>
        note.spaceId
          ? [
              `${listing.id}:unit:${listing.spaces.findIndex((unit) => unit.id === note.spaceId) + 1}`,
            ]
          : [],
      ),
    ),
  ];
  return {
    id: input.id,
    listingId: input.listingId,
    version: input.version,
    reviewedAt: input.reviewedAt,
    fidelity:
      reviewedNotes.length &&
      provenance.geometryEvidenceIds?.length &&
      ["plan_derived", "measured"].includes(provenance.geometrySource || "")
        ? "reviewed"
        : "measured",
    runtimeContract: "gp-parametric-level/1.1",
    isDemo: listing.isDemo,
    documentation: {
      geometrySource: provenance.geometrySource || "unknown",
      reviewedUnitIds: reviewedUnits,
      reviewedObservationIds: reviewedNotes.map(
        ({ index }) => `${input.id}:observation:${index + 1}`,
      ),
      scope: "geometry_and_listed_observations_only",
      observationEvidenceChecked: !!input.observationEvidenceChecked,
    },
    manifest: {
      ...geometry,
      schemaVersion: "gp-parametric-1.1",
      observations: input.manifest.observations.map((note, index) => {
        const { id: privateId, spaceId, evidenceIds, ...safe } = note;
        void privateId;
        return {
          ...safe,
          id: `${input.id}:observation:${index + 1}`,
          source: note.source || "unknown",
          observedAt: note.observedAt || null,
          evidenceCount: evidenceIds?.length || 0,
          ...(spaceId
            ? {
                spaceId: `${listing.id}:unit:${listing.spaces.findIndex((unit) => unit.id === spaceId) + 1}`,
              }
            : {}),
        };
      }),
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
        geometrySource: provenance.geometrySource || "unknown",
        geometryEvidenceCount: provenance.geometryEvidenceIds?.length || 0,
      },
    },
  };
}
export function exampleSceneManifest(listing: Listing): SceneManifest {
  if (listing.spaces.some((space) => space.levelKnown === false))
    throw new Error("Précisez les niveaux avant de préparer un plan.");
  const units = listing.spaces.filter(
    (space) => space.level === (listing.spaces[0]?.level ?? -1),
  );
  const width = Math.max(10, units.length * 3 + 2);
  return {
    schemaVersion: "gp-parametric-1.1",
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

/** Dedicated runtime contract: this is not parking-level.schema.json 1.0. */
const publicObservationSchema = z
  .object({
    id: z.string().max(120).optional(),
    spaceId: z.string().max(100).optional(),
    positionXZ: pointXZ,
    category: z.enum([
      "floor",
      "humidity",
      "lighting",
      "access",
      "obstacle",
      "other",
    ]),
    description: z.string().min(3).max(500),
    source: z
      .enum([
        "unknown",
        "seller_observation",
        "photo_documented",
        "provided_document",
        "measured",
      ])
      .optional(),
    observedAt: z.string().datetime({ offset: true }).nullable().optional(),
    evidenceCount: z.number().int().min(0).max(20).optional(),
  })
  .strict();
export const publicSceneSchema = z
  .object({
    id: z.string().uuid(),
    listingId: z.string().uuid(),
    version: z.number().int().positive(),
    fidelity: z.enum(["measured", "reviewed"]),
    reviewedAt: z.string().datetime({ offset: true }),
    runtimeContract: z.literal("gp-parametric-level/1.1").optional(),
    manifestHash: z
      .string()
      .regex(/^[a-f0-9]{64}$/)
      .optional(),
    hashAlgorithm: z.literal("sha256:gp-json-sort-v1").optional(),
    isDemo: z.boolean().optional(),
    documentation: z
      .object({
        geometrySource: z.string().max(30),
        reviewedUnitIds: z.array(z.string().max(100)).max(500),
        reviewedObservationIds: z
          .array(z.string().max(120))
          .max(100)
          .optional(),
        scope: z.literal("geometry_and_listed_observations_only").optional(),
        observationEvidenceChecked: z.boolean(),
      })
      .strict()
      .optional(),
    manifest: z
      .object({
        schemaVersion: z.enum(["1.0", "gp-parametric-1.1"]),
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
                id: z.string().max(100),
                displayNumber: z.string().min(1).max(30),
                footprintXZ: footprint,
                dimensions,
                source: z
                  .enum(["unknown", "schematic", "plan_derived", "measured"])
                  .optional(),
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
            calibrated: z.literal(true),
            accuracyM: z.number().positive().max(0.5),
            controlDistancesCount: z.number().int().min(2).max(10),
            observedAt: z.string().datetime({ offset: true }),
            publicSummary: z.string().min(10).max(400),
            geometrySource: z.string().max(30).optional(),
            geometryEvidenceCount: z.number().int().min(0).max(20).optional(),
          })
          .strict(),
        observations: z.array(publicObservationSchema).max(100),
      })
      .strict(),
  })
  .strict();
export function parsePublicScene(value: unknown): PublicScene | null {
  const result = publicSceneSchema.safeParse(value);
  if (!result.success) return null;
  const scene = result.data;
  if (
    scene.manifest.spaces.some(
      (space) => !space.id.startsWith(scene.listingId + ":unit:"),
    )
  )
    return null;
  return scene;
}
