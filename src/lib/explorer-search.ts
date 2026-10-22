import { emptySearch, type SearchState } from "./search-client";

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
      state.covered,
      state.closed,
      state.occupancy,
      state.level,
      state.bbox,
      state.radiusKm,
    ].some((value) => value !== "")
  );
}
