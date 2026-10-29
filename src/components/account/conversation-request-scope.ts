/** Ignore late requests after leaving a conversation, including a later return to it. */
export function createConversationRequestScope() {
  let selected: string | undefined;
  let generation = 0;
  const requests = new Map<string, number>();
  return {
    select(id: string | undefined) {
      if (id === selected) return;
      selected = id;
      generation++;
      requests.clear();
    },
    begin(id: string, channel: string) {
      if (selected !== id) return { apply: (_update: () => void) => false };
      const startedAt = generation;
      const serial = (requests.get(channel) ?? 0) + 1;
      requests.set(channel, serial);
      return {
        apply(update: () => void) {
          if (
            selected !== id ||
            generation !== startedAt ||
            requests.get(channel) !== serial
          )
            return false;
          update();
          return true;
        },
      };
    },
  };
}
