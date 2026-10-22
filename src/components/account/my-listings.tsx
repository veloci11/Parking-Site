"use client";
import { listingPrice, offerLabel } from "@/lib/listing-price";
import { pricingScope, ListingOffersTable } from "../ListingOffers";
import { ModelRequest } from "./modeling-request";
import { useEffect, useState } from "react";
import Link from "next/link";
import { Check, ClipboardList, Pause, Plus, X } from "lucide-react";
import { AccountGate, AccountShell, api, statusLabels } from "./shared";
import { areaLabel, typeLabels, type Listing, type User } from "@/lib/types";
function Content({ user }: { user: User }) {
  const [items, setItems] = useState<Listing[]>([]),
    [filter, setFilter] = useState("all"),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(""),
    [notice, setNotice] = useState("");
  function load() {
    return api<{ data: Listing[] }>("/api/me/listings")
      .then((r) => setItems(r.data))
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }
  useEffect(() => {
    load();
  }, []);
  async function lifecycle(item: Listing, action: string) {
    if (
      (action === "sold" || action === "withdraw") &&
      !window.confirm(
        action === "sold"
          ? "Confirmer que ce bien est vendu ? Il ne sera plus proposé aux acheteurs."
          : "Retirer cette annonce de la recherche ?",
      )
    )
      return;
    setBusy(item.id);
    setError("");
    try {
      await api(`/api/listings/${item.id}/lifecycle`, {
        method: "POST",
        body: JSON.stringify({ action, version: item.version }),
      });
      setNotice("Le statut de votre annonce a été mis à jour.");
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy("");
    }
  }
  async function reconfirm(item: Listing) {
    setBusy(item.id);
    setError("");
    try {
      await api(`/api/listings/${item.id}/availability`, {
        method: "POST",
        body: JSON.stringify({ version: item.version }),
      });
      setNotice("La disponibilité a été confirmée pour 90 jours.");
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy("");
    }
  }
  const visible = items.filter((l) => filter === "all" || l.status === filter);
  return (
    <AccountShell
      user={user}
      title="Mes annonces"
      action={
        <Link href="/deposer" className="button button-primary">
          <Plus size={18} />
          Déposer une annonce
        </Link>
      }
    >
      <p className="muted account-lead">
        De la première photo à la visite, gardez la main sur chaque étape.
      </p>
      <div
        className="account-tabs"
        role="group"
        aria-label="Filtrer mes annonces"
      >
        {[
          ["all", "Toutes"],
          ["draft", "Brouillons"],
          ["pending", "En relecture"],
          ["published", "En ligne"],
          ["changes_requested", "À compléter"],
          ["sold", "Vendues ou louées"],
          ["suspended", "Suspendues"],
          ["expired", "Expirées"],
        ].map(([v, l]) => (
          <button
            className={filter === v ? "active" : ""}
            key={v}
            aria-pressed={filter === v}
            onClick={() => setFilter(v)}
          >
            {l}
            {v === "all" ? ` (${items.length})` : ""}
          </button>
        ))}
      </div>
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
      ) : visible.length ? (
        <div className="account-list">
          {visible.map((l) => (
            <article className="account-manage-listing card" key={l.id}>
              <div className="account-listing-image">
                {l.photos[0] ? (
                  <img src={l.photos[0]} alt={l.title} />
                ) : (
                  <ClipboardList size={28} />
                )}
              </div>
              <div className="account-manage-copy">
                <div>
                  <span className={`badge account-status-${l.status}`}>
                    {l.status === "sold" && l.pricingMode === "per_space"
                      ? "Offres clôturées"
                      : l.status === "sold" && l.transactionType === "rent"
                        ? "Louée"
                        : statusLabels[l.status] || l.status}
                  </span>
                  {l.isDemo ? (
                    <span className="badge">Exemple fictif</span>
                  ) : null}
                </div>
                <h2>{l.title || "Votre nouvelle annonce"}</h2>
                <p className="muted">
                  {l.city} · {typeLabels[l.type]} · {areaLabel(l.spaces)}
                </p>
                <strong>
                  {listingPrice(l)}
                  {l.spaces.length > 1
                    ? ` · ${l.spaces.length} places dans l’annonce`
                    : ""}
                </strong>
                <p className="small muted">
                  {offerLabel(l)} · {pricingScope(l)}
                </p>
                <ListingOffersTable listing={l} />
                {l.availabilityConfirmedAt || l.availabilityExpiresAt ? (
                  <p className="muted">
                    {l.availabilityConfirmedAt
                      ? `Disponibilité confirmée le ${new Date(l.availabilityConfirmedAt).toLocaleDateString("fr-FR", { timeZone: "UTC" })}. `
                      : ""}
                    {l.availabilityExpiresAt
                      ? `Échéance le ${new Date(l.availabilityExpiresAt).toLocaleDateString("fr-FR", { timeZone: "UTC" })}.`
                      : ""}
                  </p>
                ) : null}
                {l.status === "suspended" ? (
                  <p className="notice">
                    Cette annonce est masquée. Corrigez le dossier puis
                    soumettez une nouvelle version à la modération.
                  </p>
                ) : null}
                {l.rejectionReason ? (
                  <p className="notice">
                    Retour de modération : {l.rejectionReason}
                  </p>
                ) : null}
                <div className="account-listing-actions">
                  <Link
                    href={`/compte/annonces/${l.id}/modifier`}
                    className="button button-secondary"
                  >
                    {l.status === "published"
                      ? "Préparer une modification"
                      : "Reprendre l’annonce"}
                  </Link>
                  {l.status === "published" ? (
                    <button
                      className="button button-secondary"
                      disabled={busy === l.id}
                      onClick={() => void reconfirm(l)}
                    >
                      Confirmer disponible 90 jours
                    </button>
                  ) : null}
                  {l.status === "expired" ? (
                    <p className="notice">
                      Cette annonce a expiré et n’est plus publique. Corrigez ou
                      confirmez son contenu dans « Reprendre l’annonce », puis
                      soumettez-la à nouveau à la modération. Aucune remise en
                      ligne directe.
                    </p>
                  ) : null}
                  {l.status === "published" && l.spaces.length > 1 ? (
                    <Link
                      href={`/compte/annonces/${l.id}/modifier${l.pricingMode === "per_space" ? "" : "?partial=1"}`}
                      className="button button-secondary"
                    >
                      {l.pricingMode === "per_space"
                        ? "Gérer prix et statuts par place"
                        : "Une partie du lot est vendue ou louée"}
                    </Link>
                  ) : null}
                  {l.status === "published" ? (
                    <>
                      <button
                        disabled={busy === l.id}
                        className="button button-secondary"
                        onClick={() => lifecycle(l, "pause")}
                      >
                        <Pause size={16} />
                        Pause
                      </button>
                      {l.pricingMode !== "per_space" ? (
                        <button
                          disabled={busy === l.id}
                          className="button button-secondary"
                          onClick={() => lifecycle(l, "sold")}
                        >
                          <Check size={16} />
                          {l.transactionType === "rent" ? "Louée" : "Vendue"}
                        </button>
                      ) : null}
                    </>
                  ) : null}
                  {l.status === "paused" ? (
                    <button
                      disabled={busy === l.id}
                      className="button button-secondary"
                      onClick={() => lifecycle(l, "resume")}
                    >
                      Remettre en ligne
                    </button>
                  ) : null}
                  {["published", "paused", "pending"].includes(l.status) ? (
                    <button
                      disabled={busy === l.id}
                      className="button button-secondary"
                      onClick={() => lifecycle(l, "withdraw")}
                    >
                      <X size={16} />
                      Retirer
                    </button>
                  ) : null}
                </div>
                <ModelRequest listingId={l.id} />
              </div>
            </article>
          ))}
        </div>
      ) : (
        <div className="empty-state account-empty">
          <ClipboardList size={32} />
          <h2>Aucune annonce ici pour le moment.</h2>
          <p>
            Vos annonces et leurs prochaines étapes apparaîtront dans cet
            espace.
          </p>
          <Link href="/deposer" className="button button-primary">
            Déposer une annonce
          </Link>
        </div>
      )}
    </AccountShell>
  );
}
export default function MyListings() {
  return <AccountGate>{(u) => <Content user={u} />}</AccountGate>;
}
