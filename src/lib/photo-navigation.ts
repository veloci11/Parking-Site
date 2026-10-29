import type { Listing } from "./types";

export function selectedPhotoGallery(
  listing: Pick<Listing, "photos" | "spacePhotos">,
  selectedId: string | null,
): { photos: string[]; label: string } {
  const ownPhotos = selectedId ? listing.spacePhotos?.[selectedId] : undefined;
  return ownPhotos?.length
    ? { photos: ownPhotos, label: "Vue de la place" }
    : { photos: listing.photos, label: "Vue du parking" };
}

export function photoIndex(index: number, count: number): number {
  return Math.max(0, Math.min(index, count - 1));
}

export function movePhotoIndex(
  index: number,
  count: number,
  direction: -1 | 1,
) {
  return count > 0 ? (photoIndex(index, count) + direction + count) % count : 0;
}
