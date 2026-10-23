import type { Listing } from "./types";
import { availableOffers } from "./listing-price";
export interface ListingIssue {
  step: number;
  field: string;
  message: string;
}
/** Form guidance only. Ownership, evidence permissions and publication remain server checks. */
export function listingIssues(value: Listing): ListingIssue[] {
  const issues: ListingIssue[] = [];
  const add = (step: number, field: string, message: string) =>
    issues.push({ step, field, message });
  if (!value.city.trim()) add(1, "parking-city", "Indiquez la ville.");
  if (!value.district.trim())
    add(1, "parking-district", "Indiquez le quartier.");
  if (!value.locationConfirmedAt)
    add(
      1,
      "location-confirmed",
      "Confirmez le point public après l’enregistrement de la localisation.",
    );
  if (!value.spaces.length)
    add(2, "listing-units", "Ajoutez au moins une place.");
  if (value.pricingMode === "per_space") {
    if (
      value.spaces.some(
        (s) =>
          !s.offer ||
          !Number.isSafeInteger(s.offer.priceCents) ||
          s.offer.priceCents <= 0 ||
          s.offer.priceCents > 10000000000 ||
          !["sale", "rent"].includes(s.offer.transactionType) ||
          !["available", "reserved", "sold", "rented", "withdrawn"].includes(
            s.offer.status,
          ) ||
          (s.offer.status === "sold" && s.offer.transactionType !== "sale") ||
          (s.offer.status === "rented" && s.offer.transactionType !== "rent"),
      )
    )
      add(
        2,
        "listing-units",
        "Complétez pour chaque place sa vente ou location, son prix positif et son statut cohérent.",
      );
    if (!availableOffers(value).length)
      add(
        2,
        "listing-units",
        "Conservez au moins une place disponible pour publier.",
      );
  }
  if (
    value.type === "mixed" &&
    (value.spaces.length < 2 ||
      value.spaces.some((s) => !value.commercialDetails?.units[s.id]?.type))
  )
    add(
      2,
      "listing-units",
      "Un lot mixte doit contenir au moins deux places, avec le type de chaque unité.",
    );
  const missingPlans = value.spaces.filter((s) => {
    const details = value.commercialDetails?.units[s.id];
    return (
      details?.dimensionSource === "plan_derived" &&
      !details.sourceDocumentIds?.length
    );
  }).length;
  if (missingPlans)
    add(
      2,
      "listing-unit-details",
      `Reliez le plan utilisé pour les dimensions de ${missingPlans} place(s).`,
    );
  const missingEvidence = (value.conditionObservations || []).filter(
    (o) =>
      o.value.trim() &&
      ((o.sourceKind === "photo_documented" && !o.evidenceMediaIds.length) ||
        (o.sourceKind === "plan_derived" && !o.sourceDocumentIds?.length)),
  ).length;
  if (missingEvidence)
    add(
      3,
      "listing-condition",
      `Complétez les sources de ${missingEvidence} observation(s), ou corrigez leur origine déclarée.`,
    );
  if (value.photos.length < 1)
    add(4, "listing-photos", "Ajoutez au moins une photo du parking.");
  if (
    value.pricingMode !== "per_space" &&
    (!Number.isSafeInteger(value.priceCents) || value.priceCents <= 0)
  )
    add(5, "listing-price", "Indiquez un prix positif pour le lot entier.");
  if (
    [
      value.commercialDetails?.chargesSource,
      value.commercialDetails?.taxSource,
      value.commercialDetails?.rentalIncome,
    ].some(
      (f) =>
        f?.sourceKind === "provided_document" && !f.sourceDocumentIds.length,
    )
  )
    add(
      5,
      "listing-financial",
      "Reliez les documents utilisés pour les montants financiers.",
    );
  if (value.title.trim().length < 15 || value.title.length > 90)
    add(6, "listing-title", "Le titre doit comporter 15 à 90 caractères.");
  if (value.description.trim().length < 100 || value.description.length > 5000)
    add(
      6,
      "listing-description",
      "La description doit comporter 100 à 5 000 caractères.",
    );
  return issues;
}
