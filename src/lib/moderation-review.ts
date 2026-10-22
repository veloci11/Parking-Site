export interface ReviewedRevision {
  id: string;
  version: number;
}

/** A review attestation applies only to the exact revision that was displayed. */
export function isRevisionReviewed(
  current: ReviewedRevision | null | undefined,
  reviewed: ReviewedRevision | null,
): boolean {
  return Boolean(
    current &&
    reviewed &&
    current.id === reviewed.id &&
    current.version === reviewed.version,
  );
}
