"use client";
import { useEffect, useState } from "react";
import type { ContextReport, ContextReportDetail } from "@/lib/context-reports";
import { reportCategories, reportStatusLabels } from "@/lib/context-reports";
import { api } from "./shared";
export default function ContextReports({ admin = false }: { admin?: boolean }) {
  const [items, setItems] = useState<ContextReport[]>([]),
    [detail, setDetail] = useState<ContextReportDetail | null>(null),
    [loading, setLoading] = useState(true),
    [reading, setReading] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [reason, setReason] = useState(""),
    [confirmed, setConfirmed] = useState(false);
  const prefix = admin ? "/api/admin/report-context" : "/api/report-context";
  async function load() {
    setLoading(true);
    try {
      const r = await api<{ data: ContextReport[] }>(
        `${prefix}${admin ? "" : "/mine"}`,
      );
      setItems(r.data);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    void load();
  }, [admin]);
  async function read(item: ContextReport) {
    setReading(true);
    setError("");
    setDetail(null);
    setReason("");
    setConfirmed(false);
    try {
      const r = await api<{ data: ContextReportDetail }>(
        `${prefix}/${item.id}`,
      );
      setDetail(r.data);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setReading(false);
    }
  }
  async function act(status?: "reviewed" | "dismissed") {
    if (!detail || busy || !confirmed || reason.trim().length < 15) return;
    setBusy(true);
    setError("");
    try {
      await api(
        `${prefix}/${detail.report.id}/${admin ? "decision" : "appeal"}`,
        {
          method: "POST",
          body: JSON.stringify({
            version: detail.report.version,
            reason: reason.trim(),
            ...(admin ? { status } : {}),
          }),
        },
      );
      setNotice(
        admin
          ? "La décision motivée est enregistrée et consultable par l’auteur du signalement."
          : "Votre demande de réexamen a été enregistrée.",
      );
      setDetail(null);
      setReason("");
      setConfirmed(false);
      await load();
    } catch (e) {
      setError((e as Error).message);
      setConfirmed(false);
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="account-context-reports">
      <div className="account-section-title">
        <h2>
          {admin
            ? "Conversations et messages signalés"
            : "Mes signalements de conversations"}
        </h2>
        <button
          className="button button-secondary"
          disabled={busy || loading || reading}
          onClick={() => {
            setError("");
            void load();
          }}
        >
          Actualiser
        </button>
      </div>
      <p className="muted">
        {admin
          ? "Seul le contexte explicitement transmis dans un signalement est accessible. L’ouverture d’un dossier est journalisée ; aucun accès général aux messages privés n’est proposé."
          : "Retrouvez les décisions motivées. Un réexamen peut être demandé une fois après la décision ; il ne supprime pas l’historique du dossier."}{" "}
        Liste limitée à cent dossiers récents.
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
      {loading ? (
        <p role="status">Chargement des dossiers…</p>
      ) : items.length ? (
        <div className="account-list">
          {items.map((item) => (
            <button
              className="account-review-row"
              key={item.id}
              disabled={reading || busy}
              onClick={() => void read(item)}
            >
              <span>
                <strong>{reportCategories[item.category]}</strong>
                <span>
                  {item.targetType === "message" ? "Message" : "Conversation"} ·{" "}
                  {new Date(item.createdAt).toLocaleDateString("fr-FR")} ·
                  version {item.version}
                </span>
              </span>
              <span className="badge">{reportStatusLabels[item.status]}</span>
            </button>
          ))}
        </div>
      ) : (
        <p className="notice">Aucun dossier de conversation à afficher.</p>
      )}
      {reading ? <p role="status">Ouverture du dossier…</p> : null}
      {detail ? (
        <article className="card account-review-detail">
          <h3>
            {reportCategories[detail.report.category]} ·{" "}
            {reportStatusLabels[detail.report.status]}
          </h3>
          <p className="account-preview-description">{detail.report.reason}</p>
          {detail.evidence ? (
            <>
              <p className="notice">
                {detail.evidence.scope === "reported_message_only"
                  ? "Contexte limité au message signalé."
                  : "Contexte limité aux vingt derniers messages à la date du signalement."}{" "}
                Instantané figé le{" "}
                {new Date(detail.evidence.capturedAt).toLocaleString("fr-FR")}.
                Les messages reçus ensuite ne sont pas exposés ici.
              </p>
              <div className="account-reported-context">
                {detail.evidence.messages.map((message) => (
                  <section key={message.id}>
                    <p className="muted">
                      Message {message.id} · auteur {message.senderId} ·{" "}
                      <time dateTime={message.createdAt}>
                        {new Date(message.createdAt).toLocaleString("fr-FR")}
                      </time>
                    </p>
                    <p className="account-preview-description">
                      {message.body}
                    </p>
                  </section>
                ))}
              </div>
            </>
          ) : null}
          {detail.decisions.map((decision, index) => (
            <section className="notice" key={`${decision.createdAt}-${index}`}>
              <strong>
                {decision.decision === "reviewed" ? "Traitement" : "Classement"}{" "}
                · {new Date(decision.createdAt).toLocaleString("fr-FR")}
              </strong>
              <p>{decision.reason}</p>
            </section>
          ))}
          {detail.report.appealReason ? (
            <p className="notice">
              Demande de réexamen : {detail.report.appealReason}
            </p>
          ) : null}
          {(admin && ["open", "appealed"].includes(detail.report.status)) ||
          (!admin &&
            ["reviewed", "dismissed"].includes(detail.report.status) &&
            !detail.report.appealReason) ? (
            <>
              <label className="field">
                {admin
                  ? "Motif de la décision"
                  : "Précisions pour demander un réexamen"}
                <textarea
                  className="input"
                  value={reason}
                  onChange={(e) => {
                    setReason(e.target.value);
                    setConfirmed(false);
                  }}
                  minLength={15}
                  maxLength={2000}
                  rows={4}
                  disabled={busy}
                />
              </label>
              <label className="account-checkbox">
                <input
                  type="checkbox"
                  checked={confirmed}
                  onChange={(e) => setConfirmed(e.target.checked)}
                  disabled={busy}
                />
                <span>
                  {admin
                    ? "Je confirme avoir examiné uniquement le contexte transmis et le motif de ma décision."
                    : "Je confirme demander un réexamen avec ces précisions."}
                </span>
              </label>
              <div className="account-review-actions">
                {admin ? (
                  <>
                    <button
                      className="button button-primary"
                      disabled={busy || !confirmed || reason.trim().length < 15}
                      onClick={() => void act("reviewed")}
                    >
                      Marquer comme traité
                    </button>
                    <button
                      className="button button-secondary"
                      disabled={busy || !confirmed || reason.trim().length < 15}
                      onClick={() => void act("dismissed")}
                    >
                      Classer sans suite
                    </button>
                  </>
                ) : (
                  <button
                    className="button button-primary"
                    disabled={busy || !confirmed || reason.trim().length < 15}
                    onClick={() => void act()}
                  >
                    Demander un réexamen
                  </button>
                )}
              </div>
            </>
          ) : null}
          <button
            className="account-link-button"
            disabled={busy}
            onClick={() => setDetail(null)}
          >
            Fermer le dossier
          </button>
          <p className="muted">
            La décision n’envoie aucun email automatiquement et ne suspend pas
            un compte sans une action administrative distincte. Ce suivi interne
            ne remplace pas les autres voies de recours applicables.
          </p>
        </article>
      ) : null}
    </section>
  );
}
