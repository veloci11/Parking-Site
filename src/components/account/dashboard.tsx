"use client";
import { listingPrice, offerLabel } from "@/lib/listing-price";
import { pricingScope } from "../ListingOffers";
import SafePhoto from "../SafePhoto";
import { loadDashboardSections } from "@/lib/seller-account-state";
import { useEffect, useState } from "react";
import Link from "next/link";
import { Bell, CheckCircle2, ClipboardList, Mail, Plus } from "lucide-react";
import { NotificationFeed } from "./notifications";
import { AccountGate, AccountShell, api, statusLabels } from "./shared";
import { type Listing, type User, type Conversation } from "@/lib/types";
function DashboardContent({ user }: { user: User }) {
  const [listings, setListings] = useState<Listing[] | null>(null),
    [conversations, setConversations] = useState<Conversation[] | null>(null),
    [errors, setErrors] = useState({ listings: "", conversations: "" }),
    [loading, setLoading] = useState({ listings: true, conversations: true }),
    [attempt, setAttempt] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    setLoading({ listings: true, conversations: true });
    setErrors({ listings: "", conversations: "" });
    void loadDashboardSections(api, controller.signal, (result) => {
      if (result.data !== null) {
        if (result.section === "listings") setListings(result.data);
        else setConversations(result.data);
      }
      setErrors((current) => ({
        ...current,
        [result.section]: result.error || "",
      }));
      setLoading((current) => ({ ...current, [result.section]: false }));
    });
    return () => controller.abort();
  }, [attempt]);
  const hasError = !!(errors.listings || errors.conversations);
  const listingsKnown = listings !== null && !errors.listings;
  const conversationsKnown = conversations !== null && !errors.conversations;
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
      {hasError ? (
        <div>
          {errors.listings ? (
            <p className="error" role="alert">
              Annonces : {errors.listings}
            </p>
          ) : null}
          {errors.conversations ? (
            <p className="error" role="alert">
              Conversations : {errors.conversations}
            </p>
          ) : null}
          <button
            type="button"
            className="button button-secondary"
            disabled={loading.listings || loading.conversations}
            onClick={() => setAttempt((current) => current + 1)}
          >
            Réessayer
          </button>
        </div>
      ) : null}
      <div className="account-stats">
        <Link href="/compte/annonces">
          <ClipboardList size={22} />
          <strong>{listingsKnown ? listings.length : "—"}</strong>
          <span>Annonce{(listings?.length || 0) > 1 ? "s" : ""}</span>
        </Link>
        <Link href="/compte/messages">
          <Mail size={22} />
          <strong>{conversationsKnown ? conversations.length : "—"}</strong>
          <span>Conversation{(conversations?.length || 0) > 1 ? "s" : ""}</span>
        </Link>
        <Link href="/compte/annonces">
          <Bell size={22} />
          <strong>
            {listingsKnown
              ? listings.filter((l) => l.status === "changes_requested").length
              : "—"}
          </strong>
          <span>À compléter</span>
        </Link>
      </div>
      <div className="account-section-title">
        <h2>Mes dernières annonces</h2>
        <Link href="/compte/annonces">Tout voir</Link>
      </div>
      {loading.listings && listings === null ? (
        <p role="status">Chargement de vos annonces…</p>
      ) : listings?.length ? (
        <div className="account-list">
          {listings.slice(0, 3).map((l) => (
            <Link
              key={l.id}
              className="account-listing"
              href={`/compte/annonces/${l.id}/modifier`}
            >
              <div className="account-listing-image">
                {l.photos[0] ? (
                  <SafePhoto
                    src={l.photos[0]}
                    alt=""
                    width={144}
                    height={104}
                    sizes="(max-width: 600px) 80px, 144px"
                  />
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
      ) : errors.listings ? null : listings !== null ? (
        <div className="empty-state account-empty">
          <CheckCircle2 size={32} />
          <h3>Aucune annonce</h3>
          <p>Vos annonces apparaîtront ici.</p>
          <Link href="/deposer" className="button button-secondary">
            Déposer une annonce
          </Link>
        </div>
      ) : null}
      <NotificationFeed compact />
    </AccountShell>
  );
}
export default function Dashboard() {
  return (
    <AccountGate>{(user) => <DashboardContent user={user} />}</AccountGate>
  );
}
