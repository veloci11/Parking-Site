import type { RegistryAdminData } from "./parking-registry";
import type { Listing } from "./types";

type ReadApi = <T>(path: string, options?: RequestInit) => Promise<T>;

/** The registry returns links only for the explicitly requested listing. */
export async function loadRegistrySelection(
  read: ReadApi,
  listingId: string,
  signal: AbortSignal,
) {
  const query = listingId ? `?listingId=${encodeURIComponent(listingId)}` : "";
  const [registry, listing] = await Promise.all([
    read<RegistryAdminData>(`/api/admin/parking-registry${query}`, { signal }),
    listingId
      ? read<Listing>(
          `/api/scenes?scope=listing&listingId=${encodeURIComponent(listingId)}`,
          { signal },
        )
      : Promise.resolve(null),
  ]);
  // Some transports may finish despite cancellation. Never apply that response.
  if (signal.aborted) return null;
  if (listing && listing.id !== listingId)
    throw new Error("L’annonce reçue ne correspond pas au dossier demandé.");
  return { registry, listing };
}
