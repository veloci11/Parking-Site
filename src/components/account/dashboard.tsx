"use client";
import { listingPrice, offerLabel } from "@/lib/listing-price";
import { pricingScope } from "../ListingOffers";
import { useEffect, useState } from "react";
import Link from "next/link";
import { Bell, CheckCircle2, ClipboardList, Mail, Plus } from "lucide-react";
import { NotificationFeed } from "./notifications";
import { AccountGate, AccountShell, api, statusLabels } from "./shared";
import { type Listing, type User, type Conversation } from "@/lib/types";
function DashboardContent({ user }: { user: User }) {
  const [listings, setListings] = useState<Listing[]>([]),
    [conversations, setConversations] = useState<Conversation[]>([]),
    [error, setError] = useState(""),
    [loading, setLoading] = useState(true);
  useEffect(() => {
    Promise.all([
      api<{ data: Listing[] }>("/api/me/listings"),
      api<{ data: Conversation[] }>("/api/conversations"),
    ])
      .then(([a, b]) => {
        setListings(a.data);
        setConversations(b.data);
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);
  return (
    <AccountShell
      user={user}
      title="Mon compte"
      action={
        <Link href="/deposer" className="button button-primary">
          <Plus size={18} />
          Déposer une annonce
        </Link>
      }
    >
      {error ? (
        <p className="error" role="alert">
          {error}
        </p>
      ) : null}
      <div className="account-stats">
        <Link href="/compte/annonces">
          <ClipboardList size={22} />
          <strong>{loading ? "—" : listings.length}</strong>
          <span>Annonce{listings.length > 1 ? "s" : ""}</span>
        </Link>
        <Link href="/compte/messages">
          <Mail size={22} />
          <strong>{loading ? "—" : conversations.length}</strong>
          <span>Conversation{conversations.length > 1 ? "s" : ""}</span>
        </Link>
        <Link href="/compte/annonces">
          <Bell size={22} />
          <strong>
            {loading
              ? "—"
              : listings.filter((l) => l.status === "changes_requested").length}
          </strong>
          <span>À compléter</span>
        </Link>
      </div>
      <div className="account-section-title">
        <h2>Mes dernières annonces</h2>
        <Link href="/compte/annonces">Tout voir</Link>
      </div>
      {loading ? (
        <p role="status">Chargement de vos annonces…</p>
      ) : listings.length ? (
        <div className="account-list">
          {listings.slice(0, 3).map((l) => (
            <Link
              key={l.id}
              className="account-listing"
              href={`/compte/annonces/${l.id}/modifier`}
            >
              <div className="account-listing-image">
                {l.photos[0] ? (
                  <img src={l.photos[0]} alt="" />
                ) : (
                  <ClipboardList size={24} />
                )}
              </div>
              <div>
                <span className={`badge account-status-${l.status}`}>
                  {l.status === "sold" && l.pricingMode === "per_space"
                    ? "Offres clôturées"
                    : l.status === "sold" && l.transactionType === "rent"
                      ? "Louée"
                      : statusLabels[l.status] || l.status}
                </span>
                <h3>{l.title || "Annonce sans titre"}</h3>
                <p className="muted">
                  {l.city || "Ville à préciser"} · {listingPrice(l)}
                </p>
                <p className="small muted">
                  {offerLabel(l)} · {pricingScope(l)}
                </p>
              </div>
            </Link>
          ))}
        </div>
      ) : (
        <div className="empty-state account-empty">
          <CheckCircle2 size={32} />
          <h3>Aucune annonce</h3>
          <p>Vos annonces apparaîtront ici.</p>
          <Link href="/deposer" className="button button-secondary">
            Déposer une annonce
          </Link>
        </div>
      )}
      <NotificationFeed compact />
    </AccountShell>
  );
}
export default function Dashboard() {
  return (
    <AccountGate>{(user) => <DashboardContent user={user} />}</AccountGate>
  );
}
