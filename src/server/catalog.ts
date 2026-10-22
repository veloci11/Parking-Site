import { publicCommercialDetails } from "@/lib/commercial-details";
import { publicConditions } from "@/lib/condition-observations";
import { idfListingProblem } from "@/lib/paris-region";
import { normalizeListingOffers, catalogOfferMatch } from "@/lib/listing-price";
import type { Listing, Quality, Space } from "@/lib/types";
import { db } from "./db";
import { localEffectiveSceneAvailable } from "./scene-availability";
import { initializeLocalParkingRegistry } from "./parking-registry";
import { publicSpacePhotos } from "./media-links";
export function publicQuality(q: Quality): Quality {
  return {
    floor: q.floor,
    lighting: q.lighting,
    humidity: q.humidity,
    access: q.access,
    maneuver: q.maneuver,
    observations: q.observations,
    observedAt: q.observedAt ?? null,
    basis: q.basis ?? "unknown",
  };
}
export function publicUnitQuality(
  value: Pick<Listing, "id" | "spaces" | "unitQuality">,
): Record<string, Quality> {
  const result: Record<string, Quality> = {};
  value.spaces.forEach((space, index) => {
    const q = value.unitQuality?.[space.id];
    if (q) result[`${value.id}:unit:${index + 1}`] = publicQuality(q);
  });
  return result;
}
export function publicProjection(value: Listing): Listing {
  value = normalizeListingOffers(value);
  const spaces: Space[] = value.spaces.map((s, i) => ({
    id: `${value.id}:unit:${i + 1}`,
    number: s.number,
    level: s.level,
    areaM2: s.areaM2,
    lengthM: s.lengthM,
    widthM: s.widthM,
    clearanceM: s.clearanceM,
    ...(value.pricingMode === "per_space" && s.offer
      ? { offer: { ...s.offer } }
      : {}),
  }));
  const q = value.quality;
  const quality: Quality = {
    floor: q.floor,
    lighting: q.lighting,
    humidity: q.humidity,
    access: q.access,
    maneuver: q.maneuver,
    observations: q.observations,
    observedAt: q.observedAt ?? null,
    basis: q.basis ?? "unknown",
  };
  return {
    id: value.id,
    slug: value.slug,
    title: value.title,
    description: value.description,
    city: value.city,
    district: value.district,
    priceCents: value.priceCents,
    transactionType: value.transactionType ?? "sale",
    ...(value.pricingMode ? { pricingMode: value.pricingMode } : {}),
    type: value.type,
    spaces,
    photos: [...value.photos],
    spacePhotos: publicSpacePhotos(value),
    quality,
    unitQuality: publicUnitQuality(value),
    conditionObservations: publicConditions(value),
    commercialDetails: publicCommercialDetails(value),
    locationConfirmedAt: value.locationConfirmedAt ?? null,
    ...(value.publicCoordinates
      ? { publicCoordinates: [...value.publicCoordinates] as [number, number] }
      : {}),
    locationPrecision: value.locationPrecision,
    coordinates:
      value.locationPrecision === "area" && value.publicCoordinates
        ? [...value.publicCoordinates]
        : value.locationPrecision === "area"
          ? [
              Math.round(value.coordinates[0] * 100) / 100,
              Math.round(value.coordinates[1] * 100) / 100,
            ]
          : [...value.coordinates],
    sceneAvailable:
      value.locationPrecision === "exact_opt_in" && value.sceneAvailable,
    isDemo: value.isDemo,
    status: "published",
    version: value.version,
    sellerName: value.sellerName,
    sellerTypeSnapshot:
      value.sellerTypeSnapshot === "private" ||
      value.sellerTypeSnapshot === "professional"
        ? value.sellerTypeSnapshot
        : null,
    createdAt: value.createdAt,
    updatedAt: value.updatedAt,
    ...(value.locationPrecision === "exact_opt_in" && value.address
      ? { address: value.address }
      : {}),
    ...(value.occupancy ? { occupancy: value.occupancy } : {}),
    ...(value.annualChargesCents !== undefined
      ? { annualChargesCents: value.annualChargesCents }
      : {}),
    ...(value.propertyTaxCents !== undefined
      ? { propertyTaxCents: value.propertyTaxCents }
      : {}),
    ...(value.observedAt !== undefined ? { observedAt: value.observedAt } : {}),
  };
}
export interface CatalogQuery {
  q?: string;
  city?: string;
  type?: string;
  maxPrice?: number;
  minArea?: number;
  sort?: string;
  ids?: string[];
}
/** Public snapshots without derived scene flags; used by the canonical parking projection. */
export function listPublicListingSnapshots(): Listing[] {
  return db()
    .prepare(
      "SELECT l.public_json FROM listings l JOIN users u ON u.id=l.seller_id WHERE l.public_json IS NOT NULL AND l.status NOT IN ('sold','withdrawn','paused','expired','suspended') AND u.status='active' ORDER BY l.created_at DESC,l.id ASC",
    )
    .all()
    .map((r) => JSON.parse(String(r.public_json)) as Listing)
    .filter(
      (value) =>
        (!value.availabilityExpiresAt ||
          Date.parse(value.availabilityExpiresAt) > Date.now()) &&
        !idfListingProblem(value),
    )
    .map(publicProjection);
}
export function listPublicListings(query: CatalogQuery = {}): Listing[] {
  initializeLocalParkingRegistry();
  const snapshots = listPublicListingSnapshots();
  let listings = snapshots.map((value) => ({
    ...value,
    sceneAvailable: localEffectiveSceneAvailable(value, snapshots),
  }));
  const fold = (s: string) =>
    s
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase();
  if (query.q)
    listings = listings.filter((l) =>
      fold(`${l.city} ${l.district} ${l.title}`).includes(fold(query.q!)),
    );
  if (query.city)
    listings = listings.filter((l) => fold(l.city).includes(fold(query.city!)));
  if (query.type || query.maxPrice !== undefined || query.minArea !== undefined)
    listings = listings.filter(
      (l) =>
        l.pricingMode !== "per_space" ||
        catalogOfferMatch(l, {
          type: query.type,
          maxPrice: query.maxPrice,
          minArea: query.minArea,
          transactionType: l.transactionType,
        }) !== null,
    );
  if (query.type)
    listings = listings.filter(
      (l) =>
        l.pricingMode === "per_space" ||
        l.type === query.type ||
        (l.type === "mixed" &&
          l.spaces.some(
            (s) => l.commercialDetails?.units[s.id]?.type === query.type,
          )),
    );
  if (query.maxPrice !== undefined)
    listings = listings.filter(
      (l) => l.pricingMode === "per_space" || l.priceCents <= query.maxPrice!,
    );
  if (query.minArea !== undefined)
    listings = listings.filter(
      (l) =>
        l.pricingMode === "per_space" ||
        l.spaces.every((s) => s.areaM2 !== null && s.areaM2 >= query.minArea!),
    );
  if (query.ids) listings = listings.filter((l) => query.ids!.includes(l.id));
  if (query.sort === "price_asc")
    listings.sort(
      (a, b) => a.priceCents - b.priceCents || a.id.localeCompare(b.id),
    );
  if (query.sort === "price_desc")
    listings.sort(
      (a, b) => b.priceCents - a.priceCents || a.id.localeCompare(b.id),
    );
  return listings;
}
export function getPublicListing(id: string): Listing | null {
  return listPublicListings().find((l) => l.id === id) || null;
}
/** SSR entry point: production always reads the curated Supabase projection; no local seed fallback. */
export async function loadPublicListing(id: string): Promise<Listing | null> {
  if (
    process.env.NEXT_PUBLIC_SUPABASE_URL &&
    (process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) &&
    process.env.GP_FORCE_LOCAL_DEMO !== "true"
  ) {
    const { createClient } = await import("@supabase/supabase-js");
    const client = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      (process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY)!,
      { auth: { persistSession: false, autoRefreshToken: false } },
    );
    const { data, error } = await client
      .from("published_listings")
      .select("payload")
      .eq("id", id)
      .maybeSingle();
    if (error) throw new Error("Public catalogue unavailable");
    if (!data) return null;
    const scene = await client.rpc("gp_effective_scene_available", {
      p_listing_id: id,
    });
    if (scene.error) throw new Error("Public scene catalogue unavailable");
    return { ...data.payload, sceneAvailable: !!scene.data } as Listing;
  }
  if (
    process.env.NODE_ENV === "production" &&
    process.env.GP_LOCAL_DEMO !== "true"
  )
    throw new Error("Production backend not configured");
  return getPublicListing(id);
}
