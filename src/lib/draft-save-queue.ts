/** Share in-flight saves and drain newer edits before allowing navigation. */
export function createDraftSaveQueue<T>(
  saveCurrent: () => Promise<T | null>,
  hasPendingChanges: () => boolean,
): () => Promise<T | null> {
  let pending: Promise<T | null> | null = null;
  return () => {
    if (pending) return pending;
    pending = (async () => {
      let result: T | null;
      do {
        result = await saveCurrent();
        if (result === null) return null;
      } while (hasPendingChanges());
      return result;
    })().finally(() => {
      pending = null;
    });
    return pending;
  };
}
