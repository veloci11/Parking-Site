/** Coalesce focus/visibility events and stop late responses after navigation. */
export function createPublicRefresh<T>({
  load,
  onSuccess,
  onError,
  timeoutMs = 15000,
}: {
  load: (signal: AbortSignal) => Promise<T>;
  onSuccess: (value: T) => void;
  onError: (error: unknown) => void;
  timeoutMs?: number;
}) {
  let disposed = false;
  let pending: { controller: AbortController; promise: Promise<void> } | null =
    null;

  function refresh(): Promise<void> {
    if (disposed) return Promise.resolve();
    if (pending) return pending.promise;
    const controller = new AbortController();
    let rejectAbort!: (reason: unknown) => void;
    const aborted = new Promise<never>((_, reject) => {
      rejectAbort = reject;
    });
    const abort = () => rejectAbort(controller.signal.reason);
    controller.signal.addEventListener("abort", abort, { once: true });
    const timeout = setTimeout(
      () => controller.abort(new Error("Le chargement a pris trop de temps.")),
      timeoutMs,
    );
    const promise = Promise.race([
      Promise.resolve().then(() => load(controller.signal)),
      aborted,
    ])
      .then((value) => {
        if (!disposed) onSuccess(value);
      })
      .catch((error: unknown) => {
        if (!disposed) onError(error);
      })
      .finally(() => {
        clearTimeout(timeout);
        controller.signal.removeEventListener("abort", abort);
        if (pending?.controller === controller) pending = null;
      });
    pending = { controller, promise };
    return promise;
  }

  return {
    refresh,
    dispose() {
      disposed = true;
      pending?.controller.abort();
    },
  };
}
