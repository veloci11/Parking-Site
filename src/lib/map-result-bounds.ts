import { isIdfCoordinate } from "./paris-region";

/** Public result positions only. Never uses private addresses or device GPS. */
export function mapResultBounds(
  coordinates: readonly (readonly number[])[],
): [[number, number], [number, number]] | null {
  const valid = coordinates.filter(
    (value) =>
      value.length === 2 &&
      value.every(Number.isFinite) &&
      isIdfCoordinate(value),
  );
  if (!valid.length) return null;
  const lngs = valid.map((point) => point[0]);
  const lats = valid.map((point) => point[1]);
  return [
    [Math.min(...lngs), Math.min(...lats)],
    [Math.max(...lngs), Math.max(...lats)],
  ];
}

export interface ProjectedMapMarker {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
}
export interface MapMarkerGroup {
  ids: string[];
  x: number;
  y: number;
  width: number;
  height: number;
}
/** Cluster intersecting price buttons, including their real label widths.
 * Screen-space grouping follows zoom, pitch and bearing instead of a lat/lng grid.
 */
export function groupMapMarkers(
  points: readonly ProjectedMapMarker[],
  groupSize: (
    count: number,
    ids: string[],
  ) => { width: number; height: number },
  gap = 12,
): MapMarkerGroup[] {
  const groups: MapMarkerGroup[] = points
    .filter((point) =>
      [point.x, point.y, point.width, point.height].every(Number.isFinite),
    )
    .map(({ id, ...point }) => ({ ...point, ids: [id] }));
  let merged = true;
  while (merged) {
    merged = false;
    for (let i = 0; i < groups.length; i++) {
      for (let j = i + 1; j < groups.length; j++) {
        const a = groups[i],
          b = groups[j];
        const overlaps =
          Math.abs(a.x - b.x) < (a.width + b.width) / 2 + gap &&
          a.y + gap > b.y - b.height &&
          b.y + gap > a.y - a.height;
        if (!overlaps) continue;
        const count = a.ids.length + b.ids.length;
        const ids = [...a.ids, ...b.ids];
        groups[i] = {
          ids,
          x: (a.x * a.ids.length + b.x * b.ids.length) / count,
          y: (a.y * a.ids.length + b.y * b.ids.length) / count,
          ...groupSize(count, ids),
        };
        groups.splice(j, 1);
        j--;
        merged = true;
      }
    }
  }
  return groups;
}
