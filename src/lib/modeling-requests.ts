import { z } from "zod";

export const modelingRequestStatusSchema = z.enum([
  "requested",
  "in_progress",
  "ready",
  "declined",
]);
export type ModelingRequestStatus = z.infer<typeof modelingRequestStatusSchema>;
export interface ModelingRequest {
  listingId: string;
  note: string;
  status: ModelingRequestStatus;
  requestedAt: string;
  updatedAt: string;
  version: number;
}
export interface AdminModelingRequest extends ModelingRequest {
  ownerId: string;
  ownerName: string;
  listingTitle: string;
}
export interface AdminModelingRequests {
  requests: AdminModelingRequest[];
  total: number;
  offset: number;
  hasMore: boolean;
}
export const modelingRequestInputSchema = z
  .object({ note: z.string().trim().max(2000).optional() })
  .strict();
export const modelingRequestDecisionSchema = z
  .object({
    listingId: z.string().uuid(),
    status: modelingRequestStatusSchema,
    version: z.number().int().positive(),
  })
  .strict();
export type ModelingRequestDecision = z.infer<
  typeof modelingRequestDecisionSchema
>;
