import reference from "./data/ile-de-france-2025.json";
import type { Listing } from "./types";

export const PARIS_CENTER: [number, number] = [2.3522, 48.8566];
export const IDF_DEPARTMENTS = [
  "75",
  "77",
  "78",
  "91",
  "92",
  "93",
  "94",
  "95",
] as const;
export const IDF_BOUNDS: [number, number, number, number] = [
  1.4463, 48.12008, 3.55903, 49.24149,
];
export const REGION_MESSAGE =
  "La plateforme est réservée à Paris et à l’Île-de-France. Vérifiez la commune, le code postal et le point du parking.";
const normalize = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
function cityKey(s: string) {
  return /^paris(?:\s+\d{1,2}(?:e|er|eme|ème)?(?:\s+arrondissement)?)?$/i.test(
    s.trim(),
  )
    ? "paris"
    : normalize(s);
}
type Point = readonly number[];
function onSegment(p: Point, a: Point, b: Point) {
  return (
    Math.abs((b[0] - a[0]) * (p[1] - a[1]) - (b[1] - a[1]) * (p[0] - a[0])) <
      1e-11 &&
    p[0] >= Math.min(a[0], b[0]) - 1e-11 &&
    p[0] <= Math.max(a[0], b[0]) + 1e-11 &&
    p[1] >= Math.min(a[1], b[1]) - 1e-11 &&
    p[1] <= Math.max(a[1], b[1]) + 1e-11
  );
}
function inRing(p: Point, ring: number[][]) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const a = ring[j],
      b = ring[i];
    if (onSegment(p, a, b)) return true;
    if (
      a[1] > p[1] !== b[1] > p[1] &&
      p[0] < ((b[0] - a[0]) * (p[1] - a[1])) / (b[1] - a[1]) + a[0]
    )
      inside = !inside;
  }
  return inside;
}
export function isIdfCoordinate(
  value: unknown,
  department?: string,
): value is [number, number] {
  if (
    !Array.isArray(value) ||
    value.length !== 2 ||
    value.some((n) => typeof n !== "number" || !Number.isFinite(n))
  )
    return false;
  return reference.departments.some(
    (d) =>
      (!department || d.code === department) &&
      inRing(value, d.geometry.coordinates[0]) &&
      !d.geometry.coordinates.slice(1).some((r) => inRing(value, r)),
  );
}
/** Private exact coordinates decide eligibility; a public sector point is only required to stay in IDF. */
export function idfListingProblem(
  value: Pick<
    Listing,
    "city" | "coordinates" | "commercialDetails" | "publicCoordinates"
  >,
  requirePostal = false,
): string | null {
  const postal = value.commercialDetails?.postalCode?.trim() || "";
  const communes = reference.communes.filter(
    (c) =>
      (!postal || c.postalCodes.includes(postal)) &&
      cityKey(c.name) === cityKey(value.city),
  );
  if (
    (requirePostal && !postal) ||
    !communes.length ||
    !communes.some((c) => isIdfCoordinate(value.coordinates, c.department)) ||
    (value.publicCoordinates && !isIdfCoordinate(value.publicCoordinates))
  )
    return REGION_MESSAGE;
  return null;
}
export function idfGeocode(query: string) {
  const q = normalize(query.trim());
  if (q.length < 2) return [];
  return reference.communes
    .filter(
      (c) =>
        normalize(c.name).startsWith(q) ||
        c.postalCodes.some((p) => p.startsWith(q)),
    )
    .sort((a, b) =>
      normalize(a.name) === q
        ? -1
        : normalize(b.name) === q
          ? 1
          : a.name.localeCompare(b.name, "fr"),
    )
    .slice(0, 8)
    .map((c) => ({
      code: c.code,
      city: c.name,
      postalCodes: c.postalCodes,
      coordinates: c.center as [number, number],
      kind: "municipality" as const,
    }));
}
