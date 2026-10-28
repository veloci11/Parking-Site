"use client";
import { listingPrice } from "@/lib/listing-price";
import { ListingOffersTable } from "../ListingOffers";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import type { Listing } from "@/lib/types";
import { api } from "./shared";
import {
  isRevisionReviewed,
  type ReviewedRevision,
} from "@/lib/moderation-review";
import { filterAdminReviewItems } from "@/lib/admin-review-search";
import type { AdminPublication } from "@/lib/admin-review-publication";

export default function Publications({
  refreshKey = 0,
  onSuspended,
}: {
  refreshKey?: number;
  onSuspended?: () => void;
}) {
  const [items, setItems] = useState<AdminPublication[]>([]),
    [selectedId, setSelectedId] = useState<string | null>(null),
    [reason, setReason] = useState(""),
    [confirmation, setConfirmation] = useState<ReviewedRevision | null>(null),
    [query, setQuery] = useState(""),
    [busy, setBusy] = useState(false),
    [loading, setLoading] = useState(true),
    [loadError, setLoadError] = useState(""),
    [needsRefresh, setNeedsRefresh] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState("");
  const loadGeneration = useRef(0);
  const mutationPending = useRef(false);
  const detail = useRef<HTMLFormElement>(null);
  const feedback = useRef<HTMLParagraphElement>(null);
  const selected = items.find((item) => item.id === selectedId);
  const confirmed =
    !loading &&
    !loadError &&
    !needsRefresh &&
    isRevisionReviewed(selected, confirmation);
  const visibleItems = filterAdminReviewItems(items, query);

  async function load() {
    const generation = ++loadGeneration.current;
    setLoading(true);
    setLoadError("");
    try {
      const response = await api<{ data: AdminPublication[] }>(
        "/api/admin/publications",
      );
      if (generation !== loadGeneration.current) return;
      setItems(response.data);
      setNeedsRefresh(false);
      setSelectedId((current) =>
        response.data.some((entry) => entry.id === current) ? current : null,
      );
    } catch (e) {
      if (generation === loadGeneration.current)
        setLoadError((e as Error).message);
    } finally {
      if (generation === loadGeneration.current) setLoading(false);
    }
  }
  useEffect(() => {
    void load();
    return () => {
      loadGeneration.current++;
    };
  }, [refreshKey]);
  useEffect(() => {
    if (!selectedId) return;
    detail.current?.focus({ preventScroll: true });
    detail.current?.scrollIntoView({
      block: "start",
      behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches
        ? "instant"
        : "smooth",
    });
  }, [selectedId]);
  useEffect(() => {
    if (!error && !notice) return;
    feedback.current?.focus({ preventScroll: true });
    feedback.current?.scrollIntoView({ block: "center", behavior: "instant" });
  }, [error, notice]);

  async function suspend(e: React.FormEvent) {
    e.preventDefault();
    if (
      !selected ||
      !confirmed ||
      reason.trim().length < 15 ||
      mutationPending.current
    )
      return;
    mutationPending.current = true;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const response = await api<{ data: Listing }>(
        `/api/admin/listings/${selected.id}/suspend`,
        {
          method: "POST",
          body: JSON.stringify({
            version: selected.version,
            reason: reason.trim(),
          }),
        },
      );
      if (response.data?.status !== "suspended") {
        throw new Error(
          "La suspension n’a pas pu être confirmée. Actualisez les publications avant de poursuivre.",
        );
      }
      setNotice(
        `« ${selected.title} » a été suspendue. Une correction puis une nouvelle modération sont nécessaires.`,
      );
      setSelectedId(null);
      setReason("");
      setConfirmation(null);
      onSuspended?.();
      await load();
    } catch (e) {
      setError((e as Error).message);
      setNeedsRefresh(true);
      setConfirmation(null);
    } finally {
      mutationPending.current = false;
      setBusy(false);
    }
  }
  return (
    <section className="account-publications" id="publications">
      <div className="account-section-title">
        <h2>Publications à examiner</h2>
        <button
          className="button button-secondary"
          disabled={busy || loading}
          onClick={() => {
            void load();
          }}
        >
          Actualiser les publications
        </button>
      </div>
      <p className="muted">
        Recherchez une annonce pour examiner sa publication ou la suspendre avec
        un motif. Les conversations sont conservées.
      </p>
      {error ? (
        <p className="error" role="alert" ref={feedback} tabIndex={-1}>
          {error}
        </p>
      ) : null}
      {!error && notice ? (
        <p className="notice" role="status" ref={feedback} tabIndex={-1}>
          {notice}
        </p>
      ) : null}
      {loadError ? (
        <p className="error" role="alert">
          Les publications n’ont pas pu être actualisées. {loadError} Utilisez «
          Actualiser les publications » pour réessayer.
        </p>
      ) : null}
      {needsRefresh ? (
        <p className="notice" role="status">
          Actualisez les publications pour vérifier l’état de l’annonce avant
          une nouvelle suspension. Votre motif est conservé.
        </p>
      ) : null}
      <div className="admin-review-toolbar">
        <label className="field admin-review-search">
          Rechercher une publication
          <input
            type="search"
            className="input"
            placeholder="Annonce, ville, vendeur ou référence"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </label>
        {!loading && !loadError ? (
          <span className="small muted" role="status">
            {visibleItems.length} publication
            {visibleItems.length > 1 ? "s" : ""}
          </span>
        ) : null}
      </div>
      {loading ? (
        <p role="status">Chargement des publications…</p>
      ) : items.length ? (
        <div className="account-list">
          {visibleItems.map((item) => (
            <button
              className={`account-review-row ${selectedId === item.id ? "active" : ""}`}
              key={item.id}
              disabled={busy || Boolean(loadError) || needsRefresh}
              aria-expanded={selectedId === item.id}
              aria-controls="publication-dossier"
              onClick={() => {
                if (selectedId === item.id) {
                  detail.current?.focus({ preventScroll: true });
                  detail.current?.scrollIntoView({ block: "start" });
                  return;
                }
                setSelectedId(item.id);
                setReason("");
                setConfirmation(null);
                setError("");
                setNotice("");
              }}
            >
              <div>
                <strong>{item.title}</strong>
                <span>
                  {item.city} · {item.sellerName} ·{" "}
                  {item.publicationState === "visible"
                    ? "En ligne"
                    : "Non visible"}
                </span>
              </div>
              <span>{listingPrice(item)} · Examiner</span>
            </button>
          ))}
          {!visibleItems.length ? (
            <p className="notice">
              Aucune publication ne correspond à cette recherche.
            </p>
          ) : null}
        </div>
      ) : !loadError ? (
        <p className="notice">Aucune publication à examiner.</p>
      ) : null}
      {selected ? (
        <form
          id="publication-dossier"
          className="card account-review-detail"
          onSubmit={suspend}
          ref={detail}
          tabIndex={-1}
          aria-label={`Publication ${selected.title}`}
        >
          <h3>Examiner « {selected.title} »</h3>
          <p>
            {selected.city} · {selected.district} · {listingPrice(selected)} ·
            version publiée {selected.publishedVersion}
          </p>
          <p className="small muted">
            {selected.publicationState === "visible"
              ? "Cette version est visible dans les annonces."
              : "Cette version publiée est conservée mais n’est pas visible dans les annonces."}
            {selected.version !== selected.publishedVersion
              ? " Le dossier a évolué depuis sa publication ; les informations ci-dessous restent celles de la version publiée."
              : ""}
          </p>
          {selected.publicationState === "visible" ? (
            <Link
              className="button button-secondary"
              href={`/annonces/${selected.id}/${selected.slug}`}
              target="_blank"
              rel="noreferrer"
            >
              Consulter l’annonce
            </Link>
          ) : null}
          <ListingOffersTable listing={selected} />
          <p className="account-preview-description">{selected.description}</p>
          <div className="account-photo-grid">
            {selected.photos.map((photo, index) => (
              <a
                href={photo}
                key={`${photo}-${index}`}
                target="_blank"
                rel="noreferrer"
              >
                <img
                  src={photo}
                  loading="lazy"
                  alt={`Photo publiée ${index + 1}`}
                />
                <span>Photo {index + 1}</span>
              </a>
            ))}
          </div>
          <p className="notice">
            Une suspension masque l’annonce, sa scène et ses médias publics. Le
            vendeur devra corriger puis soumettre une nouvelle version ; aucune
            remise en ligne directe n’est proposée.
          </p>
          {confirmation && !isRevisionReviewed(selected, confirmation) ? (
            <p className="notice" role="status">
              L’annonce a changé depuis votre confirmation. Relisez cette
              version avant de confirmer à nouveau.
            </p>
          ) : null}
          <label className="field">
            Motif transmis au vendeur
            <textarea
              className="input"
              minLength={15}
              maxLength={2000}
              required
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              disabled={busy}
              rows={4}
              aria-describedby="suspension-reason-help"
            />
            <span id="suspension-reason-help" className="small muted">
              Décrivez les corrections attendues, au moins 15 caractères.
            </span>
          </label>
          <label className="account-checkbox">
            <input
              type="checkbox"
              checked={confirmed}
              onChange={(e) =>
                setConfirmation(
                  e.target.checked
                    ? { id: selected.id, version: selected.version }
                    : null,
                )
              }
              disabled={busy || loading || Boolean(loadError) || needsRefresh}
            />
            <span>
              Je confirme la suspension de cette annonce et la communication de
              ce motif au vendeur.
            </span>
          </label>
          <div className="account-review-actions">
            <button
              className="button button-primary"
              disabled={busy || !confirmed || reason.trim().length < 15}
            >
              {busy ? "Suspension en cours…" : "Confirmer la suspension"}
            </button>
            <button
              type="button"
              className="button button-secondary"
              disabled={busy}
              onClick={() => setSelectedId(null)}
            >
              Fermer
            </button>
          </div>
        </form>
      ) : null}
    </section>
  );
}
