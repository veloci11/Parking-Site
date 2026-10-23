export interface VisitRequestDraft {
  conversationId: string;
  proposedAt: string | null;
  clientRequestId: string;
}

/** A lost response must retry the same visit, while a changed slot starts a new request. */
export function visitRequestDraft(
  previous: VisitRequestDraft | null,
  conversationId: string,
  proposedAt: string | null,
  createId: () => string = () => crypto.randomUUID(),
): VisitRequestDraft {
  return previous?.conversationId === conversationId &&
    previous.proposedAt === proposedAt
    ? previous
    : { conversationId, proposedAt, clientRequestId: createId() };
}
