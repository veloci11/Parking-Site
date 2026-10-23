"use client";
import { useEffect, useState } from "react";
import type { ContributorSite } from "@/lib/parking-registry";
import { api } from "@/lib/client";
import { AccountGate, AccountShell } from "@/components/account/shared";
import type { User } from "@/lib/types";
import "@/styles/registry.css";
function Content({ user }: { user: User }) {
  const [sites, setSites] = useState<ContributorSite[]>([]),
    [error, setError] = useState(""),
    [loading, setLoading] = useState(true);
  useEffect(() => {
    let mounted = true;
    void api<ContributorSite[]>("/api/parking-registry/mine")
      .then((data) => {
        if (mounted) setSites(data);
      })
      .catch((error) => {
        if (mounted) setError(error.message);
      })
      .finally(() => {
        if (mounted) setLoading(false);
      });
    return () => {
      mounted = false;
    };
  }, []);
  return (
    <AccountShell
      user={user}
      title="Références communes"
      eyebrow="MES PARKINGS"
    >
      <p className="muted">
        Ces accès donnent uniquement les références communes autorisées. Ils ne
        permettent pas de lire les photos privées, documents, messages ou
        brouillons d’un autre vendeur.
      </p>
      {loading ? <p role="status">Chargement des accès…</p> : null}
      {error ? (
        <p className="notice error" role="alert">
          {error}
        </p>
      ) : null}
      {!loading && !error && !sites.length ? (
        <section className="card registry-card">
          <h2>Aucun accès commun attribué</h2>
          <p>
            Vous pourrez retrouver ici les références de niveaux lorsqu’un
            opérateur vous aura accordé un accès au parking concerné.
          </p>
        </section>
      ) : null}
      {sites.map((site) => (
        <section className="card registry-card" key={site.id}>
          <h2>{site.publicName}</h2>
          <p className="muted">Consultation des références communes</p>
          <ul>
            {site.levels.map((level) => (
              <li key={level.id}>
                {level.code} · {level.label || `Niveau ${level.number}`}
              </li>
            ))}
          </ul>
        </section>
      ))}
    </AccountShell>
  );
}
export default function ContributorParkings() {
  return <AccountGate>{(user) => <Content user={user} />}</AccountGate>;
}
