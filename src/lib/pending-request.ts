/** Coalesce simultaneous reads only. No response or identity is cached after completion. */
export function createPendingRequest<T>(load: () => Promise<T>) {
  let pending: { key: unknown; promise: Promise<T> } | null = null;
  return (key?: unknown): Promise<T> => {
    if (pending && pending.key === key) return pending.promise;
    const request = {
      key,
      promise: Promise.resolve().then(load),
    };
    request.promise = request.promise.finally(() => {
      if (pending === request) pending = null;
    });
    pending = request;
    return request.promise;
  };
}
