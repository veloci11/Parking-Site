import type { Message } from "@/lib/types";
/** Keep already loaded history while polling the latest page; repeated boundaries are deduplicated. */
export function mergeMessageHistory(
  current: Message[],
  incoming: Message[],
): Message[] {
  const unique = new Map(current.map((item) => [item.id, item]));
  for (const item of incoming) unique.set(item.id, item);
  return [...unique.values()].sort(
    (a, b) =>
      a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id),
  );
}
