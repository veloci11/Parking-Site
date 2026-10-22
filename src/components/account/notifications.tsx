"use client";
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  Bell,
  CalendarDays,
  Check,
  CheckCheck,
  ClipboardCheck,
  Mail,
  RefreshCw,
} from "lucide-react";
import { AccountGate, AccountShell, api } from "./shared";
import type { User } from "@/lib/types";
export interface NotificationItem {
  id: string;
  type: string;
  title: string;
  body: string;
  url: string;
  createdAt: string;
  readAt: string | null;
}
const icons = {
  moderation: ClipboardCheck,
  conversation: Mail,
  message: Mail,
  visit: CalendarDays,
};
function safeHref(path: string) {
  return path.startsWith("/") && !path.startsWith("//") && !path.includes("\\")
    ? path
    : "/compte";
}
export function NotificationFeed({ compact = false }: { compact?: boolean }) {
  const [items, setItems] = useState<NotificationItem[]>([]),
    [unread, setUnread] = useState(0),
    [loading, setLoading] = useState(true),
    [busy, setBusy] = useState(""),
    [error, setError] = useState("");
  const load = useCallback(async () => {
    try {
      const r = await api<{ data: NotificationItem[]; unread: number }>(
        "/api/notifications",
      );
      setItems(r.data);
      setUnread(r.unread);
      setError("");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    void load();
  }, [load]);
  async function mark(ids?: string[]) {
    setBusy(ids?.[0] || "all");
    setError("");
    try {
      await api("/api/notifications/read", {
        method: "POST",
        body: JSON.stringify(ids ? { ids } : {}),
      });
      await load();
      window.dispatchEvent(new Event("gp:notifications"));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy("");
    }
  }
  const shown = compact ? items.slice(0, 3) : items;
  return (
    <section className="account-notifications" aria-label="Notifications">
      <div className="account-section-title">
        <h2>{compact ? "À suivre" : "Vos notifications"}</h2>
        {compact ? (
          <Link href="/compte/notifications">Tout voir</Link>
        ) : (
          <div className="account-notification-actions">
            <span className="badge">
              {unread} non lue{unread > 1 ? "s" : ""}
            </span>
            <button
              className="button button-secondary"
              disabled={!!busy || !unread}
              onClick={() => void mark()}
            >
              <CheckCheck size={16} />
              Tout marquer comme lu
            </button>
            <button
              className="button button-secondary"
              onClick={() => void load()}
              aria-label="Actualiser les notifications"
            >
              <RefreshCw size={16} />
            </button>
          </div>
        )}
      </div>
      {error ? (
        <p className="error" role="alert">
          {error}
        </p>
      ) : null}
      {loading ? (
        <p role="status">Chargement des notifications…</p>
      ) : shown.length ? (
        <div className="account-notification-list">
          {shown.map((n) => {
            const Icon = icons[n.type as keyof typeof icons] || Bell;
            return (
              <article
                className={`account-notification ${n.readAt ? "" : "unread"}`}
                key={n.id}
              >
                <div className="account-notification-icon">
                  <Icon size={20} />
                </div>
                <div className="account-notification-copy">
                  <div>
                    <strong>{n.title}</strong>
                    {!n.readAt ? <span className="badge">Non lue</span> : null}
                  </div>
                  <p>{n.body}</p>
                  <time dateTime={n.createdAt}>
                    {new Intl.DateTimeFormat("fr-FR", {
                      dateStyle: "medium",
                      timeStyle: "short",
                    }).format(new Date(n.createdAt))}
                  </time>
                  <div className="account-notification-links">
                    <Link href={safeHref(n.url)}>Ouvrir</Link>
                    {!n.readAt ? (
                      <button
                        disabled={!!busy}
                        onClick={() => void mark([n.id])}
                      >
                        <Check size={14} />
                        Marquer comme lue
                      </button>
                    ) : null}
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      ) : (
        <div className="account-notification-empty">
          <Bell size={24} />
          <div>
            <strong>Vous êtes à jour.</strong>
            <p>
              Les réponses, demandes de visite et décisions de modération
              apparaîtront ici.
            </p>
          </div>
        </div>
      )}
      {!compact ? (
        <p className="muted account-notification-note">
          Cet espace affiche les notifications enregistrées dans la plateforme.
          Il ne confirme pas l’envoi d’un email.
        </p>
      ) : null}
    </section>
  );
}
function NotificationPreferences() {
  const [enabled, setEnabled] = useState(true),
    [loading, setLoading] = useState(true),
    [saving, setSaving] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState("");
  useEffect(() => {
    let active = true;
    api<{ data: { emailEnabled: boolean } }>("/api/me/notification-settings")
      .then((r) => {
        if (active) setEnabled(r.data.emailEnabled);
      })
      .catch((e) => {
        if (active) setError(e.message);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);
  async function change(next: boolean) {
    setSaving(true);
    setError("");
    setNotice("");
    try {
      const r = await api<{ data: { emailEnabled: boolean } }>(
        "/api/me/notification-settings",
        { method: "PATCH", body: JSON.stringify({ emailEnabled: next }) },
      );
      setEnabled(r.data.emailEnabled);
      setNotice("Votre préférence a été enregistrée.");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  }
  return (
    <section className="card account-settings-card">
      <h2>Mes préférences de notification</h2>
      <p className="muted">
        Les notifications restent disponibles dans cet espace, quel que soit
        votre choix pour les emails.
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
        <p role="status">Chargement de la préférence…</p>
      ) : (
        <label className="account-checkbox">
          <input
            type="checkbox"
            checked={enabled}
            disabled={saving}
            onChange={(e) => void change(e.target.checked)}
          />
          <span>
            Autoriser les emails transactionnels liés à mes annonces et à mes
            conversations.
          </span>
        </label>
      )}
      <p className="muted account-notification-note">
        La sauvegarde confirme votre préférence ; elle ne constitue pas une
        confirmation d’envoi d’un email.
      </p>
    </section>
  );
}

function Content({ user }: { user: User }) {
  return (
    <AccountShell user={user} title="Rien d’important ne vous échappe.">
      <p className="muted account-lead">
        Retrouvez les nouvelles étapes de vos annonces et de vos échanges.
      </p>
      <NotificationFeed />
      <NotificationPreferences />
    </AccountShell>
  );
}
export default function Notifications() {
  return <AccountGate>{(u) => <Content user={u} />}</AccountGate>;
}
