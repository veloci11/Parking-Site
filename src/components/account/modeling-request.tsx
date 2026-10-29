"use client";
import { useCallback, useEffect, useId, useRef, useState } from "react";
import Link from "next/link";
import { Box, RefreshCw } from "lucide-react";
import FilterSelect from "../FilterSelect";
import { api } from "./shared";
import {
  loadModelingRequestPage,
  modelingDecisionConfirmed,
  reloadedModelingRequest,
} from "@/lib/modeling-request-review";
import type {
  ModelingRequest,
  AdminModelingRequest,
  ModelingRequestStatus,
} from "@/lib/modeling-requests";

export const modelingRequestStatusLabels: Record<
  ModelingRequestStatus,
  string
> = {
  requested: "Demande envoyée",
  in_progress: "En préparation",
  ready: "Préparation terminée",
  declined: "Demande non retenue",
};
const statusOptions = Object.entries(modelingRequestStatusLabels).map(
  ([value, label]) => ({ value, label }),
);
function requestDate(value: string) {
  return new Date(value).toLocaleDateString("fr-FR", { timeZone: "UTC" });
}

/** Optional and safe to embed inside the wizard's existing form. */
export function ModelRequest({ listingId }: { listingId: string }) {
  const noteId = useId();
  const [open, setOpen] = useState(false);
  const [request, setRequest] = useState<ModelingRequest | null>(null);
  const [note, setNote] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const submitting = useRef(false);
  const postController = useRef<AbortController | null>(null);
  useEffect(() => {
    setRequest(null);
    setNote("");
    setNotice("");
    setError("");
    setBusy(false);
    setLoading(true);
    return () => {
      postController.current?.abort();
      submitting.current = false;
    };
  }, [listingId]);
  useEffect(() => {
    if (!open || !listingId) return;
    const controller = new AbortController();
    setLoading(true);
    setError("");
    void api<{ data: ModelingRequest | null }>(
      `/api/listings/${encodeURIComponent(listingId)}/modeling-request`,
      { signal: controller.signal },
    )
      .then(({ data }) => {
        if (!controller.signal.aborted) setRequest(data);
      })
      .catch((error) => {
        if (!controller.signal.aborted) setError((error as Error).message);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [open, listingId, attempt]);
  async function submit() {
    if (submitting.current || loading || error || request || !listingId) return;
    submitting.current = true;
    setBusy(true);
    setError("");
    setNotice("");
    const pending = new AbortController();
    postController.current = pending;
    try {
      const { data } = await api<{ data: ModelingRequest }>(
        `/api/listings/${encodeURIComponent(listingId)}/modeling-request`,
        {
          method: "POST",
          body: JSON.stringify({ note: note.trim() }),
          signal: pending.signal,
        },
      );
      if (pending.signal.aborted) return;
      setRequest(data);
      setNotice(
        "Votre demande est enregistrée. Vous pouvez suivre son état ci-dessous.",
      );
    } catch (error) {
      if (!pending.signal.aborted) setError((error as Error).message);
    } finally {
      if (!pending.signal.aborted) {
        submitting.current = false;
        setBusy(false);
      }
    }
  }
  return (
    <details
      className="account-fieldset modeling-request"
      open={open}
      onToggle={(event) => setOpen(event.currentTarget.open)}
    >
      <summary>
        <Box size={17} aria-hidden="true" /> Modélisation 3D · facultatif
      </summary>
      <div>
        <p className="muted small">
          Demandez une vue 3D à partir de vos plans et photos. Cette demande ne
          bloque pas la publication de l’annonce.
        </p>
        {loading && open ? (
          <p role="status">Chargement de la demande…</p>
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
        {request ? (
          <>
            <p role="status">
              <span className="badge">
                {modelingRequestStatusLabels[request.status]}
              </span>{" "}
              <span className="muted small">
                Mise à jour le {requestDate(request.updatedAt)}
              </span>
            </p>
            {request.note ? (
              <p style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>
                <strong>Votre note privée :</strong> {request.note}
              </p>
            ) : null}
            {request.status === "ready" ? (
              <p className="small muted">
                La disponibilité publique du plan reste soumise à son contrôle.
              </p>
            ) : request.status === "declined" ? (
              <p className="small muted">
                Consultez les éléments de votre annonce et complétez vos plans
                ou photos si nécessaire.
              </p>
            ) : null}
          </>
        ) : !loading && !error ? (
          <>
            <label className="field" htmlFor={noteId}>
              Note pour l’équipe · facultatif
              <textarea
                id={noteId}
                className="input"
                rows={3}
                maxLength={2000}
                value={note}
                disabled={busy}
                onChange={(event) => setNote(event.target.value)}
                placeholder="Ex. plan du niveau −1 disponible, deux places à modéliser…"
              />
            </label>
            <p className="small muted">
              Note visible uniquement par vous et l’équipe.
            </p>
            <button
              className="button button-secondary"
              type="button"
              disabled={busy}
              onClick={() => void submit()}
            >
              {busy ? "Enregistrement…" : "Demander une modélisation 3D"}
            </button>
          </>
        ) : null}
        <div className="account-review-actions">
          <Link
            href={`/compte/scenes?listingId=${encodeURIComponent(listingId)}`}
            className="text-button"
          >
            Ajouter un plan
          </Link>
          <button
            type="button"
            className="text-button"
            disabled={loading || busy}
            onClick={() => setAttempt((value) => value + 1)}
          >
            <RefreshCw size={14} /> Actualiser le suivi
          </button>
        </div>
      </div>
    </details>
  );
}

function AdminRequestEditor({
  request,
  onSaved,
  onBusyChange,
  onReload,
  onClose,
  disabled,
}: {
  request: AdminModelingRequest;
  onSaved: (request: AdminModelingRequest) => void;
  onBusyChange: (busy: boolean) => void;
  onReload: () => void;
  onClose: () => void;
  disabled: boolean;
}) {
  const [status, setStatus] = useState<ModelingRequestStatus>(request.status);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [needsReload, setNeedsReload] = useState(false);
  const submitting = useRef(false);
  const detail = useRef<HTMLElement>(null);
  useEffect(() => {
    detail.current?.focus({ preventScroll: true });
    detail.current?.scrollIntoView({
      block: "start",
      behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches
        ? "instant"
        : "smooth",
    });
  }, []);
  async function save() {
    if (
      submitting.current ||
      disabled ||
      needsReload ||
      status === request.status
    )
      return;
    submitting.current = true;
    setBusy(true);
    onBusyChange(true);
    setError("");
    try {
      const { data } = await api<{ data: AdminModelingRequest }>(
        "/api/admin/modeling-requests",
        {
          method: "PATCH",
          body: JSON.stringify({
            listingId: request.listingId,
            status,
            version: request.version,
          }),
        },
      );
      if (!modelingDecisionConfirmed(request, status, data)) {
        throw new Error(
          "Le changement n’a pas pu être confirmé. Actualisez la demande avant de poursuivre.",
        );
      }
      onSaved(data);
    } catch (error) {
      setError((error as Error).message);
      setNeedsReload(true);
    } finally {
      submitting.current = false;
      setBusy(false);
      onBusyChange(false);
    }
  }
  return (
    <article
      id="modeling-request-dossier"
      className="card account-review-detail"
      ref={detail}
      tabIndex={-1}
      aria-label={`Demande 3D · ${request.listingTitle || "Annonce sans titre"}`}
    >
      <div className="account-section-title">
        <h3>{request.listingTitle || "Annonce sans titre"}</h3>
        <button
          type="button"
          className="text-button"
          style={{ flexShrink: 0, whiteSpace: "nowrap" }}
          disabled={busy}
          onClick={onClose}
        >
          Fermer
        </button>
      </div>
      <p className="muted small">
        {request.ownerName} · demande du {requestDate(request.requestedAt)} ·
        mise à jour le {requestDate(request.updatedAt)}
      </p>
      <p>
        <strong>Note privée du demandeur</strong>
      </p>
      <p style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>
        {request.note || "Aucune note ajoutée."}
      </p>
      <div className="field">
        <span>Statut de préparation</span>
        <FilterSelect
          label="Statut de la demande 3D"
          variant="field"
          value={status}
          onChange={(value) => setStatus(value as ModelingRequestStatus)}
          options={statusOptions}
          disabled={busy || disabled || needsReload}
        />
      </div>
      {error ? (
        <p className="error" role="alert">
          {error}
        </p>
      ) : null}
      {needsReload ? (
        <button
          type="button"
          className="button button-secondary"
          disabled={busy || disabled}
          onClick={onReload}
        >
          Actualiser la demande
        </button>
      ) : null}
      <p className="small muted">
        Une préparation terminée reste soumise au contrôle et à la publication
        distincte du plan.
      </p>
      <div className="account-review-actions">
        <button
          type="button"
          className="button button-primary"
          disabled={
            busy || disabled || needsReload || status === request.status
          }
          onClick={() => void save()}
        >
          {busy ? "Enregistrement…" : "Enregistrer le statut"}
        </button>
        <Link
          className="button button-secondary"
          href={`/admin/parkings?listingId=${encodeURIComponent(request.listingId)}`}
        >
          Consulter le dossier du parking
        </Link>
        <Link
          className="text-button"
          href={`/admin/scenes?listingId=${encodeURIComponent(request.listingId)}`}
        >
          Contrôler les plans et vues 3D
        </Link>
      </div>
    </article>
  );
}

export function AdminModelingRequests() {
  const [items, setItems] = useState<AdminModelingRequest[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [total, setTotal] = useState(0);
  const [firstOffset, setFirstOffset] = useState(0);
  const [nextOffset, setNextOffset] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [status, setStatus] = useState("all");
  const [saving, setSaving] = useState(false);
  const [reviewEpoch, setReviewEpoch] = useState(0);
  const [failedLoad, setFailedLoad] = useState<{
    offset: number;
    append: boolean;
    recovery?: AdminModelingRequest;
  } | null>(null);
  const controller = useRef<AbortController | null>(null);
  // Keep server offsets: deduplication can make a row's displayed index differ.
  const pageOffsets = useRef(new Map<string, number>());
  const load = useCallback(
    async (offset = 0, append = false, recovery?: AdminModelingRequest) => {
      controller.current?.abort();
      const pending = new AbortController();
      controller.current = pending;
      setLoading(!append);
      setLoadingMore(append);
      setError("");
      setFailedLoad(null);
      if (recovery) setNotice("");
      try {
        const data = await loadModelingRequestPage(
          api,
          status,
          offset,
          pending.signal,
        );
        if (pending.signal.aborted) return;
        const recovered = recovery
          ? reloadedModelingRequest(recovery, data)
          : null;
        if (!append) pageOffsets.current.clear();
        for (const item of data.requests)
          pageOffsets.current.set(item.listingId, data.offset);
        setItems((current) =>
          append
            ? [
                ...current,
                ...data.requests.filter(
                  (item) =>
                    !current.some(
                      (previous) => previous.listingId === item.listingId,
                    ),
                ),
              ]
            : data.requests,
        );
        setTotal(data.total);
        setNextOffset(data.offset + data.requests.length);
        setHasMore(data.hasMore);
        if (!append) {
          setFirstOffset(data.offset);
          setReviewEpoch((value) => value + 1);
          setSelectedId((current) =>
            data.requests.some((item) => item.listingId === current)
              ? current
              : null,
          );
        }
        if (recovery)
          setNotice(
            recovered
              ? "Demande actualisée. Vérifiez son statut avant de poursuivre."
              : "La demande ne figure plus sur cette page. Elle a pu changer de statut ou de position. Parcourez la file ou changez le filtre pour la retrouver.",
          );
      } catch (error) {
        if (!pending.signal.aborted) {
          setError((error as Error).message);
          setFailedLoad({ offset, append, recovery });
        }
      } finally {
        if (!pending.signal.aborted) {
          setLoading(false);
          setLoadingMore(false);
        }
      }
    },
    [status],
  );
  useEffect(() => {
    setItems([]);
    setSelectedId(null);
    setTotal(0);
    setFirstOffset(0);
    setHasMore(false);
    pageOffsets.current.clear();
    setNotice("");
    void load();
    return () => controller.current?.abort();
  }, [load]);
  const selected = items.find((request) => request.listingId === selectedId);
  const reloadSelected = () =>
    void load(
      selected
        ? (pageOffsets.current.get(selected.listingId) ?? firstOffset)
        : firstOffset,
      false,
      selected,
    );
  return (
    <section
      id="demandes-3d"
      className="account-modeling-requests"
      style={{ marginTop: 32, scrollMarginTop: 24 }}
    >
      <div className="account-section-title">
        <h2>
          Demandes 3D{" "}
          <span className="badge">
            {loading ? "…" : error ? "À actualiser" : total}
          </span>
        </h2>
        <button
          type="button"
          className="button button-secondary"
          disabled={loading || loadingMore || saving}
          onClick={reloadSelected}
        >
          <RefreshCw size={16} /> Actualiser
        </button>
      </div>
      <p className="muted">
        Préparation manuelle des vues demandées par les annonceurs. Les demandes
        en attente et en cours apparaissent en premier.
      </p>
      <div className="admin-review-toolbar">
        <FilterSelect
          label="Filtrer les demandes 3D"
          value={status}
          onChange={setStatus}
          options={[
            { value: "all", label: "Toutes les demandes" },
            ...statusOptions,
          ]}
          disabled={saving}
        />
      </div>
      {notice ? (
        <p className="notice" role="status">
          {notice}
        </p>
      ) : null}
      {error ? (
        <p className="error" role="alert">
          {error}
        </p>
      ) : null}
      {failedLoad ? (
        <button
          type="button"
          className="button button-secondary"
          disabled={loading || loadingMore || saving}
          onClick={() =>
            void load(failedLoad.offset, failedLoad.append, failedLoad.recovery)
          }
        >
          Réessayer le chargement
        </button>
      ) : null}
      {loading ? <p role="status">Chargement des demandes 3D…</p> : null}
      {firstOffset > 0 ? (
        <div className="account-review-actions">
          <p className="small muted">
            {items.length
              ? `Demandes ${firstOffset + 1} à ${nextOffset} sur ${total}.`
              : "Aucune demande sur cette page."}
          </p>
          <button
            type="button"
            className="text-button"
            disabled={loading || loadingMore || saving}
            onClick={() => {
              setNotice("");
              void load();
            }}
          >
            Revenir aux premières demandes
          </button>
        </div>
      ) : null}
      <div className="account-list">
        {items.map((request) => (
          <button
            type="button"
            key={request.listingId}
            className={`account-review-row ${request.listingId === selectedId ? "active" : ""}`}
            disabled={saving || loading || loadingMore || Boolean(error)}
            onClick={() => setSelectedId(request.listingId)}
            aria-expanded={request.listingId === selectedId}
            aria-controls="modeling-request-dossier"
          >
            <div>
              <strong>{request.listingTitle || "Annonce sans titre"}</strong>
              <span>
                {request.ownerName} · {requestDate(request.requestedAt)}
              </span>
            </div>
            <span>{modelingRequestStatusLabels[request.status]}</span>
          </button>
        ))}
      </div>
      {!loading && !error && !items.length && firstOffset === 0 ? (
        <p className="notice">
          {status === "all"
            ? "Aucune demande de modélisation pour le moment."
            : "Aucune demande avec ce statut."}
        </p>
      ) : null}
      {hasMore ? (
        <button
          type="button"
          className="button button-secondary"
          disabled={loading || loadingMore || saving || Boolean(error)}
          onClick={() => void load(nextOffset, true)}
        >
          {loadingMore ? "Chargement…" : "Afficher plus de demandes"}
        </button>
      ) : null}
      {selected ? (
        <AdminRequestEditor
          key={`${selected.listingId}:${selected.version}:${reviewEpoch}`}
          request={selected}
          disabled={loading || loadingMore || Boolean(error)}
          onBusyChange={setSaving}
          onReload={reloadSelected}
          onClose={() => setSelectedId(null)}
          onSaved={(saved) => {
            setSelectedId(null);
            setItems((current) =>
              current.map((item) =>
                item.listingId === saved.listingId ? saved : item,
              ),
            );
            setNotice(
              `Statut enregistré : ${modelingRequestStatusLabels[saved.status]}.`,
            );
            void load(firstOffset);
          }}
        />
      ) : null}
    </section>
  );
}
