"use client";
import { requestJson } from "@/lib/request-json";
import { useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Bell,
  Box,
  Flag,
  House,
  LayoutDashboard,
  ListChecks,
  Mail,
  Settings,
  ShieldCheck,
  UserRound,
} from "lucide-react";
import type { User } from "@/lib/types";
export async function api<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  return requestJson<T>(path, { ...options, cache: "no-store" });
}
export function useAccount() {
  const [user, setUser] = useState<User | null>(null),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(""),
    [mode, setMode] = useState("");
  useEffect(() => {
    let active = true;
    api<{ data: User | null; mode?: string }>("/api/session")
      .then((r) => {
        if (active) {
          setUser(r.data);
          setMode(r.mode || "");
        }
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
  return { user, loading, error, mode, setUser };
}
export function AccountGate({
  children,
  admin = false,
  adminOnly = false,
}: {
  children: (user: User) => ReactNode;
  admin?: boolean;
  adminOnly?: boolean;
}) {
  const path = usePathname();
  const { user, loading, error } = useAccount();
  const [mfa, setMfa] = useState<"loading" | "allowed" | "blocked" | "error">(
    admin ? "loading" : "allowed",
  );
  const [mfaRetry, setMfaRetry] = useState(0);
  useEffect(() => {
    if (!admin || !user || user.role === "member") {
      setMfa("allowed");
      return;
    }
    let active = true;
    setMfa("loading");
    api<{
      data: {
        supported?: boolean;
        requiredForAdmin: boolean;
        currentLevel: string | null;
      };
    }>("/api/mfa")
      .then((r) => {
        if (active)
          setMfa(
            r.data.supported !== false &&
              r.data.requiredForAdmin &&
              r.data.currentLevel !== "aal2"
              ? "blocked"
              : "allowed",
          );
      })
      .catch(() => {
        if (active) setMfa("error");
      });
    return () => {
      active = false;
    };
  }, [admin, user?.id, user?.role, mfaRetry]);
  if (loading)
    return (
      <div
        id="main"
        role="main"
        className="page-shell account-loading"
        aria-busy="true"
      >
        Ouverture de votre espace…
      </div>
    );
  if (error)
    return (
      <div id="main" role="main" className="page-shell">
        <p className="error" role="alert">
          {error}
        </p>
      </div>
    );
  if (!user)
    return (
      <div id="main" role="main" className="page-shell account-gate">
        <UserRound size={32} />
        <h1>Connexion requise</h1>
        <p className="muted">Connectez-vous pour accéder à cette page.</p>
        <Link
          className="button button-primary"
          href={`/connexion?next=${encodeURIComponent(path)}`}
        >
          Se connecter
        </Link>
        <Link href={`/inscription?next=${encodeURIComponent(path)}`}>
          Créer un compte
        </Link>
      </div>
    );
  if (admin && (user.role === "member" || (adminOnly && user.role !== "admin")))
    return (
      <div id="main" role="main" className="page-shell">
        <h1>Accès réservé</h1>
        <p>
          {adminOnly
            ? "Cette page est réservée aux administrateurs habilités."
            : "Cette page est réservée à la modération."}
        </p>
        <Link href="/compte" className="button button-secondary">
          Revenir à mon compte
        </Link>
      </div>
    );
  if (admin && mfa === "loading")
    return (
      <div id="main" className="page-shell account-loading" role="status">
        Vérification de la session renforcée…
      </div>
    );
  if (admin && mfa === "error")
    return (
      <div id="main" role="main" className="page-shell account-gate">
        <ShieldCheck size={32} />
        <h1>La vérification est indisponible.</h1>
        <p className="error" role="alert">
          Le niveau de sécurité de votre session n’a pas pu être vérifié.
          Réessayez avant d’ouvrir la modération.
        </p>
        <button
          className="button button-primary"
          onClick={() => setMfaRetry((n) => n + 1)}
        >
          Réessayer
        </button>
        <Link href="/compte">Revenir à mon compte</Link>
      </div>
    );
  if (admin && mfa === "blocked")
    return (
      <div id="main" role="main" className="page-shell account-gate">
        <ShieldCheck size={32} />
        <h1>Confirmez votre session.</h1>
        <p className="muted">
          L’accès à la modération nécessite une authentification renforcée.
        </p>
        <Link className="button button-primary" href="/compte/securite">
          Vérification de sécurité
        </Link>
      </div>
    );
  return <>{children(user)}</>;
}
export function AccountNav({ user }: { user: User }) {
  const path = usePathname();
  const [unread, setUnread] = useState(0);
  useEffect(() => {
    let active = true;
    const load = () => {
      api<{ unread: number }>("/api/notifications")
        .then((r) => {
          if (active) setUnread(r.unread || 0);
        })
        .catch(() => {});
    };
    load();
    window.addEventListener("gp:notifications", load);
    const timer = setInterval(() => {
      if (!document.hidden) load();
    }, 30000);
    return () => {
      active = false;
      clearInterval(timer);
      window.removeEventListener("gp:notifications", load);
    };
  }, []);
  return (
    <aside className="account-sidebar">
      <div className="account-person">
        <div className="account-avatar">
          {user.name.slice(0, 1).toUpperCase()}
        </div>
        <div>
          <strong>{user.name}</strong>
          <span className="muted">Mon compte</span>
        </div>
      </div>
      <nav aria-label="Mon espace">
        <Link
          href="/compte"
          aria-current={path === "/compte" ? "page" : undefined}
        >
          <LayoutDashboard size={18} />
          Vue d’ensemble
        </Link>
        <Link
          href="/compte/annonces"
          aria-current={
            path.startsWith("/compte/annonces") ||
            [
              "/compte/scenes",
              "/compte/parkings",
              "/compte/abonnement",
            ].includes(path)
              ? "page"
              : undefined
          }
        >
          <ListChecks size={18} />
          Mes annonces
        </Link>
        <Link
          href="/compte/messages"
          aria-current={
            path.startsWith("/compte/messages") ||
            path === "/compte/signalements"
              ? "page"
              : undefined
          }
        >
          <Mail size={18} />
          Messages
        </Link>
        <Link
          href="/compte/notifications"
          aria-current={path === "/compte/notifications" ? "page" : undefined}
        >
          <Bell size={18} />
          Notifications
          {unread ? (
            <span
              className="account-nav-count"
              aria-label={`${unread} notifications non lues`}
            >
              {unread}
            </span>
          ) : null}
        </Link>
        <Link href="/favoris">
          <House size={18} />
          Mes favoris
        </Link>
        <Link
          href="/compte/parametres"
          aria-current={
            ["/compte/parametres", "/compte/securite"].includes(path)
              ? "page"
              : undefined
          }
        >
          <Settings size={18} />
          Paramètres
        </Link>
        {user.role !== "member" ? (
          <>
            <p className="account-nav-label">Administration</p>
            <Link
              href="/admin"
              aria-current={path === "/admin" ? "page" : undefined}
            >
              <ShieldCheck size={18} />
              Modération
            </Link>
            <Link
              href="/admin/signalements"
              aria-current={path === "/admin/signalements" ? "page" : undefined}
            >
              <Flag size={18} />
              Signalements
            </Link>
            <Link
              href="/admin/scenes"
              aria-current={path === "/admin/scenes" ? "page" : undefined}
            >
              <Box size={18} />
              Plans 3D à vérifier
            </Link>
          </>
        ) : null}
        {user.role === "admin" ? (
          <>
            <Link
              href="/admin/parkings"
              aria-current={path === "/admin/parkings" ? "page" : undefined}
            >
              <Box size={18} />
              Parkings et places
            </Link>
            <Link
              href="/admin/comptes"
              aria-current={path === "/admin/comptes" ? "page" : undefined}
            >
              <ShieldCheck size={18} />
              Comptes et accès
            </Link>
            <Link
              href="/admin/limites"
              aria-current={path === "/admin/limites" ? "page" : undefined}
            >
              <ListChecks size={18} />
              Limites des comptes
            </Link>
            <Link
              href="/admin/journal"
              aria-current={path === "/admin/journal" ? "page" : undefined}
            >
              <ListChecks size={18} />
              Journal administratif
            </Link>
          </>
        ) : null}
      </nav>
    </aside>
  );
}
export function AccountShell({
  user,
  title,
  eyebrow,
  action,
  children,
}: {
  user: User;
  title: string;
  eyebrow?: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="page-shell account-shell">
      <AccountNav user={user} />
      <main id="main" className="account-main">
        <div className="account-title">
          <div>
            {eyebrow ? <p className="account-eyebrow">{eyebrow}</p> : null}
            <h1>{title}</h1>
          </div>
          {action}
        </div>
        {!user.emailVerified ? (
          <div className="notice account-verification">
            Vérifiez votre adresse email pour soumettre une annonce ou contacter
            un vendeur. <Link href="/verifier-email">Vérifier mon email</Link>
          </div>
        ) : null}
        {children}
      </main>
    </div>
  );
}
export const statusLabels: Record<string, string> = {
  draft: "Brouillon",
  pending: "En cours de relecture",
  pending_review: "En cours de relecture",
  published: "En ligne",
  changes_requested: "À compléter",
  rejected: "Refusée",
  paused: "En pause",
  suspended: "Suspendue · correction requise",
  sold: "Vendue",
  expired: "Expirée · nouvelle revue requise",
  withdrawn: "Retirée",
};
