"use client";
import { listingPrice } from "@/lib/listing-price";
import { ListingOffersTable } from "../ListingOffers";
import { useEffect, useState } from "react";
import type { Listing } from "@/lib/types";
import { money } from "@/lib/types";
import { api } from "./shared";
export default function Publications() {
  const [items, setItems] = useState<Listing[]>([]),
    [selected, setSelected] = useState<Listing | null>(null),
    [reason, setReason] = useState(""),
    [confirmed, setConfirmed] = useState(false),
    [busy, setBusy] = useState(false),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(""),
    [notice, setNotice] = useState("");
  async function load() {
    setLoading(true);
    try {
      const r = await api<{ data: Listing[] }>("/api/admin/publications");
      setItems(r.data);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    void load();
  }, []);
  async function suspend(e: React.FormEvent) {
    e.preventDefault();
    if (!selected || !confirmed || reason.trim().length < 15) return;
    setBusy(true);
    setError("");
    try {
      await api(`/api/admin/listings/${selected.id}/suspend`, {
        method: "POST",
        body: JSON.stringify({
          version: selected.version,
          reason: reason.trim(),
        }),
      });
      setNotice(
        `« ${selected.title} » a été suspendue. Une correction puis une nouvelle modération sont nécessaires.`,
      );
      setSelected(null);
      setReason("");
      setConfirmed(false);
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="account-publications">
      <div className="account-section-title">
        <h2>Publications actives</h2>
        <button
          className="button button-secondary"
          disabled={busy || loading}
          onClick={() => {
            setError("");
            void load();
          }}
        >
          Actualiser les publications
        </button>
      </div>
      <p className="muted">
        Examinez une publication existante pour la suspendre avec un motif. Les
        conversations sont conservées.
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
        <p role="status">Chargement…</p>
      ) : items.length ? (
        <div className="account-list">
          {items.map((item) => (
            <button
              className="account-review-row"
              key={item.id}
              disabled={busy}
              onClick={() => {
                setSelected(item);
                setReason("");
                setConfirmed(false);
                setError("");
              }}
            >
              <span>
                <strong>{item.title}</strong>
                <span>
                  {item.city} · version {item.version}
                </span>
              </span>
              <span>{listingPrice(item)} · Examiner</span>
            </button>
          ))}
        </div>
      ) : (
        <p className="notice">Aucune publication active à examiner.</p>
      )}
      {selected ? (
        <form className="card account-review-detail" onSubmit={suspend}>
          <h3>Suspendre « {selected.title} »</h3>
          <p>
            {selected.city} · {selected.district} · {listingPrice(selected)} ·
            version {selected.version}
          </p>
          <ListingOffersTable listing={selected} />
          <p className="notice">
            L’annonce, sa scène et ses médias publics seront masqués. Le vendeur
            devra corriger puis soumettre une nouvelle version ; aucune remise
            en ligne directe n’est proposée.
          </p>
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
              onClick={() => setSelected(null)}
            >
              Annuler
            </button>
          </div>
        </form>
      ) : null}
    </section>
  );
}
