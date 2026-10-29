"use client";
import { requestJson } from "@/lib/request-json";
import { useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ShieldCheck, UserRound } from "lucide-react";
import { AccountNav } from "./account-nav";
export { AccountNav } from "./account-nav";
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
    [mode, setMode] = useState(""),
    [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let active = true;
    setLoading(true);
    setError("");
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
  }, [attempt]);
  return {
    user,
    loading,
    error,
    mode,
    setUser,
    retry: () => setAttempt((n) => n + 1),
  };
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
  const { user, loading, error, retry } = useAccount();
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
        <button
          type="button"
          className="button button-secondary"
          onClick={retry}
        >
          Réessayer
        </button>
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
