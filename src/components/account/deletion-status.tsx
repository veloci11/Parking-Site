"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { api } from "./shared";
export type DeletionRequestReceipt = {
  id: string;
  state: "requested" | "manual_review" | "purging" | "completed";
  version?: number;
  createdAt: string;
  updatedAt?: string;
  limitedCleanupAt: string | null;
  activeSystemErased?: boolean;
  completeErasure: false;
  retainedCategories: string[];
};

const retainedLabels: Record<string, string> = {
  auth_identity: "Identité du compte",
  conversations: "Échanges",
  reported_context: "Éléments de signalement",
  listing_history: "Historique des annonces",
  scene_evidence: "Plans et pièces justificatives",
  minimal_receipt: "Reçu minimal de traitement",
  audit: "Journaux d’audit",
  backups: "Sauvegardes",
  backups_external_rotation:
    "Sauvegardes soumises à leur calendrier de rotation",
};

export function DeletionReceipt({
  receipt,
}: {
  receipt: DeletionRequestReceipt;
}) {
  const activeSystemErased =
    receipt.state === "completed" && receipt.activeSystemErased === true;
  const title = activeSystemErased
    ? "Retrait du service actif terminé"
    : receipt.state === "purging"
      ? "Suppression en cours"
      : receipt.state === "manual_review"
        ? "Nettoyage limité terminé, examen restant"
        : receipt.state === "completed"
          ? "Clôture enregistrée, vérification du reçu restante"
          : "Demande enregistrée";
  const retained = [
    ...new Set(
      receipt.retainedCategories.map(
        (category) =>
          retainedLabels[category] || "Autres données soumises à conservation",
      ),
    ),
  ];
  return (
    <section className="card account-settings-card">
      <h2 aria-live="polite">{title}</h2>
      <p>
        Enregistrée le {new Date(receipt.createdAt).toLocaleString("fr-FR")}.
        Vos publications et les nouveaux contacts sont désactivés.
      </p>
      <p className="notice">
        {activeSystemErased
          ? "Vos données ont été retirées du service actif. Le reçu minimal, les journaux d’audit et les sauvegardes restent soumis à leur calendrier de conservation et de rotation. Ce reçu ne confirme pas un effacement total de toutes les copies."
          : receipt.state === "purging"
            ? "Le retrait des données du service actif est en cours. Le suivi ne confirme pas encore sa fin. Les données conservées restent soumises à leur calendrier de conservation."
            : receipt.state === "completed"
              ? "Le reçu ne confirme pas encore le retrait des données du service actif. Actualisez le suivi pour obtenir un état vérifié."
              : "L’effacement complet n’est pas confirmé. Les données encore conservées nécessitent un examen et un calendrier de conservation justifié."}
      </p>
      {retained.length ? (
        <div className="small muted">
          <p>Données encore conservées :</p>
          <ul>
            {retained.map((label) => (
              <li key={label}>{label}</li>
            ))}
          </ul>
        </div>
      ) : null}
      {receipt.limitedCleanupAt ? (
        <p>
          Nettoyage des favoris, notifications et accusés techniques le{" "}
          {new Date(receipt.limitedCleanupAt).toLocaleString("fr-FR")}.
        </p>
      ) : null}
      {receipt.updatedAt ? (
        <p className="small muted">
          Suivi mis à jour le{" "}
          {new Date(receipt.updatedAt).toLocaleString("fr-FR")}.
        </p>
      ) : null}
      <p className="muted">Référence : {receipt.id}</p>
    </section>
  );
}

export default function DeletionStatus() {
  const [state, setState] = useState<DeletionRequestReceipt | null>(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const request = useRef<AbortController | null>(null);
  async function load() {
    request.current?.abort();
    const controller = new AbortController();
    request.current = controller;
    setBusy(true);
    setError("");
    try {
      const r = await api<{ data: DeletionRequestReceipt }>(
        "/api/privacy/status",
        { signal: controller.signal },
      );
      if (controller.signal.aborted) return;
      setState(r.data);
    } catch (e) {
      if (!controller.signal.aborted) {
        setState(null);
        setError((e as Error).message);
      }
    } finally {
      if (!controller.signal.aborted) setBusy(false);
    }
  }
  useEffect(() => {
    void load();
    return () => request.current?.abort();
  }, []);
  return (
    <main id="main" className="page-shell account-narrow">
      <p className="account-eyebrow">VOS DONNÉES</p>
      <h1>Suivre ma demande de suppression</h1>
      <p>
        Le suivi utilise un reçu privé dans ce navigateur. Il ne reconnecte pas
        votre compte et ne permet pas de consulter vos anciennes données.
      </p>
      {error ? (
        <p className="error" role="alert">
          {error}
        </p>
      ) : null}
      {busy && !state ? <p role="status">Chargement du reçu…</p> : null}
      {state ? <DeletionReceipt receipt={state} /> : null}
      <button
        className="button button-secondary"
        onClick={() => void load()}
        disabled={busy}
      >
        {busy ? "Actualisation…" : "Actualiser le suivi"}
      </button>{" "}
      <Link href="/explorer" className="button button-secondary">
        Retour aux annonces
      </Link>
    </main>
  );
}
