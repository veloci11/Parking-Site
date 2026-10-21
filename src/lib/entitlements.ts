import { z } from "zod";

export const quotaLimitsSchema = z
  .object({
    activeListings: z.number().int().min(0).max(500),
    draftsPerDay: z.number().int().min(0).max(1000),
    submissionsPerDay: z.number().int().min(0).max(2000),
    contactsPerDay: z.number().int().min(0).max(1000),
    messagesPerMinute: z.number().int().min(0).max(300),
    messagesBurst: z.number().int().min(0).max(50),
    uploadsPerHour: z.number().int().min(0).max(1000),
    uploadBytesPerDay: z.number().int().min(0).max(2147483648),
  })
  .strict();
export type QuotaLimits = z.infer<typeof quotaLimitsSchema>;
export const DEFAULT_LIMITS: QuotaLimits = {
  activeListings: 10,
  draftsPerDay: 10,
  submissionsPerDay: 20,
  contactsPerDay: 10,
  messagesPerMinute: 30,
  messagesBurst: 5,
  uploadsPerHour: 60,
  uploadBytesPerDay: 262144000,
};
export const QUOTA_WINDOWS = {
  drafts: { kind: "draft", key: "draftsPerDay", seconds: 86400 },
  submissions: { kind: "submit", key: "submissionsPerDay", seconds: 86400 },
  contacts: { kind: "contact", key: "contactsPerDay", seconds: 86400 },
  messages: { kind: "message", key: "messagesPerMinute", seconds: 60 },
  messageBurst: { kind: "message_burst", key: "messagesBurst", seconds: 5 },
  uploads: { kind: "upload", key: "uploadsPerHour", seconds: 3600 },
  uploadBytes: {
    kind: "upload_bytes",
    key: "uploadBytesPerDay",
    seconds: 86400,
  },
} as const;
const reason = z.string().trim().min(15).max(2000);
export const entitlementCommandSchema = z.discriminatedUnion("action", [
  z
    .object({
      action: z.literal("set_free_limits"),
      version: z.number().int().positive(),
      limits: quotaLimitsSchema,
      reason,
    })
    .strict(),
  z
    .object({
      action: z.literal("set_user_override"),
      userId: z.string().uuid(),
      version: z.number().int().min(0),
      limits: quotaLimitsSchema
        .partial()
        .refine((x) => Object.keys(x).length > 0),
      startsAt: z.string().datetime({ offset: true }).optional(),
      expiresAt: z.string().datetime({ offset: true }),
      reason,
    })
    .strict(),
  z
    .object({
      action: z.literal("clear_user_override"),
      userId: z.string().uuid(),
      version: z.number().int().positive(),
      reason,
    })
    .strict(),
]);
export type EntitlementCommand = z.infer<typeof entitlementCommandSchema>;
export interface QuotaUsage {
  limit: number;
  used: number;
  remaining: number;
  resetsAt: string | null;
}
export interface Entitlements {
  plan: "free";
  planVersion: number;
  billingEnabled: false;
  limits: QuotaLimits;
  override: {
    version: number;
    startsAt: string;
    expiresAt: string;
    active: boolean;
  } | null;
  usage: Record<"activeListings" | keyof typeof QUOTA_WINDOWS, QuotaUsage>;
}
export interface AdminEntitlements {
  freePlan: { version: number; limits: QuotaLimits };
  user: (Entitlements & { userId: string }) | null;
}
