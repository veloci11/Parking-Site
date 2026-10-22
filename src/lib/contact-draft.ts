import {
  listingPrice,
  offerLabel,
  spaceOffer,
  spaceOfferPrice,
} from "./listing-price";
import type { Listing, Space } from "./types";

export interface ContactDraft {
  message: string;
  visit: boolean;
  messageRequestId: string;
  visitRequestId: string;
  context?: string;
}
type ContactListing = Pick<
  Listing,
  "priceCents" | "spaces" | "transactionType" | "pricingMode" | "status"
>;
export function contactSelectionContext(
  listing: ContactListing,
  space?: Space,
) {
  if (space) {
    const offer = spaceOffer(listing, space);
    return `À propos de la place ${space.number || "sans numéro renseigné"} · niveau ${space.level === 0 ? "RDC" : space.level} · ${offer.transactionType === "rent" ? "à louer" : "à vendre"} · ${spaceOfferPrice(listing, space)}.`;
  }
  return `À propos de ${listing.spaces.length > 1 ? `l’annonce de ${listing.spaces.length} places` : "cette place"} · ${offerLabel(listing)} · ${listingPrice(listing)}${listing.pricingMode === "per_space" ? "" : " · lot entier"}.`;
}
export function contactMessageBody(context: string, message: string) {
  return `${context}\n\n${message.trim()}`;
}
export const contactDraftKey = (listingId: string) =>
  `gp:contact:v1:${listingId}`;
export function decodeContactDraft(raw: string | null): ContactDraft | null {
  if (!raw || raw.length > 24000) return null;
  try {
    const value = JSON.parse(raw);
    const uuid =
      /^[a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;
    if (
      !value ||
      typeof value.message !== "string" ||
      value.message.length > 4000 ||
      typeof value.visit !== "boolean" ||
      typeof value.messageRequestId !== "string" ||
      !uuid.test(value.messageRequestId) ||
      typeof value.visitRequestId !== "string" ||
      !uuid.test(value.visitRequestId) ||
      (value.context !== undefined &&
        (typeof value.context !== "string" || value.context.length > 500))
    )
      return null;
    return {
      message: value.message,
      visit: value.visit,
      messageRequestId: value.messageRequestId,
      visitRequestId: value.visitRequestId,
      ...(value.context === undefined ? {} : { context: value.context }),
    };
  } catch {
    return null;
  }
}
