export interface ContactDraft {
  message: string;
  visit: boolean;
  messageRequestId: string;
  visitRequestId: string;
}
export const contactDraftKey = (listingId: string) =>
  `gp:contact:v1:${listingId}`;
export function decodeContactDraft(raw: string | null): ContactDraft | null {
  if (!raw || raw.length > 24000) return null;
  try {
    const value = JSON.parse(raw);
    const uuid =
      /^[a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;
    if (
      !value ||
      typeof value.message !== "string" ||
      value.message.length > 4000 ||
      typeof value.visit !== "boolean" ||
      typeof value.messageRequestId !== "string" ||
      !uuid.test(value.messageRequestId) ||
      typeof value.visitRequestId !== "string" ||
      !uuid.test(value.visitRequestId)
    )
      return null;
    return {
      message: value.message,
      visit: value.visit,
      messageRequestId: value.messageRequestId,
      visitRequestId: value.visitRequestId,
    };
  } catch {
    return null;
  }
}
