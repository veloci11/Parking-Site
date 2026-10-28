"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { CheckCircle2, Flag, RefreshCw, ShieldCheck } from "lucide-react";
import { AccountGate, AccountShell, api } from "./shared";
import ContextReports from "./context-reports";
import { useReportQueue } from "./use-report-queue";
import type { User } from "@/lib/types";
interface Report {
  id: string;
  listingId: string;
  reason: string;
  status: "pending" | "open" | "reviewed" | "dismissed";
  version: number;
  createdAt: string;
  decisionReason?: string | null;
}
const labels: Record<Report["status"], string> = {
  open: "À examiner",
  pending: "À examiner",
  reviewed: "Traité",
  dismissed: "Classé sans suite",
};
function Content({ user }: { user: User }) {
  const [filter, setFilter] = useState("open"),
    [selected, setSelected] = useState<string | null>(null),
    [reason, setReason] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState("");
  const queue = useReportQueue<Report>("/api/admin/reports", filter);
  const { items, loading } = queue;
  const panel = useRef<HTMLElement>(null);
  const sending = useRef(false);
  useEffect(() => {
    if (selected) {
      panel.current?.focus({ preventScroll: true });
      panel.current?.scrollIntoView({ block: "start", behavior: "instant" });
    }
  }, [selected]);
  const item = items.find((r) => r.id === selected);
  async function decide(status: "reviewed" | "dismissed") {
    if (!item || sending.current || loading) return;
    if (!reason.trim()) {
      setError("Décrivez les vérifications et le motif de votre décision.");
      return;
    }
    sending.current = true;
    setBusy(true);
    setNotice("");
    setError("");
    try {
      await api(`/api/admin/reports/${item.id}/decision`, {
        method: "POST",
        body: JSON.stringify({
          status,
          reason: reason.trim(),
          version: item.version,
        }),
      });
      setNotice("La décision et son motif ont été enregistrés.");
      setSelected(null);
      setReason("");
      await queue.refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      sending.current = false;
      setBusy(false);
    }
  }
  const visible = items;
  return (
    <AccountShell
      user={user}
      title="Les signalements"
      eyebrow="MODÉRATION"
      action={
        <button
          className="button button-secondary"
          disabled={loading || queue.loadingMore || busy}
          onClick={() => {
            setSelected(null);
            setReason("");
            void queue.refresh();
          }}
        >
          <RefreshCw size={18} />
          Actualiser
        </button>
      }
    >
      <Link className="account-return-link" href="/admin">
        Revenir aux annonces à relire
      </Link>
      <p className="muted account-lead">
        Examinez les alertes reçues et consignez une décision utile.
      </p>
      <div className="notice">
        <ShieldCheck size={20} />
        <p>
          Traiter un signalement ne retire pas automatiquement une annonce.
          Toute mesure sur le contenu doit être vérifiée séparément et tracée.
        </p>
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
      <div
        className="account-tabs"
        role="group"
        aria-label="Filtrer les signalements"
      >
        {[
          ["open", "À examiner"],
          ["reviewed", "Traités"],
          ["dismissed", "Classés"],
          ["all", "Tous"],
        ].map(([v, label]) => (
          <button
            key={v}
            className={filter === v ? "active" : ""}
            aria-pressed={filter === v}
            disabled={busy}
            onClick={() => {
              setFilter(v);
              setSelected(null);
              setReason("");
              setNotice("");
              setError("");
            }}
          >
            {label}
          </button>
        ))}
      </div>
      {loading ? (
        <p role="status">Chargement des signalements…</p>
      ) : visible.length ? (
        <div className="account-list">
          {visible.map((r) => (
            <button
              key={r.id}
              className={`account-review-row account-report-row ${selected === r.id ? "active" : ""}`}
              disabled={busy}
              aria-pressed={selected === r.id}
              onClick={() => {
                setError("");
                setNotice("");
                setSelected(r.id);
                setReason(r.decisionReason || "");
              }}
            >
              <div>
                <strong>{r.reason}</strong>
                <span>
                  {new Date(r.createdAt).toLocaleDateString("fr-FR")} · version{" "}
                  {r.version}
                </span>
              </div>
              <span className="badge">{labels[r.status] || r.status}</span>
              <Flag size={20} />
            </button>
          ))}
        </div>
      ) : !queue.error ? (
        <div className="empty-state account-empty">
          <CheckCircle2 size={32} />
          <h2>Aucun signalement dans cette vue.</h2>
          <p>Les alertes et leur suivi seront réunis ici.</p>
        </div>
      ) : null}
      {queue.cursor ? (
        <button
          className="button button-secondary"
          disabled={queue.loadingMore || loading || busy}
          onClick={() => void queue.more()}
        >
          {queue.loadingMore
            ? "Chargement…"
            : "Charger les signalements suivants"}
        </button>
      ) : null}
      {item ? (
        <section
          className="card account-review-detail"
          ref={panel}
          tabIndex={-1}
          aria-label="Dossier du signalement"
        >
          <span className="account-eyebrow">
            DOSSIER · VERSION {item.version}
          </span>
          <h2>Examiner le signalement</h2>
          <p className="account-preview-description">{item.reason}</p>
          <Link
            className="button button-secondary"
            href={`/annonces/${item.listingId}/parking`}
          >
            Consulter l’annonce publique
          </Link>
          <p className="muted account-notification-note">
            Si l’annonce a déjà été retirée, la fiche publique peut être
            indisponible.
          </p>
          <label className="field">
            Vérifications et décision
            <textarea
              className="input"
              rows={4}
              disabled={busy || loading}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              minLength={5}
              maxLength={2000}
              placeholder="Décrivez les éléments vérifiés et le motif de traitement ou de classement."
            />
          </label>
          <div className="account-review-actions">
            <button
              className="button button-primary"
              disabled={busy || loading || reason.trim().length < 5}
              onClick={() => decide("reviewed")}
            >
              Marquer comme traité
            </button>
            <button
              className="button button-secondary"
              disabled={busy || loading || reason.trim().length < 5}
              onClick={() => decide("dismissed")}
            >
              Classer sans suite
            </button>
            <button
              className="button button-secondary"
              disabled={busy}
              onClick={() => setSelected(null)}
            >
              Fermer le dossier
            </button>
          </div>
        </section>
      ) : null}
      <ContextReports admin />
    </AccountShell>
  );
}
export default function Reports() {
  return <AccountGate admin>{(u) => <Content user={u} />}</AccountGate>;
}
