import { searchParams, type SearchState } from "./search-client";
import type { Listing } from "./types";

/** Existing price-only bookmarks meant sale before favorites gained an all-offers view. */
export function showsAllFavoriteOffers(params: URLSearchParams): boolean {
  if (["sale", "rent"].includes(params.get("transactionType") || ""))
    return false;
  return !(
    params.has("priceMin") ||
    params.has("priceMax") ||
    ["price_asc", "price_desc"].includes(params.get("sort") || "")
  );
}

export function favoritesSearchParams(
  state: SearchState,
  allOffers: boolean,
): URLSearchParams {
  const params = searchParams(state);
  // Explicit sale must survive refresh: absence means all offers only on /favoris.
  if (!allOffers) params.set("transactionType", state.transactionType);
  else {
    params.delete("transactionType");
    params.delete("priceMin");
    params.delete("priceMax");
    if (state.sort.startsWith("price_")) params.delete("sort");
  }
  return params;
}

/** Keep the public API's single-offer security/filtering contract, and exhaust both cursors. */
export async function loadAllFavoriteOffers(
  state: SearchState,
  ids: string[],
  request: (url: string) => Promise<Pick<Response, "ok" | "json">> = fetch,
): Promise<Listing[]> {
  if (!ids.length) return [];
  const sort = state.sort.startsWith("price_") ? "recent" : state.sort;
  const groups = await Promise.all(
    (["sale", "rent"] as const).map(async (transactionType) => {
      const params = searchParams(
        { ...state, transactionType, minPrice: "", maxPrice: "", sort },
        true,
      );
      params.set("ids", ids.join(","));
      params.set("limit", "50");
      const rows: Listing[] = [];
      const seenCursors = new Set<string>();
      while (true) {
        const response = await request("/api/listings?" + params);
        const page = await response.json();
        if (!response.ok)
          throw new Error(page.error || "Impossible de charger vos favoris.");
        rows.push(...page.data);
        if (!page.nextCursor) return rows;
        if (seenCursors.has(page.nextCursor))
          throw new Error("La recherche a changé. Rechargez vos favoris.");
        seenCursors.add(page.nextCursor);
        params.set("cursor", page.nextCursor);
      }
    }),
  );
  const matches = new Map<string, { listing: Listing; ids: Set<string> }>();
  for (const listing of groups.flat()) {
    const entry = matches.get(listing.id) || {
      listing,
      ids: new Set<string>(),
    };
    for (const id of listing.catalogMatch?.spaceIds ||
      listing.spaces.map((s) => s.id))
      entry.ids.add(id);
    matches.set(listing.id, entry);
  }
  const listings = [...matches.values()].map(({ listing, ids: unitIds }) => {
    const { catalogMatch: _match, ...publicListing } = listing;
    // Search cards show only matching available units. The detail page loads the full listing.
    return {
      ...publicListing,
      spaces:
        listing.pricingMode === "per_space"
          ? listing.spaces.filter((space) => unitIds.has(space.id))
          : listing.spaces,
    };
  });
  const area = (listing: Listing) =>
    listing.spaces.length &&
    listing.spaces.every((space) => space.areaM2 !== null)
      ? Math.min(...listing.spaces.map((space) => space.areaM2!))
      : Infinity;
  return listings.sort((a, b) => {
    const order =
      sort === "spaces_desc"
        ? b.spaces.length - a.spaces.length
        : sort === "area_asc"
          ? area(a) - area(b)
          : Date.parse(b.createdAt) - Date.parse(a.createdAt);
    return order || a.id.localeCompare(b.id);
  });
}
