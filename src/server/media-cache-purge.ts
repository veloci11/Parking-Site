/** Private operator workflow. This module has no application route or Storage deletion API. */
import { createHash, randomUUID } from "node:crypto";
import { z } from "zod";

export const MEDIA_CACHE_PURGE_LIMIT = 120;
const uuid = z
  .string()
  .uuid()
  .transform((value) => value.toLowerCase());
const digest = z.string().regex(/^[a-f0-9]{64}$/);
const listingSchema = z
  .object({
    id: uuid,
    seller_id: uuid,
    lifecycle_state: z.string(),
    row_version: z.number().int().positive(),
    updated_at: z.string().min(1).max(100),
  })
  .strict();
const mediaSchema = z
  .object({
    id: uuid,
    owner_id: uuid,
    listing_id: uuid,
    object_key: z.string().max(200),
    mime: z.literal("image/webp"),
  })
  .strict();
const snapshotSchema = z
  .object({
    listing: listingSchema,
    published: z.literal(false),
    media: z.array(mediaSchema).min(1).max(MEDIA_CACHE_PURGE_LIMIT),
  })
  .strict();
const planSchema = z
  .object({
    version: z.literal(1),
    intent: z.literal("queue-public-approved-media-cdn-invalidation"),
    planId: uuid,
    createdAt: z.string().datetime(),
    projectFingerprint: digest,
    snapshot: snapshotSchema,
  })
  .strict();
