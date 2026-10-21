import { createHash } from "node:crypto";
import { z } from "zod";
import { ApiError } from "./security";
import { db } from "./db";
import { listPublicListings } from "./catalog";
import { initializeLocalParkingRegistry } from "./parking-registry";
import type { Listing, TransactionType } from "@/lib/types";
export interface PageFilters {
  query: string;
  type: string | null;
  transactionType?: TransactionType;
  maxPrice: number | null;
  minArea: number | null;
  sort: "recent" | "price_asc" | "price_desc" | "area_asc" | "spaces_desc";
  scene: boolean;
  minPrice?: number | null;
  covered?: boolean | null;
  closed?: boolean | null;
  occupancy?: "vacant" | "occupied" | "unknown" | null;
  level?: number | null;
  bbox?: [number, number, number, number] | null;
  center?: [number, number] | null;
  radiusKm?: number | null;
  ids?: string[] | null;
}
export interface PagePosition {
  version: 2;
  asOf: string;
  after: {
    id: string;
    createdAt: string;
    priceCents: number;
    areaM2: number | null;
    spaceCount: number;
  };
}
interface Cursor extends PagePosition {
  queryHash: string;
}
const positionSchema = z
  .object({
    version: z.literal(2),
    asOf: z.string().datetime({ offset: true }),
    after: z
      .object({
        id: z.string().uuid(),
        createdAt: z.string().datetime({ offset: true }),
        priceCents: z.number().int().min(0).max(10000000000),
        areaM2: z.number().positive().max(500).nullable(),
        spaceCount: z.number().int().min(1).max(500),
      })
      .strict(),
  })
  .strict();
const cursorSchema = positionSchema
  .extend({ queryHash: z.string().regex(/^[a-f0-9]{64}$/) })
  .strict();
export function canonicalFilters(f: PageFilters): Required<PageFilters> {
  return {
    query: f.query,
    type: f.type,
    transactionType: f.transactionType ?? "sale",
    maxPrice: f.maxPrice,
    minArea: f.minArea,
    sort: f.sort,
    scene: f.scene,
    minPrice: f.minPrice ?? null,
    covered: f.covered ?? null,
    closed: f.closed ?? null,
    occupancy: f.occupancy ?? null,
    level: f.level ?? null,
    bbox: f.bbox ?? null,
    center: f.center ?? null,
    radiusKm: f.radiusKm ?? null,
    ids: f.ids ? [...new Set(f.ids)].sort() : null,
  };
}
const queryHash = (filters: PageFilters) =>
  createHash("sha256")
    .update(JSON.stringify(canonicalFilters(filters)))
    .digest("hex");
