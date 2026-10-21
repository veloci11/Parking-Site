"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowRight, Check, ClipboardList, Pause, Plus, X } from "lucide-react";
import { AccountGate, AccountShell, api, statusLabels } from "./shared";
import {
  areaLabel,
  money,
  typeLabels,
  type Listing,
  type User,
} from "@/lib/types";
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
          ["sold", "Vendues"],
          ["suspended", "Suspendues"],
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
                    {statusLabels[l.status] || l.status}
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
                  {money(l.priceCents)}
                  {l.spaces.length > 1
                    ? ` · lot de ${l.spaces.length} places`
                    : ""}
                </strong>
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
                    <ArrowRight size={16} />
                  </Link>
                  {l.status === "published" && l.spaces.length > 1 ? (
                    <Link
                      href={`/compte/annonces/${l.id}/modifier?partial=1`}
                      className="button button-secondary"
                    >
                      Une partie du lot est vendue
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
                      <button
                        disabled={busy === l.id}
                        className="button button-secondary"
                        onClick={() => lifecycle(l, "sold")}
                      >
                        <Check size={16} />
                        Vendue
                      </button>
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
