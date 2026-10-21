import { money, type Listing } from "./types";
export function listingPrice(
  listing: Pick<Listing, "priceCents" | "transactionType">,
): string {
  return (
    money(listing.priceCents) +
    (listing.transactionType === "rent" ? " / mois" : "")
  );
}
export function offerLabel(listing: Pick<Listing, "transactionType">): string {
  return listing.transactionType === "rent" ? "À louer" : "À vendre";
}
