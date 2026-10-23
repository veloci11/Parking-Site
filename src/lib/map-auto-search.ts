import type { MapSearchArea } from "./map-view";

/** One request after a completed user gesture. Programmatic camera changes
 * cancel pending work, so rendering results cannot trigger a request loop.
 */
export function createMapAreaSearch(options: {
  readArea: () => MapSearchArea | null;
  enabled: () => boolean;
  search: (area: MapSearchArea) => void;
  delay?: number;
}) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  let manual = false;
  let disposed = false;
  let lastArea = "";
  const cancel = () => {
    if (timer !== undefined) clearTimeout(timer);
    timer = undefined;
    manual = false;
  };
  return {
    begin(userInitiated: boolean) {
      cancel();
      manual = userInitiated && !disposed && options.enabled();
    },
    end() {
      const shouldSearch = manual;
      manual = false;
      if (disposed || !shouldSearch || !options.enabled()) return;
      const area = options.readArea();
      if (!area) return;
      const key = area.bbox.map((value) => value.toFixed(6)).join(",");
      if (key === lastArea) return;
      if (timer !== undefined) clearTimeout(timer);
      timer = setTimeout(() => {
        timer = undefined;
        if (disposed || !options.enabled()) return;
        lastArea = key;
        options.search(area);
      }, options.delay ?? 350);
    },
    cancel,
    reset() {
      cancel();
      lastArea = "";
    },
    dispose() {
      cancel();
      disposed = true;
    },
  };
}

const locationKey = (value: string | undefined) =>
  value?.trim().toLocaleLowerCase("fr-FR") ?? "";

/** A typed location may move the camera once its own results arrive. A manual
 * gesture takes precedence over an outstanding location lookup.
 */
export function createMapLocationFocus() {
  let query = "";
  let applied = false;
  let suppressed = false;
  return {
    setQuery(value?: string) {
      const next = locationKey(value);
      if (next === query) return false;
      query = next;
      applied = false;
      suppressed = false;
      return true;
    },
    suppress() {
      suppressed = true;
    },
    takeReady(resultsQuery?: string, loading = false) {
      if (
        !query ||
        applied ||
        suppressed ||
        loading ||
        locationKey(resultsQuery) !== query
      )
        return false;
      applied = true;
      return true;
    },
  };
}
