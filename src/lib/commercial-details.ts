import { z } from "zod";
import type {
  CommercialDetails,
  FinancialSource,
  Listing,
  UnitDetails,
} from "./types";
const date = z
  .string()
  .datetime({ offset: true })
  .refine(
    (v) => Date.parse(v) <= Date.now() + 300000,
    "La date ne peut pas être future.",
  )
  .nullable();
const documents = z.array(z.string().uuid()).max(10);
const source = z.enum(["unknown", "seller_declared", "provided_document"]);
const financialSourceSchema = z
  .object({
    year: z
      .number()
      .int()
      .min(1900)
      .max(new Date().getUTCFullYear() + 1)
      .nullable(),
    scope: z.string().trim().max(300),
    sourceKind: source,
    sourceDocumentIds: documents,
  })
  .strict();
export const unitDetailsSchema = z
  .object({
    type: z.enum(["covered", "box", "outdoor"]).optional(),
    levelLabel: z.string().trim().max(40),
    privateLotReference: z.string().trim().max(40).optional(),
    dimensionSource: z.enum([
      "unknown",
      "seller_declared",
      "measured",
      "plan_derived",
    ]),
    dimensionObservedAt: date,
    sourceDocumentIds: documents.optional(),
    limitingPoint: z.string().trim().max(500),
  })
  .strict();
export const commercialDetailsSchema = z
  .object({
    postalCode: z.string().trim().max(16),
    units: z.record(z.string().uuid(), unitDetailsSchema),
    access: z
      .object({
        gate: z.enum(["unknown", "present", "absent"]),
        door: z.enum(["unknown", "present", "absent"]),
        badge: z.enum(["unknown", "present", "absent"]),
        key: z.enum(["unknown", "present", "absent"]),
        lift: z.enum(["unknown", "present", "absent"]),
      })
      .strict(),
    chargesSource: financialSourceSchema,
    taxSource: financialSourceSchema,
    rentalIncome: z
      .object({
        amountCents: z.number().int().min(0).max(100000000).nullable(),
        period: z.enum(["month", "year"]),
        observedAt: date,
        sourceKind: source,
        sourceDocumentIds: documents,
      })
      .strict()
      .nullable(),
    photoMetadata: z.record(
      z.string().uuid(),
      z.object({ caption: z.string().trim().max(300), takenAt: date }).strict(),
    ),
  })
  .strict();
export function emptyFinancialSource(): FinancialSource {
  return {
    year: null,
    scope: "",
    sourceKind: "unknown",
    sourceDocumentIds: [],
  };
}
export function emptyUnitDetails(): UnitDetails {
  return {
    levelLabel: "",
    privateLotReference: "",
    dimensionSource: "unknown",
    dimensionObservedAt: null,
    sourceDocumentIds: [],
    limitingPoint: "",
  };
}
export function emptyCommercialDetails(): CommercialDetails {
  return {
    postalCode: "",
    units: {},
    access: {
      gate: "unknown",
      door: "unknown",
      badge: "unknown",
      key: "unknown",
      lift: "unknown",
    },
    chargesSource: emptyFinancialSource(),
    taxSource: emptyFinancialSource(),
    rentalIncome: null,
    photoMetadata: {},
  };
}
export function validateCommercialDetails(
  details: CommercialDetails,
  listing: Pick<Listing, "type" | "spaces" | "photos" | "spacePhotos">,
  documentIds: Set<string>,
  submitting = false,
) {
  commercialDetailsSchema.parse(details);
  const spaces = new Set(listing.spaces.map((s) => s.id)),
    photos = new Set([
      ...listing.photos,
      ...Object.values(listing.spacePhotos || {}).flat(),
    ]);
  for (const [id, unit] of Object.entries(details.units)) {
    if (!spaces.has(id))
      throw new Error(
        "Les références doivent concerner une place de cette annonce.",
      );
    if (unit.sourceDocumentIds?.some((id) => !documentIds.has(id)))
      throw new Error(
        "La source des dimensions doit être un document privé de cette annonce.",
      );
    if (
      submitting &&
      unit.dimensionSource === "plan_derived" &&
      !unit.sourceDocumentIds?.length
    )
      throw new Error("Reliez le plan utilisé pour les dimensions.");
  }
  for (const metadata of [
    details.chargesSource,
    details.taxSource,
    details.rentalIncome,
  ].filter((v) => v !== null)) {
    if (metadata.sourceDocumentIds.some((id) => !documentIds.has(id)))
      throw new Error("La source financière doit appartenir à cette annonce.");
    if (
      submitting &&
      metadata.sourceKind === "provided_document" &&
      !metadata.sourceDocumentIds.length
    )
      throw new Error("Reliez le document financier utilisé.");
  }
  if (
    Object.keys(details.photoMetadata).some(
      (id) => !photos.has(`/api/media/${id}`),
    )
  )
    throw new Error("La légende doit concerner une photo de cette annonce.");
  if (
    submitting &&
    listing.type === "mixed" &&
    (listing.spaces.length < 2 ||
      listing.spaces.some((s) => !details.units[s.id]?.type))
  )
    throw new Error(
      "Précisez le type de chaque place du lot mixte (au moins deux places).",
    );
  for (const space of listing.spaces)
    for (const key of ["lengthM", "widthM", "clearanceM"] as const) {
      const value = space[key];
      if (
        value !== null &&
        Math.abs(value * 1000 - Math.round(value * 1000)) > 1e-6
      )
        throw new Error(
          "Les dimensions doivent être précises au millimètre au maximum.",
        );
    }
}
/** Private lot references and source documents never leave the private revision. */
export function publicCommercialDetails(
  listing: Pick<
    Listing,
    "id" | "spaces" | "photos" | "spacePhotos" | "commercialDetails"
  >,
): CommercialDetails | undefined {
  const value = listing.commercialDetails;
  if (!value) return undefined;
  const financial = (v: FinancialSource): FinancialSource => ({
    year: v.year,
    scope: v.scope,
    sourceKind: v.sourceKind,
    sourceDocumentIds: [],
  });
  const photos = new Set([
    ...listing.photos,
    ...Object.values(listing.spacePhotos || {}).flat(),
  ]);
  return {
    postalCode: value.postalCode,
    units: Object.fromEntries(
      listing.spaces.flatMap((space, i) => {
        const unit = value.units[space.id];
        if (!unit) return [];
        return [
          [
            `${listing.id}:unit:${i + 1}`,
            {
              type: unit.type,
              levelLabel: unit.levelLabel,
              dimensionSource: unit.dimensionSource,
              dimensionObservedAt: unit.dimensionObservedAt,
              limitingPoint: unit.limitingPoint,
            },
          ],
        ];
      }),
    ),
    access: {
      gate: value.access.gate,
      door: value.access.door,
      badge: value.access.badge,
      key: value.access.key,
      lift: value.access.lift,
    },
    chargesSource: financial(value.chargesSource),
    taxSource: financial(value.taxSource),
    rentalIncome: value.rentalIncome
      ? {
          amountCents: value.rentalIncome.amountCents,
          period: value.rentalIncome.period,
          observedAt: value.rentalIncome.observedAt,
          sourceKind: value.rentalIncome.sourceKind,
          sourceDocumentIds: [],
        }
      : null,
    photoMetadata: Object.fromEntries(
      Object.entries(value.photoMetadata)
        .filter(([id]) => photos.has(`/api/media/${id}`))
        .map(([id, metadata]) => [
          id,
          { caption: metadata.caption, takenAt: metadata.takenAt },
        ]),
    ),
  };
}
