"use client";
import { useState, type FormEvent } from "react";
import Link from "next/link";
import { api } from "./shared";
export default function PasswordChange() {
  const [current, setCurrent] = useState(""),
    [password, setPassword] = useState(""),
    [repeat, setRepeat] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [done, setDone] = useState(false);
  async function submit(e: FormEvent) {
    e.preventDefault();
    if (busy) return;
    setError("");
    if (password !== repeat) {
      setError("La confirmation ne correspond pas au nouveau mot de passe.");
      return;
    }
    setBusy(true);
    try {
      await api("/api/auth/commands/change-password", {
        method: "POST",
        body: JSON.stringify({ currentPassword: current, password }),
      });
      setDone(true);
      setCurrent("");
      setPassword("");
      setRepeat("");
      window.dispatchEvent(new Event("gp:session"));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="card account-settings-card">
      <h2>Changer mon mot de passe</h2>
      <p className="muted">
        Après la modification, reconnectez-vous avec votre nouveau mot de passe.
      </p>
      {done ? (
        <p className="notice" role="status">
          Votre mot de passe a été modifié.{" "}
          <Link href="/connexion">Vous reconnecter</Link>.
        </p>
      ) : (
        <form className="account-form" onSubmit={submit}>
          {error ? (
            <p className="error" role="alert">
              {error}
            </p>
          ) : null}
          <label className="field">
            Mot de passe actuel
            <input
              className="input"
              type="password"
              autoComplete="current-password"
              value={current}
              onChange={(e) => setCurrent(e.target.value)}
              required
              disabled={busy}
            />
          </label>
          <label className="field">
            Nouveau mot de passe
            <input
              className="input"
              type="password"
              autoComplete="new-password"
              minLength={12}
              maxLength={128}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              disabled={busy}
            />
          </label>
          <label className="field">
            Confirmer le nouveau mot de passe
            <input
              className="input"
              type="password"
              autoComplete="new-password"
              minLength={12}
              maxLength={128}
              value={repeat}
              onChange={(e) => setRepeat(e.target.value)}
              required
              disabled={busy}
            />
          </label>
          <button className="button button-primary" disabled={busy}>
            {busy ? "Modification…" : "Enregistrer le mot de passe"}
          </button>
        </form>
      )}
    </section>
  );
}
