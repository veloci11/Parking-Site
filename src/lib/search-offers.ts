import { availableOffers } from "./listing-price";
import type { Listing, Space, TransactionType } from "./types";

/** Keep search summaries on the same available units as their price and count. */
export function searchOfferSpaces(
  listing: Listing,
  transactionType?: TransactionType,
): Space[] {
  if (listing.pricingMode !== "per_space") return listing.spaces;
  const match = listing.catalogMatch;
  const ids =
    match && match.transactionType === transactionType
      ? new Set(match.spaceIds)
      : null;
  return availableOffers(listing, transactionType)
    .filter(({ space }) => !ids || ids.has(space.id))
    .map(({ space }) => space);
}
