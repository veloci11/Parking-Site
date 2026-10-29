import type {
  AdminModelingRequest,
  ModelingRequestStatus,
} from "./modeling-requests";

/** A write is confirmed only by the requested dossier, state and a newer version. */
export function modelingDecisionConfirmed(
  previous: Pick<AdminModelingRequest, "listingId" | "version">,
  status: ModelingRequestStatus,
  result: AdminModelingRequest | null | undefined,
): result is AdminModelingRequest {
  return Boolean(
    result &&
    result.listingId === previous.listingId &&
    result.status === status &&
    Number.isInteger(result.version) &&
    result.version > previous.version,
  );
}
