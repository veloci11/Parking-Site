"use client";
import { useState, type FormEvent } from "react";
import Link from "next/link";
import { Download, LogOut, Save, ShieldCheck, Trash2 } from "lucide-react";
import { AccountGate, AccountShell, api } from "./shared";
import type { User } from "@/lib/types";
function Content({ user }: { user: User }) {
  const [name, setName] = useState(user.name),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [busy, setBusy] = useState(false),
    [showDelete, setShowDelete] = useState(false),
    [password, setPassword] = useState(""),
    [confirmation, setConfirmation] = useState("");
  async function save(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      await api("/api/me/profile", {
        method: "PATCH",
        body: JSON.stringify({ name }),
      });
      window.dispatchEvent(new Event("gp:session"));
      setNotice("Votre nom public a été enregistré.");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function exportData() {
    setError("");
    setBusy(true);
    try {
      const data = await api("/api/me/export");
      const href = URL.createObjectURL(
        new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }),
      );
      const link = document.createElement("a");
      link.href = href;
      link.download = "mes-donnees-gp.json";
      link.click();
      URL.revokeObjectURL(href);
      setNotice(
        "Votre export a été préparé. Conservez ce fichier dans un emplacement privé.",
      );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function remove(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      await api("/api/me/delete", {
        method: "POST",
        body: JSON.stringify({ password, confirmation }),
      });
      window.dispatchEvent(new Event("gp:session"));
      window.location.assign("/connexion?closed=1");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <AccountShell user={user} title="Mes paramètres">
      <p className="muted account-lead">
        Votre profil et vos données, sous votre contrôle.
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
      <section className="card account-settings-card">
        <h2>Profil public</h2>
        <p className="muted">
          Seul votre nom public est présenté aux autres membres.
        </p>
        <form className="account-form" onSubmit={save}>
          <label className="field">
            Nom public
            <input
              className="input"
              value={name}
              onChange={(e) => setName(e.target.value)}
              minLength={2}
              maxLength={80}
              required
              autoComplete="name"
            />
          </label>
          <label className="field">
            Email de connexion
            <input className="input" value={user.email} disabled type="email" />
          </label>
          <p className="muted">
            Votre email reste privé. Son changement nécessite une nouvelle
            vérification et n’est pas proposé dans cette version.
          </p>
          <button className="button button-primary" disabled={busy}>
            <Save size={18} />
            Enregistrer mon profil
          </button>
        </form>
      </section>
      <section className="card account-settings-card">
        <h2>Connexion et confidentialité</h2>
        <Link href="/compte/securite" className="button button-secondary">
          <ShieldCheck size={18} />
          Gérer l’authentification à deux facteurs
        </Link>
        <p>
          <ShieldCheck size={18} />
          Email {user.emailVerified ? "confirmé" : "à confirmer"}. Cette
          confirmation ne constitue pas une vérification de propriété
          immobilière.
        </p>
        {!user.emailVerified ? (
          <Link href="/verifier-email" className="button button-secondary">
            Vérifier mon email
          </Link>
        ) : null}
        <Link href="/mot-de-passe-oublie" className="button button-secondary">
          Réinitialiser mon mot de passe
        </Link>
        <button
          className="button button-secondary"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            try {
              await api("/api/auth/logout", { method: "POST", body: "{}" });
              window.dispatchEvent(new Event("gp:session"));
              window.location.assign("/");
            } catch (e) {
              setError((e as Error).message);
              setBusy(false);
            }
          }}
        >
          <LogOut size={18} />
          Me déconnecter
        </button>
      </section>
      <section className="card account-settings-card">
        <h2>Mes données personnelles</h2>
        <p className="muted">
          Récupérez les données de votre compte et de vos annonces.
        </p>
        <button
          className="button button-secondary"
          disabled={busy}
          onClick={exportData}
        >
          <Download size={18} />
          Exporter mes données
        </button>
        <div className="account-delete-zone">
          <h3>Fermer mon compte</h3>
          <p>
            Vos annonces seront retirées et les nouveaux contacts désactivés. La
            fermeture n’efface pas instantanément les historiques nécessaires
            aux participants ni les sauvegardes.
          </p>
          {showDelete ? (
            <form className="account-form" onSubmit={remove}>
              <label className="field">
                Confirmez votre mot de passe
                <input
                  className="input"
                  type="password"
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                />
              </label>
              <label className="field">
                Écrivez SUPPRIMER pour confirmer
                <input
                  className="input"
                  value={confirmation}
                  onChange={(e) => setConfirmation(e.target.value)}
                  required
                  pattern="SUPPRIMER"
                />
              </label>
              <div className="account-visit-actions">
                <button
                  className="button button-secondary account-danger"
                  disabled={busy || confirmation !== "SUPPRIMER"}
                >
                  <Trash2 size={18} />
                  Confirmer la fermeture
                </button>
                <button
                  className="button button-secondary"
                  type="button"
                  onClick={() => setShowDelete(false)}
                >
                  Annuler
                </button>
              </div>
            </form>
          ) : (
            <button
              className="button button-secondary account-danger"
              onClick={() => setShowDelete(true)}
            >
              <Trash2 size={18} />
              Fermer mon compte
            </button>
          )}
        </div>
      </section>
    </AccountShell>
  );
}
export default function Settings() {
  return <AccountGate>{(u) => <Content user={u} />}</AccountGate>;
}
