import type {
  AdminModelingRequest,
  AdminModelingRequests,
  ModelingRequestStatus,
} from "./modeling-requests";

/** Recover a dossier with one bounded read of its original queue page. */
export async function loadModelingRequestPage(
  read: <T>(path: string, options?: RequestInit) => Promise<T>,
  status: string,
  offset: number,
  signal?: AbortSignal,
) {
  const params = new URLSearchParams({ offset: String(offset), limit: "25" });
  if (status !== "all") params.set("status", status);
  const { data } = await read<{ data: AdminModelingRequests }>(
    `/api/admin/modeling-requests?${params}`,
    { method: "GET", cache: "no-store", signal },
  );
  return data;
}

/** An absent or older dossier must never reopen the previous editable snapshot. */
export function reloadedModelingRequest(
  previous: Pick<AdminModelingRequest, "listingId" | "version">,
  page: AdminModelingRequests,
): AdminModelingRequest | null {
  const current = page.requests.find(
    (request) => request.listingId === previous.listingId,
  );
  if (!current) return null;
  if (!Number.isInteger(current.version) || current.version < previous.version)
    throw new Error(
      "La version actuelle de la demande n’a pas pu être confirmée. Réessayez le chargement.",
    );
  return current;
}

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