export type MediaCachePurgePlan = z.infer<typeof planSchema>;
export type MediaCachePurgeSnapshot = z.infer<typeof snapshotSchema>;
export interface MediaCachePurgeAdapter {
  readSnapshot(listingId: string): Promise<unknown>;
  /** Must accept only this exact bucket/path; no bucket purge or object removal. */
  purgeObject(
    bucket: "public-approved",
    name: string,
  ): Promise<"queued" | "unsupported" | "forbidden" | "failed">;
  /** Persist a private, exclusive local receipt before any cache action. */
  consumePlan(planHash: string, reason: string): Promise<void>;
}
export class MediaCachePurgeError extends Error {
  constructor(
    public readonly code: string,
    public readonly queuedCount = 0,
  ) {
    super(code);
    this.name = "MediaCachePurgeError";
  }
}
export function mediaCacheDigest(value: string) {
  return createHash("sha256").update(value).digest("hex");
}
function refuse(code: string): never {
  throw new MediaCachePurgeError(code);
}
function reviewedSnapshot(raw: unknown, listingId: string) {
  if (
    raw &&
    typeof raw === "object" &&
    "listing" in raw &&
    raw.listing === null
  )
    refuse("LISTING_NOT_FOUND");
  if (
    raw &&
    typeof raw === "object" &&
    "published" in raw &&
    raw.published === true
  )
    refuse("LISTING_STILL_PUBLISHED");
  const parsed = snapshotSchema.safeParse(raw);
  if (!parsed.success) refuse("UNSAFE_OR_INCOMPLETE_MEDIA_SNAPSHOT");
  const snapshot = parsed.data;
  if (snapshot.listing.id !== listingId) refuse("LISTING_ID_MISMATCH");
  if (
    !["withdrawn", "sold", "paused", "suspended", "expired"].includes(
      snapshot.listing.lifecycle_state,
    )
  )
    refuse("WITHDRAWN_LISTING_REQUIRED");
  const ids = new Set<string>();
  for (const media of snapshot.media) {
    if (
      ids.has(media.id) ||
      media.listing_id !== listingId ||
      media.owner_id !== snapshot.listing.seller_id ||
      media.object_key !== `${media.owner_id}/${listingId}/${media.id}.webp`
    )
      refuse("UNSAFE_MEDIA_METADATA");
    ids.add(media.id);
  }
  snapshot.media.sort((a, b) => a.id.localeCompare(b.id));
  return snapshot;
}
async function readSnapshot(
  adapter: MediaCachePurgeAdapter,
  listingId: string,
) {
  let raw: unknown;
  try {
    raw = await adapter.readSnapshot(listingId);
  } catch {
    refuse("PREFLIGHT_READ_FAILED");
  }
  return reviewedSnapshot(raw, listingId);
}
export function mediaCachePlanHash(plan: MediaCachePurgePlan) {
  return mediaCacheDigest(JSON.stringify(plan));
}
export function parseMediaCachePurgePlan(raw: unknown) {
  const parsed = planSchema.safeParse(raw);
  if (!parsed.success) refuse("INVALID_PRIVATE_PLAN");
  const plan = parsed.data;
  plan.snapshot = reviewedSnapshot(plan.snapshot, plan.snapshot.listing.id);
  return plan;
}
export async function prepareMediaCachePurge(
  adapter: MediaCachePurgeAdapter,
  listingId: string,
  projectFingerprint: string,
) {
  const id = uuid.safeParse(listingId);
  if (!id.success) refuse("INVALID_LISTING_ID");
  if (!digest.safeParse(projectFingerprint).success)
    refuse("INVALID_PROJECT_FINGERPRINT");
  const plan: MediaCachePurgePlan = {
    version: 1,
    intent: "queue-public-approved-media-cdn-invalidation",
    planId: randomUUID(),
    createdAt: new Date().toISOString(),
    projectFingerprint,
    snapshot: await readSnapshot(adapter, id.data),
  };
  return { plan, planHash: mediaCachePlanHash(plan) };
}
export async function executeMediaCachePurge(
  adapter: MediaCachePurgeAdapter,
  rawPlan: unknown,
  options: {
    execute?: boolean;
    expectedHash?: string;
    reason?: string;
    projectFingerprint: string;
  },
) {
  const plan = parseMediaCachePurgePlan(rawPlan);
  const planHash = mediaCachePlanHash(plan);
  if (options.projectFingerprint !== plan.projectFingerprint)
    refuse("PROJECT_MISMATCH");
  if (options.execute !== true)
    return {
      dryRun: true,
      planHash,
      objectCount: plan.snapshot.media.length,
      queuedCount: 0,
      globallyRevoked: false,
    };
  if (
    !digest.safeParse(options.expectedHash).success ||
    options.expectedHash !== planHash
  )
    refuse("REVIEWED_PLAN_HASH_REQUIRED");
  const reason = z
    .string()
    .trim()
    .min(15)
    .max(500)
    .refine((value) => !/[\r\n\x00-\x1f\x7f]/.test(value))
    .safeParse(options.reason);
  if (!reason.success) refuse("EXECUTION_REASON_REQUIRED");
  const listingId = plan.snapshot.listing.id;
  const expectedSnapshot = JSON.stringify(plan.snapshot);
  const preflight = async () => {
    if (
      JSON.stringify(await readSnapshot(adapter, listingId)) !==
      expectedSnapshot
    )
      refuse("PLAN_STATE_CHANGED");
  };
  await preflight();
  try {
    await adapter.consumePlan(planHash, reason.data);
  } catch {
    refuse("PLAN_ALREADY_USED_OR_RECEIPT_UNAVAILABLE");
  }
  let queuedCount = 0;
  try {
    for (const media of plan.snapshot.media) {
      await preflight();
      const outcome = await adapter.purgeObject(
        "public-approved",
        `${media.id}.webp`,
      );
      if (outcome === "unsupported") refuse("CDN_PURGE_UNSUPPORTED");
      if (outcome === "forbidden")
        refuse("CDN_PURGE_FORBIDDEN_CHECK_SECRET_AND_PLAN");
      if (outcome !== "queued") refuse("CDN_PURGE_ACKNOWLEDGEMENT_UNCONFIRMED");
      queuedCount++;
    }
  } catch (error) {
    throw new MediaCachePurgeError(
      error instanceof MediaCachePurgeError
        ? error.code
        : "CDN_PURGE_ACKNOWLEDGEMENT_UNCONFIRMED",
      queuedCount,
    );
  }
  return {
    dryRun: false,
    planHash,
    objectCount: plan.snapshot.media.length,
    queuedCount,
    status: "invalidation_queued",
    globallyRevoked: false,
    browserCachesInvalidated: false,
  };
}
