import type { Listing } from "./types";
import {
  explorerPageSize,
  explorerRequestError,
} from "./explorer-continuation";

interface PageState {
  data: Listing[];
  nextCursor: string | null;
}

/** A failed continuation never replaces already loaded results or its retry cursor. */
export async function loadExplorerNextPage(
  current: PageState,
  query: URLSearchParams,
  request: (url: string) => Promise<Pick<Response, "ok" | "json">> = fetch,
): Promise<PageState & { error: string }> {
  if (!current.nextCursor) return { ...current, error: "" };
  try {
    const params = new URLSearchParams(query);
    params.set("cursor", current.nextCursor);
    params.set("limit", String(explorerPageSize));
    const response = await request("/api/listings?" + params);
    const result = await response.json();
    if (!response.ok)
      throw new Error(
        result.error || "La suite des annonces n’a pas pu être chargée.",
      );
    const seen = new Set(current.data.map((listing) => listing.id));
    const added: Listing[] = [];
    for (const listing of result.data as Listing[]) {
      if (!seen.has(listing.id)) {
        seen.add(listing.id);
        added.push(listing);
      }
    }
    return {
      data: added.length ? [...current.data, ...added] : current.data,
      nextCursor: result.nextCursor || null,
      error: "",
    };
  } catch (error) {
    return { ...current, error: explorerRequestError(error) };
  }
}
