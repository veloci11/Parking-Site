import type { Listing } from "@/lib/types";
import { idfListingProblem } from "@/lib/paris-region";
import { ApiError } from "./security";
export function assertLocalIdfPublication(value: Listing) {
  const message = idfListingProblem(value, true);
  if (message) throw new ApiError(400, message, "REGION_OUTSIDE_IDF");
}
