"use client";
import {
  parkingSceneGroup,
  type PublicParking,
  type PublicParkingSceneGroup,
} from "./parking-registry";

/** One request returns the canonical parking, all eligible listings and its reviewed floors. */
export async function loadPublicParkingGroup(
  listingId: string,
  signal?: AbortSignal,
): Promise<PublicParkingSceneGroup | null> {
  const response = await fetch(
    `/api/parkings?listingId=${encodeURIComponent(listingId)}`,
    { cache: "no-store", signal },
  );
  if (response.status === 404) return null;
  const result = await response.json();
  if (!response.ok || !result.data)
    throw new Error(result.error || "Le parking partagé est indisponible.");
  return parkingSceneGroup(result.data as PublicParking);
}
