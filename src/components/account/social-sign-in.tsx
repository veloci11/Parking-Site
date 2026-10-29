"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import type { AuthPolicy } from "@/lib/auth-return";
import { api } from "./shared";

type Provider = "google" | "apple";
const labels: Record<Provider, string> = { google: "Google", apple: "Apple" };

export default function SocialSignIn({
  next,
  disabled,
  onPending,
}: {
  next: string;
  disabled: boolean;
  onPending: (value: boolean) => void;
}) {
  const [providers, setProviders] = useState<Provider[]>([]);
  const [selected, setSelected] = useState<Provider | null>(null);
  const [policy, setPolicy] = useState<AuthPolicy | null>(null);
  const [accepted, setAccepted] = useState(false);
  const [loadingPolicy, setLoadingPolicy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    api<{ data: { providers: Provider[] } }>("/api/auth/oauth/providers")
      .then((result) => {
        if (active)
          setProviders(
            result.data.providers.filter(
              (provider) => provider === "google" || provider === "apple",
            ),
          );
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    let active = true;
    if (!selected) return;
    setAccepted(false);
    setPolicy(null);
    setError("");
    setLoadingPolicy(true);
    api<{ data: AuthPolicy }>("/api/auth/commands/policy")
      .then((result) => {
        if (active) setPolicy(result.data);
      })
      .catch(() => {
        if (active)
          setError(
            "Les documents ne sont pas disponibles. Réessayez dans quelques instants.",
          );
      })
      .finally(() => {
        if (active) setLoadingPolicy(false);
      });
    return () => {
      active = false;
    };
  }, [selected]);

  async function connect() {
    if (!selected || !policy || !accepted || disabled) return;
    onPending(true);
    setError("");
    try {
      const result = await api<{ data: { url: string } }>(
        "/api/auth/oauth/start",
        {
          method: "POST",
          body: JSON.stringify({
            provider: selected,
            next,
            termsAccepted: true,
            ...policy,
          }),
        },
      );
      window.location.assign(result.data.url);
    } catch (e) {
      setError((e as Error).message);
      onPending(false);
    }
  }

  if (!providers.length) return null;
  return (
    <section
      className="account-social"
      aria-label="Connexion avec un autre service"
    >
      {selected ? (
        <div className="account-social-consent">
          <strong>Continuer avec {labels[selected]}</strong>
          {loadingPolicy ? (
            <p className="muted" role="status">
              Chargement des documents…
            </p>
          ) : null}
          {error ? (
            <p className="error" role="alert">
              {error}
            </p>
          ) : null}
          <label className="account-checkbox">
            <input
              type="checkbox"
              checked={accepted}
              disabled={disabled || !policy}
              onChange={(event) => setAccepted(event.target.checked)}
            />
            <span>
              J’accepte les{" "}
              <Link
                href="/conditions-utilisation"
                target="_blank"
                rel="noopener noreferrer"
              >
                conditions d’utilisation
              </Link>{" "}
              et j’ai lu la{" "}
              <Link
                href="/confidentialite"
                target="_blank"
                rel="noopener noreferrer"
              >
                politique de confidentialité
              </Link>
              .
            </span>
          </label>
          <button
            type="button"
            className="button button-primary"
            disabled={disabled || !policy || !accepted}
            onClick={() => void connect()}
          >
            {disabled ? "Connexion…" : "Continuer"}
          </button>
          <button
            type="button"
            className="account-link-button"
            disabled={disabled}
            onClick={() => setSelected(null)}
          >
            Annuler
          </button>
        </div>
      ) : (
        providers.map((provider) => (
          <button
            key={provider}
            type="button"
            className="button button-secondary"
            disabled={disabled}
            onClick={() => setSelected(provider)}
          >
            Continuer avec {labels[provider]}
          </button>
        ))
      )}
      <p className="account-social-divider">ou avec votre email</p>
    </section>
  );
}
