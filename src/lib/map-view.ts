/** Serializable public camera state. No listing address or private coordinates. */
export interface MapViewState {
  center: [number, number];
  zoom: number;
  bearing: number;
  pitch: number;
}
export interface MapSearchArea {
  bbox: [number, number, number, number];
  center: [number, number];
}
export interface MapViewport {
  center: [number, number];
  bounds: [number, number, number, number];
}
const clamp = (value: number, min: number, max: number) =>
  Math.max(min, Math.min(max, value));
const finite = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value);
export const wrapLongitude = (value: number) =>
  ((((value + 180) % 360) + 360) % 360) - 180;
export function normalizeMapView(value: unknown): MapViewState | null {
  if (!value || typeof value !== "object") return null;
  const state = value as Record<string, unknown>;
  if (
    !Array.isArray(state.center) ||
    state.center.length !== 2 ||
    !state.center.every(finite) ||
    !finite(state.zoom) ||
    !finite(state.bearing) ||
    !finite(state.pitch)
  )
    return null;
  return {
    center: [
      wrapLongitude(state.center[0]),
      clamp(state.center[1], -85.051129, 85.051129),
    ],
    zoom: clamp(state.zoom, 4, 19),
    bearing: wrapLongitude(state.bearing),
    pitch: clamp(state.pitch, 0, 70),
  };
}
/** Crossing/wrapped worlds become a full longitude range rather than silently
 * excluding one side of the visible viewport. The request always has west<east. */
export function normalizeMapSearchArea(
  bounds: unknown,
  center: unknown,
): MapSearchArea | null {
  if (
    !Array.isArray(bounds) ||
    bounds.length !== 4 ||
    !bounds.every(finite) ||
    !Array.isArray(center) ||
    center.length !== 2 ||
    !center.every(finite)
  )
    return null;
  const [west, south, east, north] = bounds;
  if (south >= north || west === east) return null;
  const s = clamp(south, -85.051129, 85.051129),
    n = clamp(north, -85.051129, 85.051129);
  if (s >= n) return null;
  const world = west > east || west < -180 || east > 180 || east - west >= 360;
  const w = world ? -180 : clamp(west, -180, 180),
    e = world ? 180 : clamp(east, -180, 180);
  if (w >= e) return null;
  return {
    bbox: [w, s, e, n],
    center: [wrapLongitude(center[0]), clamp(center[1], -85.051129, 85.051129)],
  };
}
