"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { api } from "./shared";
type RequestState = {
  id: string;
  state: "requested" | "manual_review";
  createdAt: string;
  limitedCleanupAt: string | null;
  completeErasure: false;
  retainedCategories: string[];
};
export default function DeletionStatus() {
  const [state, setState] = useState<RequestState | null>(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  async function load() {
    setBusy(true);
    setError("");
    try {
      const r = await api<{ data: RequestState }>("/api/privacy/status");
      setState(r.data);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  useEffect(() => {
    void load();
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
      {state ? (
        <section className="card account-settings-card">
          <h2>
            {state.state === "requested"
              ? "Demande enregistrée"
              : "Nettoyage limité terminé, examen restant"}
          </h2>
          <p>
            Enregistrée le {new Date(state.createdAt).toLocaleString("fr-FR")}.
            Vos publications et les nouveaux contacts sont désactivés.
          </p>
          <p className="notice">
            L’effacement complet n’est pas confirmé. Les échanges, preuves de
            signalement, historiques des annonces et plans, identité technique,
            journaux et sauvegardes nécessitent encore un calendrier de
            conservation justifié. Aucun email de confirmation final n’a été
            envoyé par ce suivi.
          </p>
          {state.limitedCleanupAt ? (
            <p>
              Nettoyage des favoris, notifications et accusés techniques le{" "}
              {new Date(state.limitedCleanupAt).toLocaleString("fr-FR")}.
            </p>
          ) : null}
          <p className="muted">Référence : {state.id}</p>
        </section>
      ) : null}
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
