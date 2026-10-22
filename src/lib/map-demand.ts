/** Same boundary as globals.css: the mobile map panel is hidden at <= 767px. */
export const MOBILE_MAP_MEDIA_QUERY = "(max-width: 767px)";
export interface MapDemandViewport {
  readonly matches: boolean;
  addEventListener(type: "change", listener: () => void): void;
  removeEventListener(type: "change", listener: () => void): void;
}
/** Requests once when the map can be seen. The caller keeps this demand latched. */
export function observeCityMapDemand(
  viewport: MapDemandViewport,
  mobileView: "list" | "map",
  request: () => void,
) {
  let requested = false;
  let disposed = false;
  const check = () => {
    if (
      !disposed &&
      !requested &&
      (!viewport.matches || mobileView === "map")
    ) {
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
