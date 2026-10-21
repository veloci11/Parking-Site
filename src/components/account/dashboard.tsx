"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import {
  ArrowRight,
  Bell,
  CheckCircle2,
  ClipboardList,
  Mail,
  Plus,
  Sparkles,
} from "lucide-react";
import { NotificationFeed } from "./notifications";
import { AccountGate, AccountShell, api, statusLabels } from "./shared";
import { money, type Listing, type User, type Conversation } from "@/lib/types";
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
      title={`Bonjour ${user.name.split(" ")[0]}.`}
      action={
        <Link href="/deposer" className="button button-primary">
          <Plus size={18} />
          Déposer une annonce
        </Link>
      }
    >
      <section className="account-welcome">
        <div>
          <span className="badge">VOS PROJETS, EN UN COUP D’ŒIL</span>
          <h2>
            Votre prochaine étape
            <br />
            commence ici.
          </h2>
          <p>
            Suivez vos annonces et échangez directement avec les personnes
            intéressées.
          </p>
          <Link href="/explorer">
            Explorer les parkings <ArrowRight size={16} />
          </Link>
        </div>
        <div className="account-welcome-symbol">
          <Sparkles size={48} />
        </div>
      </section>
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
        <Link href="/compte/annonces">
          Tout voir <ArrowRight size={16} />
        </Link>
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
                  {statusLabels[l.status] || l.status}
                </span>
                <h3>{l.title || "Annonce sans titre"}</h3>
                <p className="muted">
                  {l.city || "Ville à préciser"} · {money(l.priceCents)}
                </p>
              </div>
              <ArrowRight size={20} />
            </Link>
          ))}
        </div>
      ) : (
        <div className="empty-state account-empty">
          <CheckCircle2 size={32} />
          <h3>Votre espace est prêt.</h3>
          <p>
            Déposez votre premier parking ou explorez les annonces pour trouver
            votre place.
          </p>
          <Link href="/deposer" className="button button-secondary">
            Créer ma première annonce
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
