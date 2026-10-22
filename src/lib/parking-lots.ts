import type { PublicParkingSceneGroup } from "./parking-registry";
import { spaceOffer } from "./listing-price";
import type { TransactionType } from "./types";

type Group = Pick<PublicParkingSceneGroup, "listings">;
/** Commercial groups use the actual offer and painted numbers, never invented legal references. */
export function parkingListingGroups(group: Group | null | undefined) {
  return [...(group?.listings ?? [])]
    .sort((a, b) => a.id.localeCompare(b.id))
    .flatMap((listing) =>
      (["sale", "rent"] as TransactionType[]).flatMap((transactionType) => {
        const spaces = listing.spaces.filter(
          (space) =>
            spaceOffer(listing, space).transactionType === transactionType,
        );
        if (!spaces.length) return [];
        const statuses = spaces.map(
          (space) => spaceOffer(listing, space).status,
        );
        const complete = statuses.every(
          (status) =>
            status === (transactionType === "sale" ? "sold" : "rented"),
        );
        return [
          {
            key: `${listing.id}:${transactionType}`,
            listing,
            spaces,
            transactionType,
            label:
              transactionType === "sale"
                ? complete
                  ? "Lot vendu"
                  : "Lot à vendre"
                : complete
                  ? "Lot loué"
                  : "Lot à louer",
            color: transactionType === "sale" ? "#A17B31" : "#6D28FF",
          },
        ];
      }),
    );
}
export function parkingListingGroupLabel(
  group: Group | null | undefined,
  listingId: string,
  spaceId?: string,
) {
  const groups = parkingListingGroups(group).filter(
    (item) => item.listing.id === listingId,
  );
  if (spaceId) {
    const found = groups.find((item) =>
      item.spaces.some((space) => space.id === spaceId),
    );
    if (found) return found.label;
  }
  return groups.length > 1
    ? "Lot à vendre et à louer"
    : (groups[0]?.label ?? "Les places de l’annonce");
}