const invalid = () => {
  throw new ApiError(400, "Filtres de recherche invalides.");
};
export function parsePageQuery(url: URL) {
  const p = url.searchParams;
  const numeric = (
    name: string,
    low: number,
    high: number,
    integer = false,
    alias?: string,
  ) => {
    const raw = p.get(name) ?? (alias ? p.get(alias) : null);
    if (raw === null) return null;
    if (!raw.trim()) return invalid();
    const n = Number(raw);
    if (
      !Number.isFinite(n) ||
      n < low ||
      n > high ||
      (integer && !Number.isSafeInteger(n))
    )
      return invalid();
    return n;
  };
  const bool = (name: string) => {
    const s = p.get(name);
    if (s === null) return null;
    if (s === "1" || s === "true") return true;
    if (s === "0" || s === "false") return false;
    return invalid();
  };
  const tuple = (name: string, length: number) => {
    const raw = p.get(name);
    if (raw === null) return null;
    const parts = raw.split(",");
    if (
      parts.length !== length ||
      parts.some((x) => !x.trim() || !Number.isFinite(Number(x)))
    )
      return invalid();
    const v = parts.map(Number);
    if (
      v.some(
        (x, i) => x < -(i % 2 === 0 ? 180 : 90) || x > (i % 2 === 0 ? 180 : 90),
      )
    )
      return invalid();
    return v;
  };
  const sort = p.get("sort") || "recent",
    type = p.get("type") || null,
    transactionType = p.get("transactionType") ?? "sale",
    limit = numeric("limit", 1, 50, true) ?? 24;
  if (
    !["recent", "price_asc", "price_desc", "area_asc", "spaces_desc"].includes(
      sort,
    ) ||
    (type && !["covered", "box", "outdoor", "mixed"].includes(type)) ||
    !["sale", "rent"].includes(transactionType) ||
    p.getAll("transactionType").length > 1
  )
    invalid();
  const occupancy = p.get("occupancy");
  if (
    occupancy !== null &&
    !["vacant", "occupied", "unknown"].includes(occupancy)
  )
    invalid();
  const minPrice = numeric("priceMin", 0, 10000000000, true),
    maxPrice =
      numeric("priceMax", 0, 10000000000, true, "maxPrice") ??
      numeric("maxPriceCents", 0, 10000000000, true),
    bbox = tuple("bbox", 4) as PageFilters["bbox"],
    center = tuple("center", 2) as PageFilters["center"],
    radiusKm = numeric("radiusKm", 0.1, 200);
  if (
    (minPrice !== null && maxPrice !== null && minPrice > maxPrice) ||
    (bbox && bbox[1] > bbox[3]) ||
    Boolean(center) !== (radiusKm !== null)
  )
    invalid();
  let ids: string[] | null = null;
  if (p.has("ids")) {
    const list = p.get("ids")!.split(",");
    if (
      list.length > 100 ||
      list.some((id) => !z.string().uuid().safeParse(id).success)
    )
      invalid();
    ids = [...new Set(list.map((id) => id.toLowerCase()))].sort();
  }
  const filters: PageFilters = {
    query: (p.get("q") || p.get("city") || "").trim().slice(0, 200),
    type,
    transactionType: transactionType as TransactionType,
    maxPrice,
    minArea: numeric("areaMin", 0, 500, false, "minArea"),
    sort: sort as PageFilters["sort"],
    scene: bool("scene") ?? false,
    minPrice,
    covered: bool("covered"),
    closed: bool("closed"),
    occupancy: occupancy as PageFilters["occupancy"],
    level: numeric("level", -20, 50, true),
    bbox,
    center,
    radiusKm,
    ids,
  };
  return { filters, limit, cursor: decodeCursor(p.get("cursor"), filters) };
}
export function decodeCursor(
  encoded: string | null,
  filters: PageFilters,
): Cursor | null {
  if (!encoded) return null;
  if (encoded.length > 2048 || !/^[a-zA-Z0-9_-]+$/.test(encoded))
    throw new ApiError(400, "Curseur de recherche invalide.", "INVALID_CURSOR");
  try {
    const value = cursorSchema.parse(
      JSON.parse(Buffer.from(encoded, "base64url").toString("utf8")),
    );
    if (
      value.queryHash !== queryHash(filters) ||
      Date.parse(value.asOf) > Date.now() + 300000 ||
      Date.parse(value.asOf) < Date.now() - 86400000
    )
      throw Error();
    return value;
  } catch {
    throw new ApiError(
      400,
      "Cette recherche a changé ou a expiré. Relancez-la.",
      "INVALID_CURSOR",
    );
  }
}
export function encodeCursor(
  position: PagePosition | null,
  filters: PageFilters,
) {
  return position
    ? Buffer.from(
        JSON.stringify({ ...position, queryHash: queryHash(filters) }),
      ).toString("base64url")
    : null;
}
export function minimumUnitArea(
  listing: Pick<Listing, "spaces">,
): number | null {
  return listing.spaces.length && listing.spaces.every((s) => s.areaM2 !== null)
    ? Math.min(...listing.spaces.map((s) => s.areaM2!))
    : null;
}
export function publicDistanceKm(a: [number, number], b: [number, number]) {
  const rad = Math.PI / 180;
  const h =
    Math.sin(((a[1] - b[1]) * rad) / 2) ** 2 +
    Math.cos(a[1] * rad) *
      Math.cos(b[1] * rad) *
      Math.sin(((a[0] - b[0]) * rad) / 2) ** 2;
  return 6371.0088 * 2 * Math.asin(Math.sqrt(Math.min(1, Math.max(0, h))));
}
export function matchesPageFilters(item: Listing, filters: PageFilters) {
  const f = canonicalFilters(filters),
    [lon, lat] = item.coordinates;
  const types =
    item.type === "mixed"
      ? item.spaces.map(
          (s) => item.commercialDetails?.units[s.id]?.type ?? null,
        )
      : [item.type];
  return (
    (item.transactionType ?? "sale") === f.transactionType &&
    (f.minPrice === null || item.priceCents >= f.minPrice) &&
    (f.covered === null ||
      types.every((t) => t === "covered" || t === "box") === f.covered) &&
    (f.closed === null || types.every((t) => t === "box") === f.closed) &&
    (f.occupancy === null || (item.occupancy ?? "unknown") === f.occupancy) &&
    (f.level === null || item.spaces.some((s) => s.level === f.level)) &&
    (!f.ids || f.ids.includes(item.id)) &&
    (!f.bbox ||
      (lat >= f.bbox[1] &&
        lat <= f.bbox[3] &&
        (f.bbox[0] <= f.bbox[2]
          ? lon >= f.bbox[0] && lon <= f.bbox[2]
          : lon >= f.bbox[0] || lon <= f.bbox[2]))) &&
    (!f.center || publicDistanceKm(item.coordinates, f.center) <= f.radiusKm!)
  );
}
export function localCatalogPage(
  filters: PageFilters,
  limit: number,
  cursor: Cursor | null,
) {
  initializeLocalParkingRegistry();
  const sql = db(),
    asOf = cursor?.asOf || new Date().toISOString();
  const publicationTimes = new Map(
    sql
      .prepare(
        "SELECT id,published_at FROM listings WHERE public_json IS NOT NULL",
      )
      .all()
      .map((r) => [String(r.id), String(r.published_at)]),
  );
  let items = listPublicListings({
    q: filters.query || undefined,
    type: filters.type || undefined,
    maxPrice: filters.maxPrice ?? undefined,
    minArea: filters.minArea ?? undefined,
  }).filter(
    (item) =>
      (!filters.scene || item.sceneAvailable) &&
      Date.parse(publicationTimes.get(item.id)!) <= Date.parse(asOf) &&
      matchesPageFilters(item, filters),
  );
  const created = (l: Listing) => publicationTimes.get(l.id)!;
  const key = (l: Listing) => ({
    id: l.id,
    createdAt: created(l),
    priceCents: l.priceCents,
    areaM2: minimumUnitArea(l),
    spaceCount: l.spaces.length,
  });
  const compare = (a: PagePosition["after"], b: PagePosition["after"]) => {
    const diff =
      filters.sort === "price_asc"
        ? a.priceCents - b.priceCents
        : filters.sort === "price_desc"
          ? b.priceCents - a.priceCents
          : filters.sort === "spaces_desc"
            ? b.spaceCount - a.spaceCount
            : filters.sort === "area_asc"
              ? a.areaM2 === null
                ? b.areaM2 === null
                  ? 0
                  : 1
                : b.areaM2 === null
                  ? -1
                  : a.areaM2 - b.areaM2
              : Date.parse(b.createdAt) - Date.parse(a.createdAt);
    return diff || a.id.localeCompare(b.id);
  };
  items.sort((a, b) => compare(key(a), key(b)));
  const total = items.length;
  if (cursor)
    items = items.filter((item) => compare(key(item), cursor.after) > 0);
  const page = items.slice(0, limit),
    last = page.at(-1);
  const position: PagePosition | null =
    items.length > limit && last
      ? { version: 2, asOf, after: key(last) }
      : null;
  return { items: page, total, nextCursor: encodeCursor(position, filters) };
}
