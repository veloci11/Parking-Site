import type { SupabaseClient } from "@supabase/supabase-js";
import type { Entitlements } from "@/lib/entitlements";
import { ApiError } from "./security";

/** Storage masks database trigger errors, so use the own read model for HTTP feedback.
 * The Storage trigger remains the atomic admission check for all API/SDK writers. */
export async function assertRemoteUploadQuota(
  client: SupabaseClient,
  bytes: number,
) {
  const result = await client.rpc("gp_entitlements");
  if (result.error || !result.data)
    throw new ApiError(
      503,
      "Les limites de dépôt sont temporairement indisponibles.",
      "SERVICE_UNAVAILABLE",
    );
  const entitlements = result.data as Entitlements;
  const blocked = [
    { usage: entitlements.usage.uploads, needed: 1, seconds: 3600 },
    { usage: entitlements.usage.uploadBytes, needed: bytes, seconds: 86400 },
  ].filter((rule) => rule.usage.remaining < rule.needed);
  if (blocked.length) {
    const retry = Math.max(
      ...blocked.map((rule) =>
        rule.usage.resetsAt
          ? Math.max(
              1,
              Math.ceil((Date.parse(rule.usage.resetsAt) - Date.now()) / 1000),
            )
          : rule.seconds,
      ),
    );
    throw new ApiError(
      429,
      "Limite de dépôt atteinte. Réessayez après sa remise à zéro.",
      "RATE_LIMITED",
      retry,
    );
  }
}
