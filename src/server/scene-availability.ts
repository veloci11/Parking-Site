import type { Listing } from "@/lib/types";
import { localPublicParking } from "./parking-registry";
import { getLocalPublicScene } from "./scenes/local";
import { sceneDB } from "./scenes/local";
import { existsSync } from "node:fs";

/** Mirrors the viewer: a canonical group permits only its explicitly published common plans. */
export function localEffectiveSceneAvailable(
  listing: Listing,
  publicSnapshots?: Listing[],
): boolean {
  if (
    listing.locationPrecision !== "exact_opt_in" ||
    listing.spaces.some((space) => space.levelKnown === false)
  )
    return false;
  const group = localPublicParking(undefined, listing.id, publicSnapshots);
  if (group) return group.levels.some((level) => level.commonPlan != null);
  const scene = getLocalPublicScene(listing.id);
  if (!scene) return false;
  const sql = sceneDB(),
    row = sql
      .prepare("SELECT evidence_ids FROM scene_models WHERE id=?")
      .get(scene.id);
  const evidence = JSON.parse(String(row?.evidence_ids || "[]")) as string[];
  return (
    evidence.length > 0 &&
    evidence.every((id) => {
      const source = sql
        .prepare(
          "SELECT object_key FROM scene_sources WHERE id=? AND listing_id=? AND processing_state='ready'",
        )
        .get(id, listing.id);
      return !!source && existsSync(String(source.object_key));
    })
  );
}
