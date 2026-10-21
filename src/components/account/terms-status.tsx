"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import type { AuthPolicy } from "@/lib/auth-return";
import { api } from "./shared";
export default function TermsStatus() {
  const [state, setState] = useState<
      (AuthPolicy & { accepted: boolean; acceptedAt?: string | null }) | null
    >(null),
    [ack, setAck] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  async function load() {
    try {
      const r = await api<{
        data: AuthPolicy & { accepted: boolean; acceptedAt?: string | null };
      }>("/api/auth/commands/terms");
      setState(r.data);
    } catch (e) {
      setError((e as Error).message);
    }
  }
  useEffect(() => {
    void load();
  }, []);
  async function accept() {
    if (!state || !ack || busy) return;
    setBusy(true);
    setError("");
    try {
      await api("/api/auth/commands/terms", {
        method: "POST",
        body: JSON.stringify({
          termsAccepted: true,
          termsVersion: state.termsVersion,
          privacyVersion: state.privacyVersion,
        }),
      });
      setAck(false);
      await load();
    } catch (e) {
      setError((e as Error).message);
      setAck(false);
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="card account-settings-card">
      <h2>Mes déclarations sur les documents</h2>
      <p className="muted">
        Versions de préparation : ces documents devront être complétés avec les
        informations de l’opérateur avant ouverture publique.
      </p>
      {error ? (
        <p className="error" role="alert">
          {error}
        </p>
      ) : null}
      {state ? (
        <>
          <p>
            <Link href="/conditions-utilisation">Conditions d’utilisation</Link>{" "}
            : {state.termsVersion}.{" "}
            <Link href="/confidentialite">Confidentialité</Link> :{" "}
            {state.privacyVersion}.
          </p>
          {state.accepted ? (
            <p className="notice">
              Acceptation enregistrée
              {state.acceptedAt
                ? ` le ${new Date(state.acceptedAt).toLocaleString("fr-FR")}`
                : ""}
              .
            </p>
          ) : (
            <>
              <p className="notice">
                Aucune acceptation de ces versions n’est enregistrée pour votre
                compte. L’absence ne sera pas remplacée par une déclaration
                automatique.
              </p>
              <label className="account-checkbox">
                <input
                  type="checkbox"
                  checked={ack}
                  onChange={(e) => setAck(e.target.checked)}
                  disabled={busy}
                />
                <span>
                  J’accepte les conditions de cette version et j’ai lu la
                  politique de confidentialité indiquée.
                </span>
              </label>
              <button
                className="button button-secondary"
                disabled={busy || !ack}
                onClick={() => void accept()}
              >
                Enregistrer ma déclaration
              </button>
            </>
          )}
        </>
      ) : (
        <p role="status">Chargement des versions…</p>
      )}
    </section>
  );
}
