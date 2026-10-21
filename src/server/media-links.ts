import type { Listing } from "@/lib/types";
import { ApiError } from "./security";
export function listingPhotoUrls(
  listing: Pick<Listing, "photos" | "spacePhotos">,
): string[] {
  return [
    ...new Set([
      ...listing.photos,
      ...Object.values(listing.spacePhotos || {}).flat(),
    ]),
  ];
}
export function validatePhotoLinks(
  listing: Pick<Listing, "photos" | "spacePhotos" | "spaces" | "unitQuality">,
) {
  const ids = new Set(listing.spaces.map((space) => space.id));
  for (const id of Object.keys(listing.unitQuality || {})) {
    if (!ids.has(id))
      throw new ApiError(
        400,
        "La qualité doit être associée à une place de cette annonce.",
      );
  }
  for (const [id, photos] of Object.entries(listing.spacePhotos || {})) {
    if (!ids.has(id) || photos.length > 6)
      throw new ApiError(
        400,
        "Les photos doivent être associées à une place de cette annonce (6 maximum par place).",
      );
  }
  if (listingPhotoUrls(listing).length > 120)
    throw new ApiError(
      400,
      "Une annonce peut contenir 120 photos différentes au maximum.",
    );
}
export function publicSpacePhotos(
  listing: Pick<Listing, "id" | "spaces" | "spacePhotos">,
): Record<string, string[]> {
  const result: Record<string, string[]> = {};
  listing.spaces.forEach((space, index) => {
    const photos = listing.spacePhotos?.[space.id];
    if (photos?.length) result[`${listing.id}:unit:${index + 1}`] = [...photos];
  });
  return result;
}
