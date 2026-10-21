import { createHash } from "node:crypto";
import { z } from "zod";
import { ApiError } from "./security";
import { db } from "./db";
import { listPublicListings } from "./catalog";
import type { Listing } from "@/lib/types";
export interface PageFilters {
  query: string;
  type: string | null;
  maxPrice: number | null;
  minArea: number | null;
  sort: "recent" | "price_asc" | "price_desc";
  scene: boolean;
}
export interface PagePosition {
  version: 1;
  asOf: string;
  after: { id: string; createdAt: string; priceCents: number };
}
interface Cursor extends PagePosition {
  queryHash: string;
}
const positionSchema = z
  .object({
    version: z.literal(1),
    asOf: z.string().datetime({ offset: true }),
    after: z
      .object({
        id: z.string().uuid(),
        createdAt: z.string().datetime({ offset: true }),
        priceCents: z.number().int().min(0).max(10000000000),
      })
      .strict(),
  })
  .strict();
const cursorSchema = positionSchema
  .extend({ queryHash: z.string().regex(/^[a-f0-9]{64}$/) })
  .strict();
const queryHash = (filters: PageFilters) =>
  createHash("sha256").update(JSON.stringify(filters)).digest("hex");
export function parsePageQuery(url: URL) {
  const p = url.searchParams;
  const maximum =
    p.get("priceMax") ?? p.get("maxPrice") ?? p.get("maxPriceCents");
  const minimum = p.get("areaMin") ?? p.get("minArea");
  const sort = p.get("sort") || "recent",
    type = p.get("type") || null,
    limit = Number(p.get("limit") || 24);
  if (
    !["recent", "price_asc", "price_desc"].includes(sort) ||
    (type && !["covered", "box", "outdoor"].includes(type)) ||
    !Number.isInteger(limit) ||
    limit < 1 ||
    limit > 50
  )
    throw new ApiError(400, "Filtres de recherche invalides.");
  const price = maximum === null ? null : Number(maximum),
    area = minimum === null ? null : Number(minimum);
  if (
    (price !== null &&
      (!Number.isSafeInteger(price) || price < 0 || price > 10000000000)) ||
    (area !== null && (!Number.isFinite(area) || area < 0 || area > 500))
  )
    throw new ApiError(400, "Budget ou surface invalide.");
  const filters: PageFilters = {
    query: (p.get("q") || p.get("city") || "").trim().slice(0, 200),
    type,
    maxPrice: price,
    minArea: area,
    sort: sort as PageFilters["sort"],
    scene: p.get("scene") === "1",
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
      new Date(value.asOf).getTime() > Date.now() + 300000 ||
      new Date(value.asOf).getTime() < Date.now() - 86400000
    )
      throw new Error();
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
  if (!position) return null;
  return Buffer.from(
    JSON.stringify({ ...position, queryHash: queryHash(filters) }),
  ).toString("base64url");
}
export function localCatalogPage(
  filters: PageFilters,
  limit: number,
  cursor: Cursor | null,
) {
  const sql = db();
  const asOf = cursor?.asOf || new Date().toISOString();
  const publicationTimes = new Map(
    sql
      .prepare(
        "SELECT id,published_at FROM listings WHERE public_json IS NOT NULL",
      )
      .all()
      .map((row) => [String(row.id), String(row.published_at)]),
  );
  let items = listPublicListings({
    q: filters.query || undefined,
    type: filters.type || undefined,
    maxPrice: filters.maxPrice ?? undefined,
    minArea: filters.minArea ?? undefined,
  });
  items = items.filter(
    (item) =>
      (!filters.scene || item.sceneAvailable) &&
      Date.parse(publicationTimes.get(item.id)!) <= Date.parse(asOf),
  );
  const created = (l: Listing) => publicationTimes.get(l.id)!;
  items.sort((a, b) =>
    filters.sort === "price_asc"
      ? a.priceCents - b.priceCents || a.id.localeCompare(b.id)
      : filters.sort === "price_desc"
        ? b.priceCents - a.priceCents || a.id.localeCompare(b.id)
        : Date.parse(created(b)) - Date.parse(created(a)) ||
          a.id.localeCompare(b.id),
  );
  const total = items.length;
  if (cursor) {
    const key = cursor.after;
    items = items.filter((item) =>
      filters.sort === "price_asc"
        ? item.priceCents > key.priceCents ||
          (item.priceCents === key.priceCents && item.id > key.id)
        : filters.sort === "price_desc"
          ? item.priceCents < key.priceCents ||
            (item.priceCents === key.priceCents && item.id > key.id)
          : Date.parse(created(item)) < Date.parse(key.createdAt) ||
            (Date.parse(created(item)) === Date.parse(key.createdAt) &&
              item.id > key.id),
    );
  }
  const page = items.slice(0, limit),
    last = page.at(-1);
  const position: PagePosition | null =
    items.length > limit && last
      ? {
          version: 1,
          asOf,
          after: {
            id: last.id,
            createdAt: created(last),
            priceCents: last.priceCents,
          },
        }
      : null;
  return { items: page, total, nextCursor: encodeCursor(position, filters) };
}
