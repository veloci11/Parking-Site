"use client";
import { listingPrice, offerLabel } from "@/lib/listing-price";
import { pricingScope, ListingOffersTable } from "../ListingOffers";
import { ModelRequest } from "./modeling-request";
import { useCallback, useEffect, useRef, useState } from "react";
import SafePhoto from "../SafePhoto";
import { updateManagedListing } from "@/lib/seller-account-state";
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
    [needsRefresh, setNeedsRefresh] = useState(false),
    [notice, setNotice] = useState("");
  const readController = useRef<AbortController | null>(null);
  const sending = useRef(false);
  const mounted = useRef(true);
  const load = useCallback(async () => {
    if (sending.current) return;
    readController.current?.abort();
    const controller = new AbortController();
    readController.current = controller;
    setLoading(true);
    setError("");
    setNotice("");
    try {
      const result = await api<{ data: Listing[] }>("/api/me/listings", {
        signal: controller.signal,
      });
      if (controller.signal.aborted) return;
      setItems(result.data);
      setNeedsRefresh(false);
    } catch (e) {
      if (controller.signal.aborted) return;
      setError((e as Error).message);
      setNeedsRefresh(true);
    } finally {
      if (!controller.signal.aborted) {
        readController.current = null;
        setLoading(false);
      }
    }
  }, []);
  useEffect(() => {
    mounted.current = true;
    void load();
    return () => {
      mounted.current = false;
      readController.current?.abort();
    };
  }, [load]);
  async function changeStatus(item: Listing, action: string) {
    if (sending.current || readController.current || needsRefresh) return;
    if (
      (action === "sold" || action === "withdraw") &&
      !window.confirm(
        action === "sold"
          ? `Confirmer que ce bien est ${item.transactionType === "rent" ? "loué" : "vendu"} ? L’annonce ne sera plus visible dans les résultats.`
          : "Retirer cette annonce de la recherche ?",
      )
    )
      return;
    sending.current = true;
    setBusy(item.id);
    setError("");
    setNotice("");
    try {
      const result = await api<{ data: Listing }>(
        `/api/listings/${item.id}/${action === "availability" ? "availability" : "lifecycle"}`,
        {
          method: "POST",
          body: JSON.stringify({
            ...(action === "availability" ? {} : { action }),
            version: item.version,
          }),
        },
      );
      if (!mounted.current) return;
      // Keep all other rows mounted, including any unsent 3D request.
      const updated = updateManagedListing(items, item.id, result.data);
      setItems(updated);
      setNotice(
        action === "availability"
          ? "La disponibilité a été confirmée pour 90 jours."
          : "Le statut de votre annonce a été mis à jour.",
      );
    } catch (e) {
      if (!mounted.current) return;
      setError(
        `${(e as Error).message} Actualisez vos annonces avant une nouvelle action.`,
      );
      // A lost response may still follow a successful write. Reload before retrying.
      setNeedsRefresh(true);
    } finally {
      sending.current = false;
      if (mounted.current) setBusy("");
    }
  }
  const actionsDisabled = !!busy || loading || needsRefresh;
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
      <nav className="account-listing-tools" aria-label="Outils des annonces">
        <Link href="/compte/scenes">Plans et vues 3D</Link>
        <Link href="/compte/parkings">Parkings associés</Link>
        <Link href="/compte/abonnement">Capacité de publication</Link>
      </nav>
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
          ["paused", "En pause"],
          ["changes_requested", "À compléter"],
          ["rejected", "Refusées"],
          ["sold", "Vendues ou louées"],
          ["suspended", "Suspendues"],
          ["expired", "Expirées"],
          ["withdrawn", "Retirées"],
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
        <div>
          <p className="error" role="alert">
            {error}
          </p>
          <button
            type="button"
            className="button button-secondary"
            disabled={loading || !!busy}
            onClick={() => void load()}
          >
            Actualiser mes annonces
          </button>
        </div>
      ) : null}
      {busy || notice ? (
        <p className="notice" role="status">
          {busy ? "Mise à jour de l’annonce…" : notice}
        </p>
      ) : null}
      {loading && items.length === 0 ? (
        <p role="status">Chargement…</p>
      ) : visible.length ? (
        <div className="account-list">
          {visible.map((l) => (
            <article className="account-manage-listing card" key={l.id}>
              <div className="account-listing-image">
                {l.photos[0] ? (
                  <SafePhoto
                    src={l.photos[0]}
                    alt={l.title}
                    width={184}
                    height={148}
                    sizes="(max-width: 700px) calc(100vw - 64px), (max-width: 980px) 140px, 184px"
                  />
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
                      ? "Modifier"
                      : "Reprendre l’annonce"}
                  </Link>
                  {l.status === "published" ? (
                    <button
                      className="button button-secondary"
                      disabled={actionsDisabled}
                      onClick={() => void changeStatus(l, "availability")}
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
                        disabled={actionsDisabled}
                        className="button button-secondary"
                        onClick={() => changeStatus(l, "pause")}
                      >
                        <Pause size={16} />
                        Pause
                      </button>
                      {l.pricingMode !== "per_space" ? (
                        <button
                          disabled={actionsDisabled}
                          className="button button-secondary"
                          onClick={() => changeStatus(l, "sold")}
                        >
                          <Check size={16} />
                          {l.transactionType === "rent" ? "Louée" : "Vendue"}
                        </button>
                      ) : null}
                    </>
                  ) : null}
                  {l.status === "paused" ? (
                    <button
                      disabled={actionsDisabled}
                      className="button button-secondary"
                      onClick={() => changeStatus(l, "resume")}
                    >
                      Remettre en ligne
                    </button>
                  ) : null}
                  {["published", "paused", "pending"].includes(l.status) ? (
                    <button
                      disabled={actionsDisabled}
                      className="button button-secondary"
                      onClick={() => changeStatus(l, "withdraw")}
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
      ) : error ? null : (
        <div className="empty-state account-empty">
          <ClipboardList size={32} />
          <h2>
            {filter === "all"
              ? "Aucune annonce"
              : "Aucune annonce dans cette catégorie"}
          </h2>
          {filter === "all" ? (
            <Link href="/deposer" className="button button-primary">
              Déposer une annonce
            </Link>
          ) : (
            <button
              className="button button-secondary"
              onClick={() => setFilter("all")}
            >
              Toutes mes annonces
            </button>
          )}
        </div>
      )}
    </AccountShell>
  );
}
export default function MyListings() {
  return <AccountGate>{(u) => <Content user={u} />}</AccountGate>;
}
