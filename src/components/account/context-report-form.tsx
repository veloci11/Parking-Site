"use client";
import FilterSelect from "../FilterSelect";
import { useRef, useState, type FormEvent } from "react";
import Link from "next/link";
import {
  reportCategories,
  type ContextReport,
  type ContextReportCategory,
} from "@/lib/context-reports";
import { api } from "./shared";
export default function ContextReportForm({
  targetType,
  targetId,
  onClose,
}: {
  targetType: "conversation" | "message";
  targetId: string;
  onClose: () => void;
}) {
  const [category, setCategory] = useState(""),
    [reason, setReason] = useState(""),
    [ack, setAck] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [success, setSuccess] = useState(false);
  const pending = useRef<{ key: string; id: string } | null>(null);
  async function submit(e: FormEvent) {
    e.preventDefault();
    if (busy || !ack || !category) return;
    setBusy(true);
    setError("");
    const key = JSON.stringify({
      targetType,
      targetId,
      category,
      reason: reason.trim(),
    });
    if (pending.current?.key !== key)
      pending.current = { key, id: crypto.randomUUID() };
    try {
      await api<{ data: ContextReport }>("/api/report-context", {
        method: "POST",
        body: JSON.stringify({
          targetType,
          targetId,
          category: category as ContextReportCategory,
          reason: reason.trim(),
          clientRequestId: pending.current.id,
        }),
      });
      setSuccess(true);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  if (success)
    return (
      <section className="notice" role="status">
        <h3>Signalement enregistré</h3>
        <p>
          L’équipe examinera votre signalement. Vous pouvez suivre sa réponse
          depuis votre messagerie.
        </p>
        <Link href="/compte/signalements" className="button button-secondary">
          Voir le suivi
        </Link>
        <button className="text-button" onClick={onClose}>
          Fermer
        </button>
      </section>
    );
  return (
    <form className="card account-context-report-form" onSubmit={submit}>
      <h3>
        {targetType === "message"
          ? "Signaler ce message"
          : "Signaler cette conversation"}
      </h3>
      <p className="notice">
        {targetType === "message"
          ? "Ce message sera transmis à l’équipe de modération."
          : "Les vingt derniers messages de cette conversation seront transmis à l’équipe de modération."}
      </p>
      {error ? (
        <p className="error" role="alert">
          {error}
        </p>
      ) : null}
      <div className="field">
        <span>{"Catégorie"}</span>
        <FilterSelect
          label={"Catégorie"}
          variant="field"
          value={category}
          disabled={busy}
          required={true}
          onChange={(selectedValue) => setCategory(selectedValue)}
          options={[
            { value: "", label: "Choisir une catégorie", disabled: true },
            ...Object.entries(reportCategories).map(([key, label]) => ({
              value: key,
              label: label,
            })),
          ]}
        />
      </div>
      <label className="field">
        Décrivez le problème
        <textarea
          className="input"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          minLength={10}
          maxLength={2000}
          required
          disabled={busy}
          rows={4}
        />
      </label>
      <label className="account-checkbox">
        <input
          type="checkbox"
          checked={ack}
          onChange={(e) => setAck(e.target.checked)}
          disabled={busy}
        />
        <span>
          J’ai compris le périmètre du contexte transmis et je demande son
          examen.
        </span>
      </label>
      <div className="account-review-actions">
        <button
          className="button button-primary"
          disabled={busy || !ack || !category || reason.trim().length < 10}
        >
          {busy ? "Enregistrement…" : "Enregistrer le signalement"}
        </button>
        <button
          className="button button-secondary"
          type="button"
          disabled={busy}
          onClick={onClose}
        >
          Annuler
        </button>
      </div>
    </form>
  );
}
