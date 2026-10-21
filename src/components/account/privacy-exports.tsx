"use client";
import { useEffect, useState, type FormEvent } from "react";
import type { ExportJob } from "@/server/privacy-exports";
import { api } from "./shared";
const labels: Record<ExportJob["state"], string> = {
  queued: "En attente de préparation",
  processing: "Préparation en cours",
  ready: "Archive privée prête",
  failed: "Préparation refusée ou échouée",
  expired: "Archive expirée",
};
export default function PrivacyExports() {
  const [jobs, setJobs] = useState<ExportJob[]>([]),
    [password, setPassword] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState("");
  async function load() {
    try {
      const r = await api<{ data: ExportJob[] }>("/api/privacy/exports");
      setJobs(r.data);
    } catch (e) {
      setError((e as Error).message);
    }
  }
  useEffect(() => {
    void load();
    const timer = setInterval(() => void load(), 30000);
    return () => clearInterval(timer);
  }, []);
  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      await api("/api/privacy/exports", {
        method: "POST",
        body: JSON.stringify({ password }),
      });
      setPassword("");
      setNotice(
        "Demande enregistrée. Le worker opérateur doit préparer votre archive ; elle n’est pas encore disponible.",
      );
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="card account-settings-card">
      <h2>Mes archives privées</h2>
      <p>
        Demandez une archive de vos données, photos et plans propres. Les
        fichiers déposés par un autre contributeur et les preuves internes de
        modération sont exclus. Une archive complète dans ce périmètre est
        téléchargeable pendant 7 jours après préparation ; aucun lien public
        n’est créé.
      </p>
      <p className="muted">
        Limites automatiques :250 fichiers, 25 Mio par fichier, 512 Mio au
        total. Si une source manque ou si la demande dépasse ces limites,
        l’archive reste indisponible avec une raison ; aucun ZIP partiel ne sera
        annoncé complet.
      </p>
      {error ? (
        <p className="error" role="alert">
          {error}
        </p>
      ) : null}
      {notice ? (
        <p className="notice" role="status">
          {notice}
        </p>
      ) : null}
      <form className="account-form" onSubmit={submit}>
        <label className="field">
          Mot de passe actuel
          <input
            className="input"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            maxLength={128}
            required
            disabled={busy}
          />
        </label>
        <button
          className="button button-secondary"
          disabled={
            busy ||
            !password ||
            jobs.some((j) => ["queued", "processing"].includes(j.state))
          }
        >
          {busy ? "Enregistrement…" : "Demander une archive privée"}
        </button>
      </form>
      <button className="button button-secondary" onClick={() => void load()}>
        Actualiser les demandes
      </button>
      {jobs.length ? (
        <div className="account-form">
          {jobs.map((job) => (
            <article className="card account-settings-card" key={job.id}>
              <h3>{labels[job.state]}</h3>
              <p>
                Demandée le {new Date(job.createdAt).toLocaleString("fr-FR")}
                {job.expiresAt
                  ? `. Expiration : ${new Date(job.expiresAt).toLocaleString("fr-FR")}`
                  : ""}
                .
              </p>
              {job.state === "failed" ? (
                <p className="error">
                  {job.errorCode === "EXPORT_TOO_LARGE"
                    ? "La demande dépasse les limites automatiques. Un accompagnement opérateur est nécessaire pour un export borné plus volumineux."
                    : job.errorCode === "SOURCE_UNAVAILABLE"
                      ? "Une source propre est indisponible. Faites contrôler les fichiers de votre compte avant une nouvelle demande."
                      : "La préparation n’a pas abouti. Faites contrôler la demande par l’opérateur avant de réessayer."}{" "}
                  Aucun fichier partiel n’est téléchargeable.
                </p>
              ) : null}
              {job.state === "ready" ? (
                <form
                  className="account-form"
                  method="POST"
                  action={`/api/privacy/exports/${job.id}/download`}
                  target="_blank"
                >
                  <label className="field">
                    Confirmez à nouveau votre mot de passe pour télécharger
                    <input
                      className="input"
                      type="password"
                      name="password"
                      autoComplete="current-password"
                      maxLength={128}
                      required
                    />
                  </label>
                  <button className="button button-primary">
                    Télécharger l’archive ZIP
                    {job.byteSize
                      ? ` (${Math.ceil(job.byteSize / 1024 / 1024)}Mio)`
                      : ""}
                  </button>
                  <p className="muted">
                    Le téléchargement s’ouvre dans un nouvel onglet. Une erreur
                    d’autorisation ou d’expiration y sera affichée sans exposer
                    l’archive.
                  </p>
                </form>
              ) : null}
            </article>
          ))}
        </div>
      ) : (
        <p className="muted">Aucune demande enregistrée.</p>
      )}
    </section>
  );
}
