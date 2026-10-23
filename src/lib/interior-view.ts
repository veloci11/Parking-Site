import { z } from "zod";
import type { Listing } from "./types";
export const interiorCameraSchema = z
  .object({
    position: z.tuple([
      z.number().finite().min(-1000).max(1000),
      z.number().finite().min(-1000).max(1000),
      z.number().finite().min(-1000).max(1000),
    ]),
    target: z.tuple([
      z.number().finite().min(-250).max(250),
      z.number().finite().min(-250).max(250),
      z.number().finite().min(-250).max(250),
    ]),
  })
  .strict()
  .refine(
    (value) =>
      Math.hypot(...value.position.map((n, i) => n - value.target[i])) >= 0.1,
    "Camera too close to target",
  );
export type InteriorCamera = z.infer<typeof interiorCameraSchema>;
export function readInteriorSelection(search: string, listing: Listing) {
  const params = new URLSearchParams(search),
    fallback =
      listing.spaces.find((space) => space.levelKnown !== false)?.level ?? 0;
  if (params.get("parking") !== listing.id)
    return { level: fallback, unit: null as string | null };
  const raw = params.get("floor"),
    parsed = raw !== null && /^-?\d+$/.test(raw) ? Number(raw) : fallback;
  const level = listing.spaces.some(
    (space) => space.levelKnown !== false && space.level === parsed,
  )
    ? parsed
    : fallback;
  const unit = params.get("unit");
  return {
    level,
    unit: listing.spaces.some(
      (space) =>
        space.id === unit &&
        (space.levelKnown === false || space.level === level),
    )
      ? unit
      : null,
  };
}
export function writeInteriorSelection(
  search: string,
  listing: Listing,
  level: number,
  unit: string | null,
) {
  const params = new URLSearchParams(search);
  params.set("parking", listing.id);
  const selected = listing.spaces.find((space) => space.id === unit);
  if (
    selected?.levelKnown === false ||
    !listing.spaces.some(
      (space) => space.levelKnown !== false && space.level === level,
    )
  )
    params.delete("floor");
  else params.set("floor", String(level));
  if (
    unit &&
    listing.spaces.some(
      (space) =>
        space.id === unit &&
        (space.levelKnown === false || space.level === level),
    )
  )
    params.set("unit", unit);
  else params.delete("unit");
  return params;
}
export function interiorCameraKey(
  listingId: string,
  level: number,
  version: string,
) {
  return `gp:interior-camera:v1:${listingId}:${level}:${version}`;
}
