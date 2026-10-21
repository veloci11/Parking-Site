"use client";
import { useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { ArrowRight, Eye, EyeOff, ShieldCheck } from "lucide-react";
import { api } from "./shared";
type Mode = "login" | "register" | "verify" | "forgot" | "reset";
const config: Record<
  Mode,
  { eyebrow: string; title: string; intro: string; button: string }
> = {
  login: {
    eyebrow: "HEUREUX DE VOUS RETROUVER",
    title: "Vos places. Vos projets.",
    intro:
      "Retrouvez vos annonces, vos favoris et vos échanges au même endroit.",
    button: "Se connecter",
  },
  register: {
    eyebrow: "BIENVENUE CHEZ GP",
    title: "Une place pour vos projets.",
    intro:
      "Créez votre compte pour découvrir, échanger et publier vos annonces gratuitement.",
    button: "Créer mon compte",
  },
  verify: {
    eyebrow: "PLUS QU’UNE ÉTAPE",
    title: "Confirmez votre email.",
    intro:
      "Le lien reçu permet de confirmer votre adresse email. Cela ne constitue pas une vérification de propriété.",
    button: "Vérifier mon email",
  },
  forgot: {
    eyebrow: "ON VOUS AIDE",
    title: "Retrouvons votre accès.",
    intro:
      "Nous vous indiquerons la marche à suivre pour choisir un nouveau mot de passe.",
    button: "Demander un lien",
  },
  reset: {
    eyebrow: "UN NOUVEAU DÉPART",
    title: "Votre nouveau mot de passe.",
    intro: "Choisissez un mot de passe personnel d’au moins 12 caractères.",
    button: "Enregistrer le mot de passe",
  },
};
export default function AuthForm({ mode }: { mode: Mode }) {
  const c = config[mode];
  const [name, setName] = useState(""),
    [email, setEmail] = useState(""),
    [password, setPassword] = useState(""),
    [token, setToken] = useState(""),
    [show, setShow] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [success, setSuccess] = useState(""),
    [localLink, setLocalLink] = useState(""),
    [returnTo, setReturnTo] = useState("/compte"),
    [demo, setDemo] = useState(false);
  useEffect(() => {
    api<{ mode?: string }>("/api/session")
      .then((r) => setDemo(r.mode === "demo"))
      .catch(() => {});
    const q = new URLSearchParams(window.location.search);
    setToken(q.get("token") || "");
    const next = q.get("next");
    if (
      next?.startsWith("/") &&
      !next.startsWith("//") &&
      !next.includes("\\") &&
      !/[\u0000-\u001f]/.test(next)
    )
      setReturnTo(next);
  }, []);
  async function submit(e: FormEvent) {
    e.preventDefault();
    setError("");
    setSuccess("");
    setLocalLink("");
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
      }>(`/api/auth/${endpoint}`, {
        method: "POST",
        body: JSON.stringify(
          mode === "register"
            ? { name, email, password }
            : mode === "login"
              ? { email, password }
              : mode === "forgot"
                ? { email }
                : mode === "reset"
                  ? { token, password }
                  : { token },
        ),
      });
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
            "Votre compte est créé. Confirmez votre adresse email avant votre première soumission.",
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
            "Si cette adresse correspond à un compte, un lien de récupération sera préparé.",
        );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <main id="main" className="page-shell account-auth">
      <section className="account-auth-story">
        <span className="account-eyebrow">LE BON ENDROIT COMMENCE ICI</span>
        <h2>
          Un peu plus près
          <br />
          de votre prochaine place.
        </h2>
        <p>
          Une vision claire du quartier, du parking et de la place. Et des
          échanges simples, de la découverte à la visite.
        </p>
        <div className="account-story-note">
          <ShieldCheck size={24} />
          <span>Vos échanges restent dans votre espace privé.</span>
        </div>
      </section>
      <section className="account-auth-card">
        <p className="account-eyebrow">{c.eyebrow}</p>
        <h1>{c.title}</h1>
        <p className="muted">{c.intro}</p>
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
                Confirmer mon email
              </Link>
            ) : mode === "verify" ? (
              <Link href={returnTo}>Continuer dans mon espace</Link>
            ) : mode === "reset" ? (
              <Link href={`/connexion?next=${encodeURIComponent(returnTo)}`}>
                Se connecter
              </Link>
            ) : null}
          </div>
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
              {(["buyer", "seller", "moderator"] as const).map((persona, i) => (
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
                        persona === "moderator" ? "/admin" : returnTo,
                      );
                    } catch (e) {
                      setError((e as Error).message);
                      setBusy(false);
                    }
                  }}
                >
                  {["Acheteur", "Vendeur", "Modérateur"][i]}
                </button>
              ))}
            </div>
          </div>
        ) : null}
        {mode === "verify" && !demo ? (
          <div className="notice">
            <p>
              Ouvrez le lien de confirmation envoyé à votre adresse email. Il
              validera votre compte et vous ramènera dans votre espace.
            </p>
            <Link href="/compte">Revenir à mon compte</Link>
          </div>
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
                  placeholder="Comment souhaitez-vous apparaître ?"
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
                <input type="checkbox" required />
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
            <button className="button button-primary" disabled={busy}>
              {busy ? "Un instant…" : c.button}
              <ArrowRight size={18} />
            </button>
          </form>
        )}
        {mode === "login" ? (
          <>
            <Link className="account-forgot" href="/mot-de-passe-oublie">
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
            <Link href="/connexion">Revenir à la connexion</Link>
          </p>
        )}
      </section>
    </main>
  );
}
