import { createHash } from "node:crypto";
import {
  validateCommercialDetails,
  emptyCommercialDetails,
} from "@/lib/commercial-details";
import type { Listing } from "@/lib/types";
import { sceneDB } from "./scenes/local";
import { ApiError } from "./security";
export function locationHash(value: Listing) {
  return createHash("sha256")
    .update(
      JSON.stringify([
        value.city,
        value.district,
        value.address ?? null,
        value.locationPrecision,
        value.coordinates,
        value.publicCoordinates ?? null,
      ]),
    )
    .digest("hex");
}
export function validateLocalCommercial(
  value: Listing,
  actorId: string,
  submitting = false,
) {
  try {
    const docs = new Set(
      sceneDB()
        .prepare(
          "SELECT id FROM scene_sources WHERE listing_id=? AND owner_id=?",
        )
        .all(value.id, actorId)
        .map((r) => String(r.id)),
    );
    validateCommercialDetails(
      value.commercialDetails ?? emptyCommercialDetails(),
      value,
      docs,
      submitting,
    );
  } catch (error) {
    throw new ApiError(
      400,
      error instanceof Error ? error.message : "Détails invalides.",
      "COMMERCIAL_INVALID",
    );
  }
}
export function stageLocalLocation(
  value: Listing,
  previous: Listing | undefined,
  input: { locationConfirmedAt?: string | null },
  previousHash: unknown,
) {
  const next = { ...value };
  let hash = typeof previousHash === "string" ? previousHash : null;
  if (!previous || locationHash(value) !== locationHash(previous)) {
    next.locationConfirmedAt = null;
    hash = null;
  } else if (input.locationConfirmedAt === null) {
    next.locationConfirmedAt = null;
    hash = null;
  } else if (input.locationConfirmedAt !== undefined) {
    next.locationConfirmedAt =
      input.locationConfirmedAt === previous.locationConfirmedAt &&
      hash === locationHash(value)
        ? previous.locationConfirmedAt
        : new Date().toISOString();
    hash = locationHash(value);
  } else if (hash !== locationHash(value)) {
    next.locationConfirmedAt = null;
    hash = null;
  }
  return { listing: next, hash };
}
