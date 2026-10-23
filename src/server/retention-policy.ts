import { z } from "zod";

export const retentionKind = z.enum(["account", "draft", "media", "source"]);
export const retentionRules = z
  .object({
    account: z.number().int().min(0).max(3155760000),
    draft: z.number().int().min(0).max(3155760000),
    media: z.number().int().min(0).max(3155760000),
    source: z.number().int().min(0).max(3155760000),
  })
  .strict();
export const retentionPolicy = z
  .object({
    key: z.string().regex(/^[a-z0-9_-]{3,80}$/),
    version: z.number().int().positive(),
    rules: retentionRules,
    validated: z.literal(true),
    operatorReference: z.string().trim().min(5).max(200),
    reason: z.string().trim().min(15).max(2000),
  })
  .strict();
const storageObject = z
  .object({
    bucket: z.enum([
      "private-uploads",
      "public-approved",
      "scene-sources",
      "private-exports",
    ]),
    storageFingerprint: z.string().regex(/^[a-f0-9]{64}$/),
    name: z
      .string()
      .min(1)
      .max(1024)
      .refine(
        (name) =>
          !name.startsWith("/") &&
          !name.includes("\\") &&
          !name
            .split("/")
            .some((part) => part === ".." || part === "." || !part),
      ),
  })
  .strict();
const claimSchema = z.object({
  id: z.string().uuid(),
  kind: retentionKind,
  state: z.enum(["purging", "auth_pending"]),
  userId: z.string().uuid().nullable(),
  version: z.number().int().positive(),
  leaseToken: z.string().uuid(),
  objects: z.array(storageObject).max(1000),
});
export interface RetentionAdapter {
  rpc(name: string, args: Record<string, unknown>): Promise<unknown>;
  removeObject(bucket: string, name: string): Promise<void>;
  authUserExists(id: string): Promise<boolean>;
  deleteAuthUser(id: string): Promise<void>;
}
/** Operator-only adapter. No credentials, default policy or application endpoint lives here. */
export async function executeRetentionJob(
  adapter: RetentionAdapter,
  jobId: string,
  expectedVersion: number,
) {
  z.string().uuid().parse(jobId);
  z.number().int().positive().parse(expectedVersion);
  const raw = await adapter.rpc("gp_retention_claim", {
    p_job: jobId,
    p_expected_version: expectedVersion,
  });
  const replay = z
    .object({
      state: z.literal("completed"),
      activeSystemErased: z.literal(true),
      completeErasure: z.literal(false),
    })
    .safeParse(raw);
  if (replay.success) return replay.data;
  const claim = claimSchema.parse(raw);
  if (claim.id !== jobId) throw new Error("RETENTION_JOB_MISMATCH");
  const args = { p_job: jobId, p_lease: claim.leaseToken };
  let stage = "STORAGE_FAILED";
  try {
    if (claim.state === "purging") {
      for (const object of claim.objects) {
        await adapter.rpc("gp_retention_checkpoint", args);
        await adapter.removeObject(object.bucket, object.name);
      }
      stage = "DATABASE_FAILED";
      // SQL verifies that every planned Storage object is absent before metadata deletion.
      const result = z
        .object({
          state: z.enum(["auth_pending", "completed"]),
          userId: z.string().uuid().nullable(),
        })
        .parse(await adapter.rpc("gp_retention_finish_database", args));
      if (result.state === "completed")
        return {
          state: "completed" as const,
          activeSystemErased: true,
          completeErasure: false,
        };
      if (result.userId !== claim.userId)
        throw new Error("RETENTION_SUBJECT_MISMATCH");
    }
    if (claim.kind !== "account" || !claim.userId)
      throw new Error("RETENTION_AUTH_SUBJECT_REQUIRED");
    stage = "AUTH_FAILED";
    await adapter.rpc("gp_retention_checkpoint", args);
    if (await adapter.authUserExists(claim.userId))
      await adapter.deleteAuthUser(claim.userId);
    if (await adapter.authUserExists(claim.userId))
      throw new Error("AUTH_REMOVAL_UNPROVEN");
    // SQL independently verifies Auth, Storage and database absence; no client boolean attests erasure.
    return z
      .object({
        state: z.literal("completed"),
        activeSystemErased: z.literal(true),
        completeErasure: z.literal(false),
        retainedCategories: z.array(z.string()),
      })
      .parse(await adapter.rpc("gp_retention_complete", args));
  } catch (error) {
    await adapter
      .rpc("gp_retention_release", { ...args, p_error_code: stage })
      .catch(() => {});
    throw error;
  }
}
