"use client";
import "@/styles/auth.css";
import { useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { Eye, EyeOff } from "lucide-react";
import { api } from "./shared";
import { safeAuthReturn, type AuthPolicy } from "@/lib/auth-return";
import SocialSignIn from "./social-sign-in";
type Mode = "login" | "register" | "verify" | "forgot" | "reset";
const config: Record<Mode, { title: string; intro: string; button: string }> = {
  login: {
    title: "Connexion",
    intro: "",
    button: "Se connecter",
  },
  register: {
    title: "Créer un compte",
    intro: "",
    button: "Créer mon compte",
  },
  verify: {
    title: "Confirmer mon email",
    intro: "Ouvrez le lien reçu par email dans ce navigateur.",
    button: "Vérifier mon email",
  },
  forgot: {
    title: "Mot de passe oublié",
    intro: "Indiquez l’adresse email de votre compte.",
    button: "Envoyer le lien",
  },
  reset: {
    title: "Nouveau mot de passe",
    intro: "Utilisez au moins 12 caractères.",
    button: "Enregistrer le mot de passe",
  },
};
export default function AuthForm({ mode }: { mode: Mode }) {
  const c = config[mode];
  const [name, setName] = useState(""),
    [email, setEmail] = useState(""),
    [password, setPassword] = useState(""),
    [repeatPassword, setRepeatPassword] = useState(""),
    [token, setToken] = useState(""),
    [show, setShow] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [success, setSuccess] = useState(""),
    [localLink, setLocalLink] = useState(""),
    [returnTo, setReturnTo] = useState("/compte"),
    [demo, setDemo] = useState(false),
    [policy, setPolicy] = useState<AuthPolicy | null>(null),
    [termsAccepted, setTermsAccepted] = useState(false),
    [resetReady, setResetReady] = useState<boolean | null>(null);
  async function loadPolicy() {
    setTermsAccepted(false);
    try {
      const r = await api<{ data: AuthPolicy }>("/api/auth/commands/policy");
      setPolicy(r.data);
    } catch {
      setPolicy(null);
      setError(
        "Les documents ne sont pas disponibles. Réessayez avant de créer votre compte.",
      );
    }
  }
  useEffect(() => {
    if (mode === "register") void loadPolicy();
    if (mode === "reset")
      api<{ data: { recoveryReady: boolean } }>(
        "/api/auth/commands/reset-status",
      )
        .then((r) => setResetReady(r.data.recoveryReady))
        .catch(() => setResetReady(false));
  }, [mode]);
  useEffect(() => {
    api<{ mode?: string }>("/api/session")
      .then((r) => setDemo(r.mode === "demo"))
      .catch(() => {});
    const q = new URLSearchParams(window.location.search);
    setToken(q.get("token") || "");
    setReturnTo(safeAuthReturn(q.get("next")));
    if (q.get("authError"))
      setError(
        q.get("authError") === "oauth-terms"
          ? "Les documents ont changé pendant la connexion. Recommencez pour les confirmer."
          : q.get("authError") === "oauth"
            ? "La connexion avec ce service n’a pas été terminée. Réessayez ou utilisez votre email."
            : mode === "forgot"
              ? "Ce lien n’est plus valide. Demandez un nouveau lien ci-dessous."
              : "Ce lien n’est plus valide. Connectez-vous ou demandez un nouveau lien.",
      );
  }, []);
  async function submit(e: FormEvent) {
    e.preventDefault();
    if (busy) return;
    setError("");
    setSuccess("");
    setLocalLink("");
    if (mode === "reset" && password !== repeatPassword) {
      setError("Les deux mots de passe ne correspondent pas.");
      return;
    }
    setBusy(true);
    try {
      const endpoint =
        mode === "login"
          ? "login"
          : mode === "register"
            ? "register"
            : mode === "forgot"
              ? "forgot"
              : mode === "reset"
                ? "reset"
                : "verify";
      const result = await api<{
        data?: unknown;
        message?: string;
        verificationToken?: string;
        resetToken?: string;
        localLink?: string;
        verificationUrl?: string;
        resetUrl?: string;
        localMail?: { url?: string };
        demoVerificationToken?: string;
        mailboxReceipt?: string;
      }>(
        ["register", "forgot", "reset"].includes(endpoint)
          ? `/api/auth/commands/${endpoint}`
          : `/api/auth/${endpoint}`,
        {
          method: "POST",
          body: JSON.stringify(
            mode === "register"
              ? {
                  name,
                  email,
                  password,
                  termsAccepted,
                  termsVersion: policy?.termsVersion,
                  privacyVersion: policy?.privacyVersion,
                  next: returnTo,
                }
              : mode === "login"
                ? { email, password }
                : mode === "forgot"
                  ? { email, next: returnTo }
                  : mode === "reset"
                    ? { token, password }
                    : { token },
          ),
        },
      );
      window.dispatchEvent(new Event("gp:session"));
      if (demo && (result as { mailboxReceipt?: string }).mailboxReceipt) {
        const receipt = (result as { mailboxReceipt: string }).mailboxReceipt;
        const mail = await api<{
          data: { type: string; token: string; createdAt: string }[];
        }>("/api/local-mailbox", {
          headers: { "x-mailbox-receipt": receipt },
          credentials: "omit",
        }).catch(() => ({ data: [] }));
        const latest = mail.data[0];
        if (latest)
          setLocalLink(
            `${latest.type === "reset" ? "/reinitialiser" : "/verifier-email"}?token=${encodeURIComponent(latest.token)}&next=${encodeURIComponent(returnTo)}`,
          );
      }
      const candidate =
        result.localLink ||
        result.verificationUrl ||
        result.resetUrl ||
        result.localMail?.url;
      const receiptToken =
        result.verificationToken ||
        result.resetToken ||
        result.demoVerificationToken;
      if (candidate?.startsWith("/")) setLocalLink(candidate);
      else if (receiptToken)
        setLocalLink(
          `${mode === "forgot" ? "/reinitialiser" : "/verifier-email"}?token=${encodeURIComponent(receiptToken)}&next=${encodeURIComponent(returnTo)}`,
        );
      if (mode === "login") {
        window.location.assign(returnTo);
        return;
      }
      if (mode === "register")
        setSuccess(
          result.message ||
            "Un lien de confirmation vous a été envoyé. Ouvrez-le dans ce navigateur pour activer votre compte.",
        );
      else if (mode === "verify")
        setSuccess(
          "Votre adresse email est confirmée. Vous pouvez maintenant déposer une annonce et contacter les vendeurs.",
        );
      else if (mode === "reset")
        setSuccess(
          "Votre mot de passe a été enregistré. Vous pouvez vous connecter.",
        );
      else
        setSuccess(
          result.message ||
            "Si cette adresse correspond à un compte, vous recevrez un lien pour choisir un nouveau mot de passe.",
        );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <main id="main" className="page-shell account-auth account-auth-compact">
      <section className="account-auth-card">
        <h1>{c.title}</h1>
        {c.intro ? <p className="muted">{c.intro}</p> : null}
        {error ? (
          <p className="error" role="alert">
            {error}
          </p>
        ) : null}
        {success ? (
          <div className="notice" role="status">
            <p>{success}</p>
            {localLink ? (
              <p>
                <strong>Réception locale de test :</strong>{" "}
                <Link href={localLink}>Ouvrir le lien</Link>. Aucun email
                externe n’est envoyé.
              </p>
            ) : null}
            {mode === "register" ? (
              <Link
                href={`/verifier-email?next=${encodeURIComponent(returnTo)}`}
              >
                Je n’ai pas reçu le lien
              </Link>
            ) : mode === "verify" && demo ? (
              <Link href={returnTo}>Continuer dans mon espace</Link>
            ) : mode === "reset" ? (
              <Link href={`/connexion?next=${encodeURIComponent(returnTo)}`}>
                Se connecter
              </Link>
            ) : null}
          </div>
        ) : null}
        {mode === "login" || mode === "register" ? (
          <SocialSignIn next={returnTo} disabled={busy} onPending={setBusy} />
        ) : null}
        {demo && mode === "verify" && !token ? (
          <div className="account-demo">
            <span className="badge">Réception locale de test</span>
            <p>
              Pour votre compte de démonstration, retrouvez ici le lien préparé.
            </p>
            <button
              type="button"
              className="button button-secondary"
              onClick={async () => {
                setError("");
                try {
                  const r = await api<{
                    data: { type: string; token: string }[];
                  }>("/api/local-mailbox");
                  const mail = r.data.find((m) => m.type === "verify");
                  if (mail) setToken(mail.token);
                  else
                    setError(
                      "Aucun lien de confirmation disponible pour cette session. Reconnectez-vous au compte à vérifier.",
                    );
                } catch (e) {
                  setError((e as Error).message);
                }
              }}
            >
              Retrouver mon code
            </button>
          </div>
        ) : null}
        {demo && mode === "login" ? (
          <div className="account-demo">
            <span className="badge">Environnement de démonstration</span>
            <p>Explorer avec un compte fictif :</p>
            <div className="account-demo-buttons">
              {(["buyer", "seller", "moderator", "admin"] as const).map(
                (persona, i) => (
                  <button
                    type="button"
                    key={persona}
                    className="button button-secondary"
                    disabled={busy}
                    onClick={async () => {
                      setBusy(true);
                      try {
                        await api("/api/auth/demo", {
                          method: "POST",
                          body: JSON.stringify({ persona }),
                        });
                        window.dispatchEvent(new Event("gp:session"));
                        window.location.assign(
                          persona === "moderator" || persona === "admin"
                            ? "/admin"
                            : returnTo,
                        );
                      } catch (e) {
                        setError((e as Error).message);
                        setBusy(false);
                      }
                    }}
                  >
                    {["Acheteur", "Vendeur", "Modérateur", "Administrateur"][i]}
                  </button>
                ),
              )}
            </div>
          </div>
        ) : null}
        {mode === "verify" && !demo ? (
          <form
            className="account-form"
            onSubmit={async (e) => {
              e.preventDefault();
              if (busy) return;
              setBusy(true);
              setError("");
              setSuccess("");
              try {
                const result = await api<{ message: string }>(
                  "/api/auth/commands/resend",
                  {
                    method: "POST",
                    body: JSON.stringify({ email, next: returnTo }),
                  },
                );
                setSuccess(result.message);
              } catch (e) {
                setError((e as Error).message);
              } finally {
                setBusy(false);
              }
            }}
          >
            <label className="field">
              Adresse email
              <input
                className="input"
                type="email"
                autoComplete="email"
                value={email}
                required
                disabled={busy}
                maxLength={254}
                onChange={(e) => setEmail(e.target.value)}
              />
            </label>
            <button className="button button-primary" disabled={busy}>
              {busy ? "Envoi…" : "Renvoyer le lien de confirmation"}
            </button>
            <p className="muted">Vérifiez aussi vos courriers indésirables.</p>
          </form>
        ) : (
          <form onSubmit={submit} className="account-form">
            {mode === "register" ? (
              <label className="field">
                Votre nom public
                <input
                  className="input"
                  autoComplete="name"
                  required
                  minLength={2}
                  maxLength={80}
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Nom affiché sur vos annonces"
                />
              </label>
            ) : null}
            {mode === "login" || mode === "register" || mode === "forgot" ? (
              <label className="field">
                Adresse email
                <input
                  className="input"
                  type="email"
                  autoComplete="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="vous@exemple.fr"
                />
              </label>
            ) : null}
            {mode === "login" || mode === "register" || mode === "reset" ? (
              <label className="field">
                Mot de passe
                <span className="account-password">
                  <input
                    className="input"
                    type={show ? "text" : "password"}
                    autoComplete={
                      mode === "login" ? "current-password" : "new-password"
                    }
                    required
                    minLength={mode === "login" ? 1 : 12}
                    maxLength={128}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder={
                      mode === "login"
                        ? "Votre mot de passe"
                        : "12 caractères minimum"
                    }
                  />
                  <button
                    type="button"
                    aria-label={
                      show
                        ? "Masquer le mot de passe"
                        : "Afficher le mot de passe"
                    }
                    onClick={() => setShow(!show)}
                  >
                    {show ? <EyeOff size={18} /> : <Eye size={18} />}
                  </button>
                </span>
              </label>
            ) : null}
            {mode === "reset" ? (
              <label className="field">
                Confirmer le nouveau mot de passe
                <input
                  className="input"
                  type={show ? "text" : "password"}
                  autoComplete="new-password"
                  required
                  minLength={12}
                  maxLength={128}
                  value={repeatPassword}
                  onChange={(e) => setRepeatPassword(e.target.value)}
                />
              </label>
            ) : null}
            {demo && (mode === "verify" || mode === "reset") ? (
              <label className="field">
                Code du lien de confirmation
                <input
                  className="input"
                  required
                  value={token}
                  onChange={(e) => setToken(e.target.value)}
                  autoComplete="one-time-code"
                  placeholder="Copiez le code du lien reçu"
                />
              </label>
            ) : null}
            {mode === "register" ? (
              <label className="account-checkbox">
                <input
                  type="checkbox"
                  required
                  checked={termsAccepted}
                  onChange={(e) => setTermsAccepted(e.target.checked)}
                />
                <span>
                  J’accepte les{" "}
                  <Link href="/conditions-utilisation">
                    conditions d’utilisation
                  </Link>{" "}
                  et j’ai lu la{" "}
                  <Link href="/confidentialite">
                    politique de confidentialité
                  </Link>
                  .
                </span>
              </label>
            ) : null}
            {mode === "register" && !policy ? (
              <button
                className="account-link-button"
                type="button"
                disabled={busy}
                onClick={() => void loadPolicy()}
              >
                Réessayer
              </button>
            ) : null}
            {mode === "reset" && resetReady === false && !demo ? (
              <p className="notice">
                Ce lien n’est plus disponible.{" "}
                <Link
                  href={`/mot-de-passe-oublie?next=${encodeURIComponent(returnTo)}`}
                >
                  Demander un lien
                </Link>
                .
              </p>
            ) : null}
            <button
              className="button button-primary"
              disabled={
                busy ||
                (mode === "register" && (!policy || !termsAccepted)) ||
                (mode === "reset" && !demo && resetReady !== true)
              }
            >
              {busy ? "Un instant…" : c.button}
            </button>
          </form>
        )}
        {mode === "login" ? (
          <>
            <Link
              className="account-forgot"
              href={`/mot-de-passe-oublie?next=${encodeURIComponent(returnTo)}`}
            >
              Mot de passe oublié ?
            </Link>
            <p className="account-auth-switch">
              Pas encore de compte ?{" "}
              <Link href={`/inscription?next=${encodeURIComponent(returnTo)}`}>
                Créer un compte
              </Link>
            </p>
          </>
        ) : mode === "register" ? (
          <p className="account-auth-switch">
            Déjà un compte ?{" "}
            <Link href={`/connexion?next=${encodeURIComponent(returnTo)}`}>
              Se connecter
            </Link>
          </p>
        ) : (
          <p className="account-auth-switch">
            <Link href={`/connexion?next=${encodeURIComponent(returnTo)}`}>
              Se connecter
            </Link>
          </p>
        )}
      </section>
    </main>
  );
}
