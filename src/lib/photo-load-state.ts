export type PhotoLoadState = Record<
  string,
  { attempt: number; status: "loading" | "ready" | "failed" }
>;
type PhotoLoadEvent =
  | { type: "retry"; src: string }
  | { type: "ready" | "failed"; src: string; attempt: number };

/** An old decode/error cannot complete a newer retry or replace its result. */
export function photoLoadReducer(
  state: PhotoLoadState,
  event: PhotoLoadEvent,
): PhotoLoadState {
  const current = state[event.src] || { attempt: 0, status: "loading" };
  if (event.type === "retry")
    return {
      ...state,
      [event.src]: { attempt: current.attempt + 1, status: "loading" },
    };
  if (
    event.attempt !== current.attempt ||
    current.status === "failed" ||
    current.status === event.type
  )
    return state;
  return {
    ...state,
    [event.src]: { attempt: current.attempt, status: event.type },
  };
}
