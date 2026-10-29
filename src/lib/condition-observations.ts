import { z } from "zod";
import type { ConditionCategory, ConditionObservation, Listing } from "./types";

export const conditionLabels: Record<ConditionCategory, string> = {
  floor: "Sol",
  walls_ceiling: "Murs et plafond",
  humidity: "Humidité",
  lighting: "Éclairage",
  markings_cleanliness: "Marquage et propreté",
  maneuver: "Manœuvres",
  clearance_access: "Hauteur et accès",
  security: "Fermeture et sécurité",
  space: "Particularités de la place",
};
export const conditionSourceLabels: Record<
  ConditionObservation["sourceKind"],
  string
> = {
  seller_declared: "Déclaration du vendeur",
  photo_documented: "Photos jointes par le vendeur",
  measured: "Mesure déclarée par le vendeur",
  plan_derived: "Lecture d’un plan fourni par le vendeur",
};
export const conditionObservationInputSchema = z
  .object({
    id: z.string().uuid(),
    spaceId: z.string().uuid().nullable(),
    category: z.enum(
      Object.keys(conditionLabels) as [
        ConditionCategory,
        ...ConditionCategory[],
      ],
    ),
    value: z.string().trim().max(1000),
    comment: z.string().trim().max(2000).default(""),
    sourceKind: z.enum([
      "seller_declared",
      "photo_documented",
      "measured",
      "plan_derived",
    ]),
    observedAt: z
      .string()
      .datetime({ offset: true })
      .refine(
        (v) => Date.parse(v) <= Date.now() + 300000,
        "La date ne peut pas être future.",
      )
      .nullable(),
    evidenceMediaIds: z.array(z.string().uuid()).max(12),
    sourceDocumentIds: z.array(z.string().uuid()).max(10).optional(),
  })
  .strict();
export const conditionObservationsInputSchema = z
  .array(conditionObservationInputSchema)
  .max(4509);
export type ConditionObservationInput = z.infer<
  typeof conditionObservationInputSchema
>;

/** Only editable fields leave the form; server attribution cannot be supplied by a browser. */
export function editableConditions(
  values: ConditionObservation[] = [],
): ConditionObservationInput[] {
  return values.map(
    ({
      id,
      spaceId,
      category,
      value,
      comment,
      sourceKind,
      observedAt,
      evidenceMediaIds,
      sourceDocumentIds,
    }) => ({
      id,
      spaceId,
      category,
      value,
      comment,
      sourceKind,
      observedAt,
      evidenceMediaIds,
      ...(sourceDocumentIds ? { sourceDocumentIds } : {}),
    }),
  );
}
/** References are already permission-checked by the caller; scope is checked again here. */
export function attributeConditions(
  inputs: ConditionObservationInput[],
  listing: Pick<
    Listing,
    "spaces" | "photos" | "spacePhotos" | "conditionObservations"
  >,
  actorId: string,
  permittedDocumentIds: Set<string>,
  requireEvidence = false,
): ConditionObservation[] {
  const parsed = conditionObservationsInputSchema.parse(inputs);
  const spaces = new Set(listing.spaces.map((s) => s.id));
  const allPhotos = new Set([
    ...listing.photos,
    ...Object.values(listing.spacePhotos || {}).flat(),
  ]);
  const ids = new Set<string>(),
    categories = new Set<string>();
  return parsed.map((input) => {
    const scopeKey = `${input.spaceId || "common"}:${input.category}`;
    if (ids.has(input.id) || categories.has(scopeKey))
      throw new Error(
        "Une seule observation par rubrique et périmètre est autorisée.",
      );
    ids.add(input.id);
    categories.add(scopeKey);
    if (input.spaceId && !spaces.has(input.spaceId))
      throw new Error(
        "L’observation concerne une place étrangère à l’annonce.",
      );
    const photos = input.spaceId
      ? new Set(listing.spacePhotos?.[input.spaceId] || [])
      : allPhotos;
    if (input.evidenceMediaIds.some((id) => !photos.has(`/api/media/${id}`)))
      throw new Error(
        "Reliez d’abord chaque photo au périmètre concerné de cette annonce.",
      );
    if (input.sourceDocumentIds?.some((id) => !permittedDocumentIds.has(id)))
      throw new Error(
        "Le document doit appartenir à cette annonce et à son vendeur.",
      );
    if (
      requireEvidence &&
      input.value &&
      input.sourceKind === "photo_documented" &&
      !input.evidenceMediaIds.length
    )
      throw new Error("Choisissez au moins une photo pour cette observation.");
    if (
      requireEvidence &&
      input.value &&
      input.sourceKind === "plan_derived" &&
      !input.sourceDocumentIds?.length
    )
      throw new Error(
        "Choisissez le plan privé utilisé pour cette observation.",
      );
    const previous = listing.conditionObservations?.find(
      (v) => v.id === input.id,
    );
    const unchanged =
      previous &&
      JSON.stringify(editableConditions([previous])[0]) ===
        JSON.stringify(input);
    return {
      ...input,
      observerId: unchanged ? previous.observerId || actorId : actorId,
      confidenceScope: input.spaceId ? "unit_declared" : "common_declared",
    };
  });
}
/** Public DTO keeps only approved linked photos and aliases, never authors or private plans. */
export function publicConditions(
  listing: Pick<
    Listing,
    "id" | "spaces" | "photos" | "spacePhotos" | "conditionObservations"
  >,
): ConditionObservation[] {
  const aliases = new Map(
    listing.spaces.map((s, i) => [s.id, `${listing.id}:unit:${i + 1}`]),
  );
  const photos = new Set([
    ...listing.photos,
    ...Object.values(listing.spacePhotos || {}).flat(),
  ]);
  return (listing.conditionObservations || [])
    .filter((v) => !v.spaceId || aliases.has(v.spaceId))
    .map((v, i) => ({
      id: `${listing.id}:observation:${i + 1}`,
      spaceId: v.spaceId ? aliases.get(v.spaceId)! : null,
      category: v.category,
      value: v.value,
      comment: v.comment,
      sourceKind: v.sourceKind,
      observedAt: v.observedAt,
      evidenceMediaIds: v.evidenceMediaIds.filter((id) =>
        photos.has(`/api/media/${id}`),
      ),
      confidenceScope: v.spaceId ? "unit_declared" : "common_declared",
    }));
}
