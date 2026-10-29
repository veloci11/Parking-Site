import type { Listing } from "./types";

export interface SceneEditorSource {
  id: string;
  listing_id: string;
  mime: string;
  byte_size: number;
  processing_state?: "processing" | "ready" | "rejected";
  previewUrls?: string[];
  url: string;
}

type ReadApi = <T>(path: string, options?: RequestInit) => Promise<T>;

/** Only return a complete, matching editor context; never combine two listings. */
export async function loadSceneEditorSelection(
  read: ReadApi,
  listingId: string,
  signal: AbortSignal,
  knownListing?: Listing,
) {
  const encoded = encodeURIComponent(listingId);
  const [listing, sources] = await Promise.all([
    knownListing
      ? Promise.resolve(knownListing)
      : read<Listing>(`/api/scenes?scope=listing&listingId=${encoded}`, {
          signal,
        }),
    read<SceneEditorSource[]>(`/api/scenes/sources?listingId=${encoded}`, {
      signal,
    }),
  ]);
  if (signal.aborted) return null;
  if (
    listing.id !== listingId ||
    sources.some((s) => s.listing_id !== listingId)
  )
    throw new Error(
      "Les documents reçus ne correspondent pas à cette annonce.",
    );
  return { listing, sources };
}
