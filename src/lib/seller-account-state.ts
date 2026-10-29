import type { Conversation, Listing } from "./types";

type ReadApi = <T>(path: string, options?: RequestInit) => Promise<T>;
export type DashboardResult =
  | { section: "listings"; data: Listing[]; error: null }
  | { section: "conversations"; data: Conversation[]; error: null }
  | { section: "listings" | "conversations"; data: null; error: string };

/** Each section becomes usable as soon as its own request finishes. */
export async function loadDashboardSections(
  read: ReadApi,
  signal: AbortSignal,
  receive: (result: DashboardResult) => void,
) {
  await Promise.all(
    (["listings", "conversations"] as const).map(async (section) => {
      try {
        if (section === "listings") {
          const result = await read<{ data: Listing[] }>("/api/me/listings", {
            signal,
          });
          if (!signal.aborted)
            receive({ section, data: result.data, error: null });
        } else {
          const result = await read<{ data: Conversation[] }>(
            "/api/conversations",
            { signal },
          );
          if (!signal.aborted)
            receive({ section, data: result.data, error: null });
        }
      } catch (error) {
        if (!signal.aborted)
          receive({ section, data: null, error: (error as Error).message });
      }
    }),
  );
}

/** Apply the server's confirmed change without unmounting unrelated seller forms. */
export function updateManagedListing(
  items: Listing[],
  expectedId: string,
  updated: Listing,
) {
  const previous = items.find((item) => item.id === expectedId);
  if (
    !previous ||
    updated?.id !== expectedId ||
    !Number.isInteger(updated.version) ||
    updated.version <= previous.version ||
    !Array.isArray(updated.spaces)
  )
    throw new Error(
      "Le statut reçu doit être vérifié. Actualisez vos annonces avant de poursuivre.",
    );
  return items.map((item) => (item.id === expectedId ? updated : item));
}
