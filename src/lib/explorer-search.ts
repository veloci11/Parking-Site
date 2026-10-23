import { emptySearch, searchParams, type SearchState } from "./search-client";
import type { MapSearchArea } from "./map-view";

/** Keep existing results while only the map/location changes, never across
 * sale/rent, price or other offer-filter changes. */
export function explorerOfferFilterKey(state: SearchState): string {
  return searchParams(searchByLocation(state, ""), true).toString();
}

/** A new location replaces the old geographic restriction, keeping offer filters. */
export function searchByLocation(
  state: SearchState,
  query: string,
): SearchState {
  return {
    ...state,
    city: query.trim().slice(0, 80),
    bbox: "",
    center: "",
    radiusKm: "",
  };
}

/** Moving the map searches its visible area rather than intersecting an old city. */
export function searchVisibleMapArea(
  state: SearchState,
  area: MapSearchArea,
): SearchState {
  return {
    ...state,
    city: "",
    bbox: area.bbox.join(","),
    center: "",
    radiusKm: "",
  };
}

/** Resetting filters keeps the buyer's explicit sale/rent intent. */
export function resetExplorerFilters(state: SearchState): SearchState {
  return { ...emptySearch, transactionType: state.transactionType };
}

/** Sorting and the offer type do not count as removable search restrictions. */
export function hasExplorerFilters(state: SearchState): boolean {
  return (
    state.only3D ||
    [
      state.city,
      state.type,
      state.minPrice,
      state.maxPrice,
      state.minArea,
      state.minSpaces,
      state.sellerType,
      state.covered,
      state.closed,
      state.occupancy,
      state.level,
      state.bbox,
      state.radiusKm,
    ].some((value) => value !== "")
  );
}
