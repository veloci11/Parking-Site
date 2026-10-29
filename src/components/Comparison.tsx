"use client";
import { listingPrice, offerLabel } from "@/lib/listing-price";
import { explorerReturnHref } from "@/lib/explorer-continuation";
import { pricingScope, SpaceOfferSummary } from "./ListingOffers";
import { useEffect, useState } from "react";
import Link from "next/link";
import Image from "./SafePhoto";

import {
  areaLabel,
  typeLabels,
  type Listing,
  type TransactionType,
} from "@/lib/types";
export default function Comparison() {
  const [listings, setListings] = useState<Listing[]>([]);
  const [loading, setLoading] = useState(true);
  const [missing, setMissing] = useState(0);
  const [error, setError] = useState("");
  const [backHref, setBackHref] = useState("/?display=list");
  const [transactionType, setTransactionType] = useState<TransactionType>();
  useEffect(() => {
    try {
      setBackHref(
        explorerReturnHref(sessionStorage.getItem("gp:explore:href")),
      );
    } catch {
      // Optional navigation storage must not prevent comparison loading.
    }
    const params = new URLSearchParams(window.location.search);
    const transaction = params.get("transactionType");
    if (transaction === "sale" || transaction === "rent")
      setTransactionType(transaction);
    const ids = (params.get("ids") || "").split(",").slice(0, 3);
    let active = true;
    async function refresh() {
      try {
        const results = await Promise.all(
          ids.filter(Boolean).map(async (id) => {
            const response = await fetch(`/api/listings/${id}`, {
              cache: "no-store",
            });
            if (response.status === 404) return null;
            const value = await response.json();
            if (!response.ok)
              throw new Error(
                value.error || "La comparaison n’a pas pu être actualisée.",
              );
            return value.data as Listing;
          }),
        );
        if (active) {
          setListings(results.filter((item): item is Listing => item !== null));
          setMissing(results.filter((item) => item === null).length);
          setError("");
        }
      } catch (e) {
        if (active) setError((e as Error).message);
      } finally {
        if (active) setLoading(false);
      }
    }
    void refresh();
    const focus = () => {
      if (document.visibilityState === "visible") void refresh();
    };
    const timer = setInterval(focus, 30000);
    window.addEventListener("focus", focus);
    return () => {
      active = false;
      clearInterval(timer);
      window.removeEventListener("focus", focus);
    };
  }, []);
  const rows: [string, (l: Listing) => React.ReactNode][] = [
    ["Offre", offerLabel],
    [
      "Prix ou loyer mensuel",
      (l) => (
        <>
          <strong>{listingPrice(l, transactionType)}</strong>
          <p className="small muted">{pricingScope(l)}</p>
        </>
      ),
    ],
    [
      "Offres par place",
      (l) =>
        l.pricingMode === "per_space"
          ? l.spaces
              .filter(
                (space) =>
                  !transactionType ||
                  space.offer?.transactionType === transactionType,
              )
              .map((space) => (
                <p key={space.id}>
                  Place {space.number} :{" "}
                  <SpaceOfferSummary listing={l} space={space} />
                </p>
              ))
          : "Places proposées ensemble",
    ],
    ["Type", (l) => typeLabels[l.type]],
    ["Places dans l’annonce", (l) => l.spaces.length],
    ["Surface par place", (l) => areaLabel(l.spaces)],
    [
      "Surface totale connue",
      (l) =>
        l.spaces.every((s) => s.areaM2 !== null)
          ? `${l.spaces.reduce((n, s) => n + (s.areaM2 || 0), 0)} m²`
          : "À préciser",
    ],
    ["Sol", (l) => l.quality.floor],
    ["Éclairage", (l) => l.quality.lighting],
    ["Humidité", (l) => l.quality.humidity],
    ["Accès", (l) => l.quality.access],
    ["Manœuvre", (l) => l.quality.maneuver],
    [
      "Plan intérieur",
      (l) =>
        l.sceneAvailable
          ? l.isDemo
            ? "Démonstration disponible"
            : "Plan contrôlé disponible"
          : "Photos uniquement",
    ],
  ];
  return (
    <main id="main" className="page-shell">
      <div className="comparison-heading">
        <div>
          <h1>Comparer les annonces</h1>
          <p className="muted">
            Prix, surfaces et caractéristiques des parkings sélectionnés.
          </p>
        </div>
        <Link href={backHref} className="button button-secondary">
          Retour
        </Link>
      </div>
      {missing > 0 ? (
        <p className="notice" role="status">
          {missing} annonce
          {missing > 1 ? "s ne sont plus publiques" : " n’est plus publique"}.
          La comparaison affiche uniquement les biens encore disponibles.
        </p>
      ) : null}
      {loading ? (
        <p>Chargement de la comparaison…</p>
      ) : error ? (
        <p className="error">{error}</p>
      ) : listings.length < 2 ? (
        <div className="empty-state">
          <h2>Choisissez au moins deux biens.</h2>
          <p>
            Dans les résultats, utilisez « Comparer » sous les annonces qui vous
            intéressent.
          </p>
          <Link href="/" className="button button-primary">
            Explorer les parkings
          </Link>
        </div>
      ) : (
        <div className="table-scroll">
          <table className="compare-table">
            <thead>
              <tr>
                <th>Caractéristiques</th>
                {listings.map((l) => (
                  <th key={l.id}>
                    <Image
                      width={600}
                      height={360}
                      sizes="(max-width:767px) 240px, 320px"
                      src={l.photos[0] || "/demo/covered.png"}
                      alt={l.isDemo ? "Illustration de démonstration" : l.title}
                    />
                    <strong>
                      {l.city} · {l.district}
                    </strong>
                    <p className="muted small">{l.title}</p>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map(([label, value]) => (
                <tr key={label}>
                  <th scope="row">{label}</th>
                  {listings.map((l) => (
                    <td key={l.id}>{value(l)}</td>
                  ))}
                </tr>
              ))}
              <tr>
                <th scope="row">Découvrir</th>
                {listings.map((l) => (
                  <td key={l.id}>
                    <Link
                      href={`/annonces/${l.id}/${l.slug}`}
                      className="button button-primary"
                    >
                      Voir le bien
                    </Link>
                  </td>
                ))}
              </tr>
            </tbody>
          </table>
        </div>
      )}
    </main>
  );
}
