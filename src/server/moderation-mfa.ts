import { ApiError } from "./security";

type MfaAuthority = {
  rpc(
    name: "gp_mfa_required",
    args: Record<string, never>,
  ): PromiseLike<{ data: unknown; error: unknown }>;
  auth: {
    mfa: {
      getAuthenticatorAssuranceLevel(): PromiseLike<{
        data: { currentLevel: string | null } | null;
        error: unknown;
      }>;
    };
  };
};
/** The private database policy remains authoritative when no env override is set.
 * A policy lookup failure must never turn into permission to skip MFA.
 */
export async function requireModerationMfa(
  client: MfaAuthority,
  forceRequired = false,
) {
  const policy = await client.rpc("gp_mfa_required", {});
  if (policy.error || typeof policy.data !== "boolean")
    throw new ApiError(
      503,
      "Le contrôle de double authentification est temporairement indisponible.",
      "MFA_POLICY_UNAVAILABLE",
    );
  if (!policy.data && !forceRequired) return;
  const assurance = await client.auth.mfa.getAuthenticatorAssuranceLevel();
  if (assurance.error || assurance.data?.currentLevel !== "aal2")
    throw new ApiError(
      403,
      "Confirmez votre double authentification avant de continuer.",
      "MFA_REQUIRED",
    );
}
