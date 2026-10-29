import type { Listing } from "@/lib/types";
import { availableOffers, normalizeListingOffers } from "@/lib/listing-price";
import { ApiError } from "./security";
export function assertLocalOffers(value: Listing, submitting = false) {
  const invalid = (message: string): never => {
    throw new ApiError(400, message, "OFFER_INVALID");
  };
  if (
    value.pricingMode !== undefined &&
    value.pricingMode !== "lot" &&
    value.pricingMode !== "per_space"
  )
    invalid("Choisissez une offre pour le lot ou par place.");
  for (const space of value.spaces) {
    const offer = space.offer;
    if (value.pricingMode !== "per_space") {
      if (offer !== undefined)
        invalid("Une offre par place requiert le mode par place.");
      continue;
    }
    if (!offer) {
      if (submitting) invalid("Complétez l’offre de chaque place.");
      continue;
    }
    if (
      !["sale", "rent"].includes(offer.transactionType) ||
      !["available", "reserved", "sold", "rented", "withdrawn"].includes(
        offer.status,
      ) ||
      !Number.isSafeInteger(offer.priceCents) ||
      offer.priceCents < 0 ||
      offer.priceCents > 10000000000 ||
      (offer.status === "sold" && offer.transactionType !== "sale") ||
      (offer.status === "rented" && offer.transactionType !== "rent")
    )
      invalid(
        "Le prix, le statut et la transaction de chaque place doivent être cohérents.",
      );
    if (submitting && offer.priceCents <= 0)
      invalid("Indiquez un prix positif pour chaque place.");
  }
  if (
    submitting &&
    value.pricingMode === "per_space" &&
    !availableOffers(value).length
  )
    invalid("Conservez au moins une place disponible pour publier.");
  Object.assign(value, normalizeListingOffers(value));
}
