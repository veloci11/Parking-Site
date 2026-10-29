"use client";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import {
  CheckCircle2,
  KeyRound,
  LoaderCircle,
  LockKeyhole,
  RefreshCw,
  ShieldCheck,
  Smartphone,
  Trash2,
} from "lucide-react";
import { AccountGate, AccountShell, api } from "./shared";
import type { User } from "@/lib/types";
interface Factor {
  id: string;
  name: string;
  status: "verified" | "unverified";
}
interface MfaState {
  supported?: boolean;
  currentLevel: "aal1" | "aal2" | null;
  nextLevel: "aal1" | "aal2" | null;
  factors: Factor[];
  requiredForAdmin: boolean;
}
interface Setup {
  factorId: string;
  qrCode: string;
  secret: string;
}
function qrSource(qr: string) {
  if (qr.startsWith("data:image/")) return qr;
  let binary = "";
  for (const byte of new TextEncoder().encode(qr))
    binary += String.fromCharCode(byte);
  return `data:image/svg+xml;base64,${btoa(binary)}`;
}
function Content({ user }: { user: User }) {
  const [state, setState] = useState<MfaState | null>(null),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [busy, setBusy] = useState(false),
    [setup, setSetup] = useState<Setup | null>(null),
    [activeFactor, setActiveFactor] = useState(""),
    [challengeId, setChallengeId] = useState(""),
    [code, setCode] = useState(""),
    [removeFactor, setRemoveFactor] = useState(""),
    [password, setPassword] = useState("");
  const load = useCallback(async () => {
    try {
      const r = await api<{ data: MfaState }>("/api/mfa");
      setState(r.data);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    void load();
  }, [load]);
  async function challenge(factorId: string) {
    const r = await api<{ data: { challengeId: string; expiresAt?: number } }>(
      "/api/mfa/challenge",
      { method: "POST", body: JSON.stringify({ factorId }) },
    );
    setActiveFactor(factorId);
    setChallengeId(r.data.challengeId);
    setCode("");
  }
  async function enroll() {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const r = await api<{ data: Setup }>("/api/mfa/enroll", {
        method: "POST",
        body: "{}",
      });
      setSetup(r.data);
      setActiveFactor(r.data.factorId);
      await challenge(r.data.factorId);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function startChallenge(factorId: string) {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await challenge(factorId);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function verify(e: FormEvent) {
    e.preventDefault();
    if (!activeFactor || !challengeId) return;
    setBusy(true);
    setError("");
    try {
      await api("/api/mfa/verify", {
        method: "POST",
        body: JSON.stringify({ factorId: activeFactor, challengeId, code }),
      });
      setSetup(null);
      setCode("");
      setChallengeId("");
      setActiveFactor("");
      setNotice(
        "Le code a été confirmé. Le niveau de sécurité de votre session est actualisé ci-dessous.",
      );
      window.dispatchEvent(new Event("gp:session"));
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function unenroll(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      await api("/api/mfa/unenroll", {
        method: "POST",
        body: JSON.stringify({ factorId: removeFactor, password }),
      });
      setRemoveFactor("");
      setPassword("");
      setNotice(
        "Ce facteur a été retiré. Vérifiez les facteurs encore disponibles pour votre compte.",
      );
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <AccountShell user={user} title="La sécurité de votre compte.">
      <Link className="account-return-link" href="/compte/parametres">
        Revenir aux paramètres
      </Link>
      <p className="muted account-lead">
        Ajoutez une confirmation personnelle pour protéger vos connexions.
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
        <p role="status">Vérification de la sécurité de votre session…</p>
      ) : state?.supported === false ? (
        <section className="card account-settings-card">
          <ShieldCheck size={32} />
          <h2>Authentification à deux facteurs</h2>
          <p>
            Cette fonction ne peut pas être activée dans la démonstration
            locale. Elle est disponible avec les comptes du service connecté.
          </p>
          <p className="muted">
            Aucun second facteur n’a été créé ou simulé pour votre compte de
            démonstration.
          </p>
        </section>
      ) : state ? (
        <>
          <section className="card account-security-overview">
            <div className="account-security-icon">
              <ShieldCheck size={28} />
            </div>
            <div>
              <h2>Authentification à deux facteurs</h2>
              <p>
                Un code temporaire généré par votre application
                d’authentification complète votre mot de passe.
              </p>
              <span
                className={`badge ${state.currentLevel === "aal2" ? "account-status-published" : ""}`}
              >
                {state.currentLevel === "aal2"
                  ? "Session renforcée confirmée"
                  : "Session avec mot de passe"}
              </span>
              <p className="muted">
                {state.factors.some((f) => f.status === "verified")
                  ? "Au moins un facteur confirmé est enregistré sur votre compte."
                  : "Aucun facteur confirmé pour le moment."}
              </p>
            </div>
          </section>
          {state.requiredForAdmin && state.currentLevel !== "aal2" ? (
            <div className="notice">
              <LockKeyhole size={20} />
              <p>
                Une session renforcée est requise pour accéder à la modération.
                Activez un facteur puis confirmez votre code.
              </p>
            </div>
          ) : null}
          <section className="card account-settings-card">
            <div className="account-section-title">
              <h2>Mes applications d’authentification</h2>
              <button
                className="button button-secondary"
                onClick={() => void load()}
                aria-label="Actualiser les facteurs"
              >
                <RefreshCw size={16} />
              </button>
            </div>
            {state.factors.length ? (
              <div className="account-factor-list">
                {state.factors.map((f) => (
                  <article key={f.id}>
                    <Smartphone size={22} />
                    <div>
                      <strong>
                        {f.name || "Application d’authentification"}
                      </strong>
                      <span>
                        {f.status === "verified"
                          ? "Facteur confirmé"
                          : "Activation incomplète"}
                      </span>
                    </div>
                    {f.status === "unverified" ||
                    state.currentLevel !== "aal2" ? (
                      <button
                        className="button button-primary"
                        disabled={busy}
                        onClick={() => void startChallenge(f.id)}
                      >
                        {f.status === "unverified"
                          ? "Confirmer ce facteur"
                          : "Confirmer cette session"}
                      </button>
                    ) : null}
                    <button
                      className="button button-secondary"
                      disabled={busy || state.currentLevel !== "aal2"}
                      onClick={() => {
                        setRemoveFactor(f.id);
                        setPassword("");
                      }}
                      aria-label={`Retirer ${f.name || "ce facteur"}`}
                    >
                      <Trash2 size={16} />
                    </button>
                  </article>
                ))}
              </div>
            ) : (
              <p className="muted">
                Votre application n’est pas encore associée à votre compte.
              </p>
            )}
            {!setup ? (
              <button
                className="button button-primary"
                disabled={busy}
                onClick={() => void enroll()}
              >
                {busy ? (
                  <LoaderCircle className="account-spin" size={18} />
                ) : (
                  <KeyRound size={18} />
                )}
                Ajouter une application
              </button>
            ) : null}
          </section>
          {setup ? (
            <section className="card account-mfa-setup">
              <span className="account-eyebrow">ACTIVATION EN COURS</span>
              <h2>Associez votre application.</h2>
              <ol>
                <li>
                  Ouvrez votre application d’authentification et ajoutez un
                  compte.
                </li>
                <li>Scannez ce QR code personnel.</li>
                <li>
                  Saisissez le code temporaire affiché pour confirmer
                  l’activation.
                </li>
              </ol>
              <div className="account-mfa-qr">
                <img
                  src={qrSource(setup.qrCode)}
                  alt="QR code personnel pour associer votre application d’authentification"
                  width="224"
                  height="224"
                />
              </div>
              <details className="account-mfa-secret">
                <summary>Afficher la clé pour une saisie manuelle</summary>
                <code>{setup.secret}</code>
              </details>
              <p className="muted account-notification-note">
                Ce QR code et cette clé sont personnels. Gardez-les dans votre
                application d’authentification et ne les partagez pas.
              </p>
              {!challengeId ? (
                <button
                  className="button button-secondary"
                  disabled={busy}
                  onClick={() => void startChallenge(setup.factorId)}
                >
                  Préparer la confirmation du code
                </button>
              ) : null}
            </section>
          ) : null}
          {activeFactor && challengeId ? (
            <section className="card account-settings-card">
              <h2>
                {setup ? "Confirmer l’activation" : "Confirmer cette session"}
              </h2>
              <form className="account-form" onSubmit={verify}>
                <label className="field">
                  Code temporaire à 6 chiffres
                  <input
                    className="input account-totp-input"
                    type="text"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    pattern="[0-9]{6}"
                    minLength={6}
                    maxLength={6}
                    required
                    value={code}
                    onChange={(e) =>
                      setCode(e.target.value.replace(/\D/g, "").slice(0, 6))
                    }
                    placeholder="000000"
                  />
                </label>
                <button
                  className="button button-primary"
                  disabled={busy || code.length !== 6}
                >
                  <CheckCircle2 size={18} />
                  {busy ? "Vérification…" : "Confirmer le code"}
                </button>
                <button
                  className="button button-secondary"
                  type="button"
                  disabled={busy}
                  onClick={() => void startChallenge(activeFactor)}
                >
                  Renouveler la demande de confirmation
                </button>
              </form>
            </section>
          ) : null}
          {removeFactor ? (
            <section className="card account-settings-card account-delete-zone">
              <h2>Retirer ce facteur</h2>
              <p>
                Confirmez votre mot de passe. Une session renforcée est
                nécessaire pour modifier les facteurs de sécurité.
              </p>
              <form onSubmit={unenroll} className="account-form">
                <label className="field">
                  Votre mot de passe
                  <input
                    className="input"
                    type="password"
                    autoComplete="current-password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    maxLength={128}
                  />
                </label>
                <button
                  className="button button-secondary account-danger"
                  disabled={busy || !password}
                >
                  <Trash2 size={18} />
                  Confirmer le retrait
                </button>
                <button
                  className="button button-secondary"
                  type="button"
                  onClick={() => {
                    setRemoveFactor("");
                    setPassword("");
                  }}
                >
                  Annuler
                </button>
              </form>
            </section>
          ) : null}
          {state.requiredForAdmin && state.currentLevel === "aal2" ? (
            <Link href="/admin" className="button button-primary">
              Accéder à la modération
            </Link>
          ) : null}
        </>
      ) : null}
    </AccountShell>
  );
}
export default function Security() {
  return <AccountGate>{(u) => <Content user={u} />}</AccountGate>;
}
