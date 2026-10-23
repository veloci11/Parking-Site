/** Same boundary as the responsive explorer layout. */
export const MOBILE_MAP_MEDIA_QUERY = "(max-width: 767px)";
export type ExplorerView = "list" | "map";
export type ExplorerViewPreference = ExplorerView | "auto";
export function readExplorerView(
  params: URLSearchParams,
): ExplorerViewPreference {
  const value = params.get("display");
  if (value === "list" || value === "map") return value;
  return params.has("listing") ? "map" : "auto";
}
export function resolveExplorerView(
  preference: ExplorerViewPreference,
  _mobile: boolean,
): ExplorerView {
  return preference === "auto" ? "map" : preference;
}
export interface MapDemandViewport {
  readonly matches: boolean;
  addEventListener(type: "change", listener: () => void): void;
  removeEventListener(type: "change", listener: () => void): void;
}
/** Requests once when the map can be seen. The caller keeps this demand latched. */
export function observeCityMapDemand(
  viewport: MapDemandViewport,
  preference: ExplorerViewPreference,
  request: () => void,
  onViewChange?: (view: ExplorerView) => void,
) {
  let requested = false;
  let disposed = false;
  const check = () => {
    if (disposed) return;
    const view = resolveExplorerView(preference, viewport.matches);
    onViewChange?.(view);
    if (!requested && view === "map") {
      requested = true;
      request();
    }
  };
  viewport.addEventListener("change", check);
  check();
  return () => {
    disposed = true;
    viewport.removeEventListener("change", check);
  };
}
