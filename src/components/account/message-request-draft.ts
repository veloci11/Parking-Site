export interface MessageRequestDraft {
  conversationId: string;
  body: string;
  clientRequestId: string;
}

/** Retrying a lost acknowledgement keeps the key; changing the message starts a new send. */
export function messageRequestDraft(
  previous: MessageRequestDraft | null,
  conversationId: string,
  body: string,
  createId: () => string = () => crypto.randomUUID(),
): MessageRequestDraft {
  const normalized = body.trim();
  return previous?.conversationId === conversationId &&
    previous.body === normalized
    ? previous
    : { conversationId, body: normalized, clientRequestId: createId() };
}

export function composerAfterAcknowledgement(
  current: string,
  sentBody: string,
) {
  return current.trim() === sentBody ? "" : current;
}

/** Returning to the same conversation must not revive an older in-flight send. */
export function createConversationSendScope() {
  let conversationId: string | undefined;
  let generation = 0;
  function select(id: string | undefined) {
    if (conversationId !== id) {
      conversationId = id;
      generation++;
    }
  }
  return {
    select,
    begin(id: string) {
      select(id);
      const startedAt = ++generation;
      return {
        apply(update: () => void) {
          if (conversationId !== id || generation !== startedAt) return false;
          update();
          return true;
        },
      };
    },
  };
}
