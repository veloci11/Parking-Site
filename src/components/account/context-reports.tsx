"use client";
import { useEffect, useRef, useState } from "react";
import type { ContextReport, ContextReportDetail } from "@/lib/context-reports";
import { reportCategories, reportStatusLabels } from "@/lib/context-reports";
import { api } from "./shared";
import { useReportQueue } from "./use-report-queue";
export default function ContextReports({ admin = false }: { admin?: boolean }) {
  const [detail, setDetail] = useState<ContextReportDetail | null>(null),
    [filter, setFilter] = useState(admin ? "open" : "all"),
    [reading, setReading] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [reason, setReason] = useState(""),
    [confirmed, setConfirmed] = useState(false);
  const prefix = admin ? "/api/admin/report-context" : "/api/report-context";
  const queue = useReportQueue<ContextReport>(
    `${prefix}${admin ? "" : "/mine"}`,
    filter,
  );
  const { items, loading } = queue;
  const panel = useRef<HTMLElement>(null);
  const readingGeneration = useRef(0);
  const sending = useRef(false);
  useEffect(
    () => () => {
      readingGeneration.current++;
    },
    [],
  );
  useEffect(() => {
    if (detail) {
      panel.current?.focus({ preventScroll: true });
      panel.current?.scrollIntoView({ block: "start", behavior: "instant" });
    }
  }, [detail?.report.id]);
  async function read(item: ContextReport) {
    const generation = ++readingGeneration.current;
    setNotice("");
    setReading(true);
    setError("");
    setDetail(null);
    setReason("");
    setConfirmed(false);
    try {
      const r = await api<{ data: ContextReportDetail }>(
        `${prefix}/${item.id}`,
      );
      if (generation === readingGeneration.current) setDetail(r.data);
    } catch (e) {
      if (generation === readingGeneration.current)
        setError((e as Error).message);
    } finally {
      if (generation === readingGeneration.current) setReading(false);
    }
  }
  async function act(status?: "reviewed" | "dismissed") {
    if (
      !detail ||
      busy ||
      sending.current ||
      !confirmed ||
      reason.trim().length < 15
    )
      return;
    sending.current = true;
    setNotice("");
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
      await queue.refresh();
    } catch (e) {
      setError((e as Error).message);
      setConfirmed(false);
    } finally {
      sending.current = false;
      setBusy(false);
    }
  }
  return (
    <section className="account-context-reports">
      <div className="account-section-title">
        <h2>
          {admin
            ? "Conversations et messages signalés"
            : "Signalements envoyés"}
        </h2>
        <button
          className="button button-secondary"
          disabled={busy || loading || reading || queue.loadingMore}
          onClick={() => {
            setError("");
            setDetail(null);
            setConfirmed(false);
            void queue.refresh();
          }}
        >
          Actualiser
        </button>
      </div>
      <p className="muted">
        {admin
          ? "Seul le contexte explicitement transmis dans un signalement est accessible. L’ouverture d’un dossier est journalisée ; aucun accès général aux messages privés n’est proposé."
          : "Consultez la réponse de l’équipe aux messages ou conversations que vous avez signalés."}
      </p>
      <div
        className="account-tabs"
        role="group"
        aria-label="Filtrer les signalements de conversations"
      >
        {[
          ["open", "À examiner"],
          ["reviewed", "Traités"],
          ["dismissed", "Classés"],
          ["all", "Tous"],
        ].map(([value, label]) => (
          <button
            key={value}
            className={filter === value ? "active" : ""}
            aria-pressed={filter === value}
            disabled={busy || reading}
            onClick={() => {
              setFilter(value);
              setDetail(null);
              setConfirmed(false);
              setError("");
              setNotice("");
            }}
          >
            {label}
          </button>
        ))}
      </div>
      {queue.error ? (
        <p className="error" role="alert">
          {queue.error}{" "}
          <button
            className="account-link-button"
            disabled={loading || queue.loadingMore}
            onClick={() => void queue.retry()}
          >
            Réessayer
          </button>
        </p>
      ) : null}
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
              className={`account-review-row ${detail?.report.id === item.id ? "active" : ""}`}
              aria-pressed={detail?.report.id === item.id}
              key={item.id}
              disabled={reading || busy}
              onClick={() => void read(item)}
            >
              <span>
                <strong>{reportCategories[item.category]}</strong>
                <span>
                  {item.targetType === "message" ? "Message" : "Conversation"} ·{" "}
                  {new Date(item.createdAt).toLocaleDateString("fr-FR")}
                  {admin ? ` · version ${item.version}` : ""}
                </span>
              </span>
              <span className="badge">{reportStatusLabels[item.status]}</span>
            </button>
          ))}
        </div>
      ) : !queue.error ? (
        <p className="muted">Aucun signalement dans cette vue.</p>
      ) : null}
      {queue.cursor ? (
        <button
          className="button button-secondary"
          disabled={queue.loadingMore || loading || busy || reading}
          onClick={() => void queue.more()}
        >
          {queue.loadingMore ? "Chargement…" : "Charger les dossiers suivants"}
        </button>
      ) : null}
      {reading ? <p role="status">Ouverture du dossier…</p> : null}
      {detail ? (
        <article
          className="card account-review-detail"
          ref={panel}
          tabIndex={-1}
          aria-label="Dossier de conversation signalée"
        >
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
          {admin ? (
            <p className="muted">
              Cette décision ne suspend pas le compte. La gestion des comptes
              est accessible aux administrateurs.
            </p>
          ) : null}
        </article>
      ) : null}
    </section>
  );
}
