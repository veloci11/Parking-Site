import type { AdminUser } from "./types";

export interface AdminAccountPage {
  data: AdminUser[];
  nextCursor: string | null;
}

export async function loadAdminAccountPage(
  read: <T>(path: string, options?: RequestInit) => Promise<T>,
  search: string,
  cursor: string | null,
  signal?: AbortSignal,
) {
  const params = new URLSearchParams({ q: search, limit: "50" });
  if (cursor) params.set("cursor", cursor);
  return read<AdminAccountPage>(`/api/admin/users?${params}`, {
    signal,
    cache: "no-store",
  });
}

const actionLabels: Record<string, string> = {
  "account.register": "Compte créé",
  "account.decision": "Rôle ou statut du compte modifié",
  "auth.terms_accepted": "Conditions acceptées",
  "auth.password_changed": "Mot de passe modifié",
  "listing.submit": "Annonce envoyée en modération",
  "listing.withdraw": "Annonce retirée",
  "listing.sold": "Annonce clôturée",
  "listing.availability_confirmed": "Disponibilité confirmée",
  "moderation.approve": "Annonce approuvée",
  "moderation.reject": "Annonce refusée",
  "moderation.changes_requested": "Corrections demandées",
  "moderation.suspend": "Publication suspendue",
  "scene.submit": "Plan 3D envoyé en revue",
  "scene.approve": "Plan 3D approuvé",
  "scene.reject": "Plan 3D refusé",
  "scene.changes_requested": "Corrections du plan 3D demandées",
  "scene.activate": "Plan 3D activé",
  "scene.withdraw": "Plan 3D retiré",
  "modeling.requested": "Modélisation 3D demandée",
  "modeling.status_changed": "Avancement de la modélisation modifié",
  "context_report.create": "Signalement reçu",
  "context_report.context_read": "Contexte du signalement consulté",
  "context_report.appeal": "Réexamen demandé",
  "context_report.dismissed": "Signalement classé",
  "context_report.reviewed": "Signalement traité",
  "entitlements.free_limits": "Limites communes modifiées",
  "entitlements.set_user_override": "Limites d’un compte adaptées",
  "entitlements.clear_user_override": "Adaptation des limites retirée",
  "privacy.export_requested": "Export des données demandé",
  "privacy.export_ready": "Export des données préparé",
  "privacy.export_download": "Export des données téléchargé",
  "privacy.export_expired": "Export des données expiré",
  "privacy.deletion_requested": "Fermeture du compte demandée",
};

export function auditActionLabel(action: string) {
  return actionLabels[action] ?? action;
}

/** datetime-local expects local clock time, not the UTC representation. */
export function adminLocalDateTime(value: string) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "";
  return new Date(date.getTime() - date.getTimezoneOffset() * 60_000)
    .toISOString()
    .slice(0, 16);
}

export function adaptationExpiryError(value: string, now = Date.now()) {
  const expiry = Date.parse(value);
  if (!value || !Number.isFinite(expiry))
    return "Choisissez une échéance pour cette adaptation.";
  if (expiry <= now)
    return "L’échéance doit se situer après la date et l’heure actuelles.";
  if (expiry > now + 90 * 86_400_000)
    return "L’adaptation ne peut pas dépasser 90 jours.";
  return null;
}
