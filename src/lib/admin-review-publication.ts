import type { Listing, ListingStatus } from "./types";

export interface AdminPublication extends Listing {
  /** The version shown to the public, which may precede a rejected draft. */
  publishedVersion: number;
  /** Whether this published snapshot is currently visible in the catalogue. */
  publicationState: "visible" | "hidden";
}

/** Keep command version current without presenting the seller's newer draft as published. */
export function adminReviewPublication(
  snapshot: Listing,
  commandVersion: number,
  lifecycleStatus: ListingStatus,
  visible: boolean,
): AdminPublication {
  return {
    ...snapshot,
    version: commandVersion,
    status: lifecycleStatus,
    publishedVersion: snapshot.version,
    publicationState: visible ? "visible" : "hidden",
  };
}
