import type { Conversation } from "@/lib/types";

/** A list requested before a successful read must not restore its old unread badge. */
export function reconcileConversationReads(
  conversations: Conversation[],
  readsAtRequest: ReadonlyMap<string, number>,
  currentReads: ReadonlyMap<string, number>,
) {
  return conversations.map((conversation) =>
    (currentReads.get(conversation.id) ?? 0) >
    (readsAtRequest.get(conversation.id) ?? 0)
      ? { ...conversation, unread: 0 }
      : conversation,
  );
}
