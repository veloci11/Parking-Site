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
export type ParkingListingGroup = ReturnType<
  typeof parkingListingGroups
>[number];

export function parkingSpaceLocation(space: {
  number: string;
  level: number;
  levelKnown?: boolean;
}) {
  if (space.levelKnown === false)
    return `Place ${space.number || "non numérotée"} · niveau à préciser`;
  const floor =
    space.level === 0 ? "RDC" : String(space.level).replace("-", "−");
  return `Place ${space.number || "non numérotée"} · ${floor === "RDC" ? floor : `niveau ${floor}`}`;
}

/** Keep the active offer when changing floors; never confuse painted numbers with unit IDs. */
export function parkingUnitOnLevel<
  T extends {
    listingId: string;
    listingUnitId: string;
    space: { level: number };
  },
>(
  units: readonly T[],
  level: number,
  lot: ParkingListingGroup | undefined,
  listingId: string,
): T | undefined {
  const candidates = units.filter((unit) => unit.space.level === level);
  return (
    candidates.find(
      (unit) =>
        unit.listingId === lot?.listing.id &&
        lot.spaces.some((space) => space.id === unit.listingUnitId),
    ) ??
    candidates.find((unit) => unit.listingId === listingId) ??
    candidates[0]
  );
}

/** Prefer available offers, then the current floor, among this parking's units. */
export function preferredParkingLotUnit<
  T extends {
    listingId: string;
    listingUnitId: string;
    space: { level: number };
  },
>(lot: ParkingListingGroup, units: readonly T[], level: number): T | undefined {
  const spacesById = new Map(lot.spaces.map((space) => [space.id, space]));
  const candidates = units.filter(
    (unit) =>
      unit.listingId === lot.listing.id && spacesById.has(unit.listingUnitId),
  );
  const available = candidates.filter(
    (unit) =>
      spaceOffer(lot.listing, spacesById.get(unit.listingUnitId)!).status ===
      "available",
  );
  return (
    available.find((unit) => unit.space.level === level) ??
    available[0] ??
    candidates.find((unit) => unit.space.level === level) ??
    candidates[0]
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
