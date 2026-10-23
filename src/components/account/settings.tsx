"use client";
import FilterSelect from "../FilterSelect";
import { useState, type FormEvent } from "react";
import Link from "next/link";
import { Download, LogOut, Save, ShieldCheck, Trash2 } from "lucide-react";
import { AccountGate, AccountShell, api } from "./shared";
import type { User } from "@/lib/types";
import PrivacyExports from "./privacy-exports";
import PasswordChange from "./password-change";
import TermsStatus from "./terms-status";
function Content({ user }: { user: User }) {
  const [name, setName] = useState(user.name),
    [sellerType, setSellerType] = useState(user.sellerType || ""),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [busy, setBusy] = useState(false),
    [showDelete, setShowDelete] = useState(false),
    [password, setPassword] = useState(""),
    [confirmation, setConfirmation] = useState(""),
    [exportPassword, setExportPassword] = useState("");
  async function save(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      await api("/api/me/profile", {
        method: "PATCH",
        body: JSON.stringify({ name, sellerType: sellerType || null }),
      });
      window.dispatchEvent(new Event("gp:session"));
      setNotice("Votre profil public a été enregistré.");
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
      const data = await api<{ data: unknown }>("/api/privacy/export", {
        method: "POST",
        body: JSON.stringify({ password: exportPassword }),
      });
      const href = URL.createObjectURL(
        new Blob([JSON.stringify(data.data, null, 2)], {
          type: "application/json",
        }),
      );
      const link = document.createElement("a");
      link.href = href;
      link.download = "mes-donnees-gp.json";
      link.click();
      URL.revokeObjectURL(href);
      setExportPassword("");
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
      await api("/api/privacy/delete", {
        method: "POST",
        body: JSON.stringify({ password, confirmation }),
      });
      window.dispatchEvent(new Event("gp:session"));
      window.location.assign("/compte/suppression");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <AccountShell user={user} title="Mes paramètres">
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
          Ce nom et ce statut apparaissent sur vos annonces.
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
          <div className="field">
            <span>{"Vous publiez en tant que"}</span>
            <FilterSelect
              label={"Vous publiez en tant que"}
              variant="field"
              value={sellerType}
              onChange={(selectedValue) => setSellerType(selectedValue)}
              options={[
                { value: "", label: "À préciser" },
                { value: "private", label: "Particulier" },
                { value: "professional", label: "Professionnel" },
              ]}
            />
          </div>
          <p className="muted">
            Les annonces déjà en ligne seront mises à jour après vérification de
            leur prochaine modification.
          </p>
          <label className="field">
            Email de connexion
            <input className="input" value={user.email} disabled type="email" />
          </label>
          <p className="muted">
            Cet email sert à vous connecter et n’est pas affiché sur vos
            annonces.
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
          Email {user.emailVerified ? "confirmé" : "à confirmer"}.
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
      <PasswordChange />
      <TermsStatus />
      <PrivacyExports />
      <section className="card account-settings-card">
        <h2>Mes données personnelles</h2>
        <p className="muted">
          Récupérez vos données de compte, annonces, échanges envoyés, visites,
          favoris et documents (métadonnées). Les fichiers binaires et preuves
          internes de modération ne sont pas intégrés.
        </p>
        <label className="field">
          Confirmez votre mot de passe pour l’export
          <input
            className="input"
            type="password"
            autoComplete="current-password"
            maxLength={128}
            value={exportPassword}
            onChange={(e) => setExportPassword(e.target.value)}
            disabled={busy}
          />
        </label>
        <button
          className="button button-secondary"
          disabled={busy || !exportPassword}
          onClick={exportData}
        >
          <Download size={18} />
          Télécharger mes données
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
