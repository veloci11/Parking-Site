import {
  attributeConditions,
  editableConditions,
} from "@/lib/condition-observations";
import type { Listing, ConditionObservation } from "@/lib/types";
import { sceneDB } from "./scenes/local";
import { ApiError } from "./security";
type ConditionCandidate = Omit<Listing, "conditionObservations"> & {
  conditionObservations?: unknown;
};
export function attributeLocalConditions(
  value: ConditionCandidate,
  actorId: string,
  previous?: Listing,
  requireEvidence = false,
) {
  try {
    const sql = sceneDB();
    const permitted = new Set(
      sql
        .prepare(
          "SELECT id FROM scene_sources WHERE listing_id=? AND owner_id=?",
        )
        .all(value.id, actorId)
        .map((r) => String(r.id)),
    );
    return attributeConditions(
      editableConditions(
        value.conditionObservations as ConditionObservation[] | undefined,
      ),
      { ...value, conditionObservations: previous?.conditionObservations },
      actorId,
      permitted,
      requireEvidence,
    );
  } catch (error) {
    throw new ApiError(
      400,
      error instanceof Error ? error.message : "Observations invalides.",
      "VALIDATION_ERROR",
    );
  }
}

export function attributeLocalListing(
  value: ConditionCandidate,
  actorId: string,
  previous?: Listing,
): Listing {
  return {
    ...value,
    conditionObservations: attributeLocalConditions(value, actorId, previous),
  };
}
