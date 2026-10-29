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

/** A successful HTTP request can still return a physical conflict to the seller. */
export function moderationOutcome(
  decision: "approve" | "changes_requested" | "reject",
  result: { status?: string; rejectionReason?: string } | null | undefined,
): { confirmed: boolean; message: string } {
  const expected =
    decision === "approve"
      ? "published"
      : decision === "reject"
        ? "rejected"
        : "changes_requested";
  if (result?.status === expected)
    return {
      confirmed: true,
      message:
        decision === "approve"
          ? "La version relue a été publiée."
          : "La décision et son motif ont été enregistrés.",
    };
  if (decision === "approve" && result?.status === "changes_requested")
    return {
      confirmed: false,
      message: `Cette version n’a pas été publiée. ${result.rejectionReason || "Le rattachement des places nécessite un examen indépendant."}`,
    };
  return {
    confirmed: false,
    message:
      "Le résultat de la décision n’a pas pu être confirmé. Actualisez la file avant de poursuivre.",
  };
}
