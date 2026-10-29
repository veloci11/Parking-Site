import { parsePublicScene, type PublicScene } from "./scene-contract";
import type { Listing } from "./types";

export async function loadPublicListing(
  listingId: string,
  signal: AbortSignal,
): Promise<Listing | null> {
  const response = await fetch(
    `/api/listings/${encodeURIComponent(listingId)}`,
    {
      cache: "no-store",
      signal,
    },
  );
  if (response.status === 404) return null;
  if (!response.ok)
    throw new Error("L’état actuel de l’annonce n’a pas pu être vérifié.");
  const result = await response.json();
  if (result?.data?.id !== listingId)
    throw new Error("La réponse de l’annonce est incomplète.");
  return result.data as Listing;
}

/** A missing reviewed floor is distinct from an interrupted or invalid response. */
export async function loadPublicParkingScene(
  listingId: string,
  level: number,
  allowOtherLevel: boolean,
  signal: AbortSignal,
): Promise<PublicScene | null> {
  const path = `/api/scenes?listingId=${encodeURIComponent(listingId)}`;
  let response = await fetch(`${path}&level=${level}`, { signal });
  if (response.status === 404 && allowOtherLevel)
    response = await fetch(path, { signal });
  if (response.status === 404) return null;
  if (!response.ok) throw new Error("Le plan n’a pas pu être chargé.");
  const result = await response.json();
  const scene = parsePublicScene(result.data);
  if (!scene) throw new Error("Le plan reçu ne peut pas être affiché.");
  return scene;
}
