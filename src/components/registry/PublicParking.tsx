"use client";
import FilterSelect from "@/components/FilterSelect";
import { useEffect, useState } from "react";
import Link from "next/link";
import { listingPrice } from "@/lib/listing-price";
import dynamic from "next/dynamic";
import { ArrowLeft, Layers3, MapPin, Box } from "lucide-react";
import type { PublicParking as ParkingData } from "@/lib/parking-registry";
import { areaLabel, type Listing } from "@/lib/types";
import SafePhoto from "@/components/SafePhoto";
import "@/styles/registry.css";
const ParkingViewer = dynamic(() => import("@/components/maps/ParkingViewer"), {
  ssr: false,
  loading: () => (
    <p className="registry-public-loading" role="status">
      Préparation du plan contrôlé…
    </p>
  ),
});
export default function PublicParking({ alias }: { alias: string }) {
  const [parking, setParking] = useState<ParkingData | null>(null),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(""),
    [levelId, setLevelId] = useState(""),
    [listingId, setListingId] = useState(""),
    [unitId, setUnitId] = useState<string | null>(null),
    [showPlan, setShowPlan] = useState(false);
  useEffect(() => {
    let disposed = false;
    let controller: AbortController | undefined;
    async function load() {
      controller?.abort();
      controller = new AbortController();
      try {
        const response = await fetch(
          `/api/parkings/${encodeURIComponent(alias)}`,
          { cache: "no-store", signal: controller.signal },
        );
        if (!response.ok)
          throw new Error(
            "Ce parking n’est pas proposé publiquement pour le moment.",
          );
        const body = await response.json();
        if (disposed) return;
        const data = body.data as ParkingData;
        if (
          !data ||
          !Array.isArray(data.listings) ||
          !Array.isArray(data.levels) ||
          typeof data.publicName !== "string"
        )
          throw new Error("Les informations de ce parking sont indisponibles.");
        data.listings = data.listings.filter(
          (listing) =>
            listing.locationPrecision === "exact_opt_in" &&
            listing.status === "published",
        );
        setParking(data);
        setError("");
        const params = new URLSearchParams(window.location.search);
        setUnitId((current) => {
          const candidate = current || params.get("unit");
          return candidate &&
            data.listings.some((listing) =>
              listing.spaces.some((space) => space.id === candidate),
            )
            ? candidate
            : null;
        });
        setLevelId((current) =>
          data.levels.some((level) => level.id === current)
            ? current
            : data.levels.find((level) => level.id === params.get("level"))
                ?.id ||
              data.levels[0]?.id ||
              "",
        );
        setListingId((current) =>
          data.listings.some((listing) => listing.id === current)
            ? current
            : data.listings.find(
                (listing) => listing.id === params.get("listing"),
              )?.id ||
              data.listings[0]?.id ||
              "",
        );
      } catch (error) {
        if ((error as Error).name !== "AbortError" && !disposed) {
          setParking(null);
          setError((error as Error).message);
        }
      } finally {
        if (!disposed) setLoading(false);
      }
    }
    void load();
    const interval = window.setInterval(() => {
      if (document.visibilityState === "visible") void load();
    }, 30000);
    return () => {
      disposed = true;
      controller?.abort();
      window.clearInterval(interval);
    };
  }, [alias]);
  const level = parking?.levels.find((level) => level.id === levelId),
    allowedIds = new Set(level?.spaces.map((space) => space.listingId) || []),
    listings =
      parking?.listings.filter((listing) => allowedIds.has(listing.id)) || [],
    selected =
      listings.find((listing) => listing.id === listingId) ||
      listings[0] ||
      null;
  useEffect(() => {
    setShowPlan(false);
  }, [selected?.id, level?.id]);
  const sceneAvailable =
    !!selected &&
    !!level?.scenes.some(
      (scene) =>
        scene.listingId === selected.id &&
        scene.level === level.number &&
        scene.sceneAvailable,
    );
  function remember(
    nextLevel: string,
    nextListing: string,
    nextUnit: string | null,
  ) {
    const params = new URLSearchParams(window.location.search);
    params.set("level", nextLevel);
    if (nextListing) params.set("listing", nextListing);
    else params.delete("listing");
    if (nextUnit) params.set("unit", nextUnit);
    else params.delete("unit");
    window.history.replaceState(
      window.history.state,
      "",
      `${window.location.pathname}?${params}${window.location.hash}`,
    );
  }
  function chooseLevel(id: string) {
    setLevelId(id);
    setUnitId(null);
    setShowPlan(false);
    const ids = new Set(
        parking?.levels
          .find((level) => level.id === id)
          ?.spaces.map((space) => space.listingId) || [],
      ),
      first = parking?.listings.find((listing) => ids.has(listing.id));
    setListingId(first?.id || "");
    remember(id, first?.id || "", null);
  }
  function chooseListing(listing: Listing, unit: string | null = null) {
    setListingId(listing.id);
    setUnitId(unit);
    remember(levelId, listing.id, unit);
  }
  return (
    <main id="main" className="registry-public">
      <Link href="/" className="text-link">
        <ArrowLeft size={16} /> Retour à l’exploration
      </Link>
      {loading ? (
        <section className="registry-public-loading" role="status">
          Chargement du parking…
        </section>
      ) : error ? (
        <section className="card registry-card" role="status">
          <h1>Parking indisponible</h1>
          <p>{error}</p>
          <Link href="/" className="button button-primary">
            Explorer les annonces disponibles
          </Link>
        </section>
      ) : parking ? (
        <>
          <header className="registry-public-heading">
            <p className="eyebrow">PARKING · ANNONCES PUBLIQUES</p>
            <h1>{parking.publicName}</h1>
            {parking.listings.some((listing) => listing.isDemo) ? (
              <p className="notice">
                Annonces de démonstration · biens fictifs
              </p>
            ) : null}
            <p>
              Découvrez les offres publiées de ce parking, niveau par niveau.
              Les emplacements de contexte ne sont pas des offres disponibles.
            </p>
          </header>
          <div className="registry-public-layout">
            <section>
              <label className="field registry-level">
                <Layers3 size={18} /> Choisir le niveau
                <FilterSelect
                  variant="field"
                  label="Choisir le niveau du parking"
                  value={levelId}
                  onChange={chooseLevel}
                  options={parking.levels.map((level) => ({
                    value: level.id,
                    label:
                      level.label || level.code || `Niveau ${level.number}`,
                  }))}
                />
              </label>
              <div
                className="registry-public-units"
                aria-label="Places publiquement proposées à ce niveau"
              >
                {level?.spaces.map((space) => {
                  const listing = listings.find(
                    (listing) => listing.id === space.listingId,
                  );
                  return listing ? (
                    <button
                      key={`${space.id}:${space.listingId}`}
                      className={`registry-public-unit${selected?.id === space.listingId && (unitId === null || unitId === space.listingUnitId) ? " is-selected" : ""}`}
                      onClick={() =>
                        chooseListing(listing, space.listingUnitId)
                      }
                      aria-pressed={
                        selected?.id === space.listingId &&
                        unitId === space.listingUnitId
                      }
                    >
                      <strong>Place {space.number || "non numérotée"}</strong>
                      <span>
                        {listingPrice(listing)}
                        {listing.spaces.length > 1
                          ? listing.transactionType === "rent"
                            ? " · loyer mensuel du lot"
                            : " · prix total du lot"
                          : ""}
                      </span>
                    </button>
                  ) : null;
                })}
              </div>
              {!listings.length ? (
                <p className="notice">
                  Aucune annonce proposée à ce niveau pour le moment.
                </p>
              ) : null}
              {selected ? (
                <section className="registry-plan card">
                  <h2>
                    <Box size={20} /> Plan du niveau
                  </h2>
                  {sceneAvailable ? (
                    <>
                      <p className="muted">
                        Plan associé à « {selected.title} ». Choisissez
                        l’annonce dont vous souhaitez consulter le plan : chaque
                        vue couvre les places décrites dans ce bien.
                      </p>
                      <button
                        className="button button-secondary"
                        onClick={() => setShowPlan((value) => !value)}
                      >
                        {showPlan
                          ? "Masquer le plan"
                          : "Ouvrir le plan contrôlé"}
                      </button>
                      {showPlan ? (
                        <div className="registry-public-viewer">
                          <ParkingViewer
                            listing={selected}
                            viewLevel={level?.number}
                            selectedSpaceId={unitId}
                            onSpaceSelect={setUnitId}
                          />
                        </div>
                      ) : null}
                    </>
                  ) : (
                    <p className="muted">
                      Aucun modèle approuvé pour cette annonce à ce niveau.
                      Consultez ses photos et ses dimensions ; aucun plan n’est
                      reconstitué automatiquement.
                    </p>
                  )}
                </section>
              ) : null}
              <div className="registry-public-listings">
                {listings.map((listing) => (
                  <article
                    className={`card registry-listing${selected?.id === listing.id ? " is-selected" : ""}`}
                    key={listing.id}
                  >
                    {listing.photos[0] ? (
                      <SafePhoto
                        src={listing.photos[0]}
                        alt={`Vue publique de ${listing.title}`}
                        className="registry-listing-photo"
                      />
                    ) : null}
                    <div>
                      <p className="eyebrow">
                        <MapPin size={14} /> {listing.city} · {listing.district}
                      </p>
                      <h2>{listing.title}</h2>
                      <p>
                        {areaLabel(listing.spaces)} · {listing.spaces.length}{" "}
                        place(s)
                      </p>
                      <strong>
                        {listingPrice(listing)}
                        {listing.spaces.length > 1
                          ? listing.transactionType === "rent"
                            ? " · loyer mensuel du lot"
                            : " · prix total du lot"
                          : ""}
                      </strong>
                      <div className="registry-inline">
                        <button
                          className="button button-secondary"
                          onClick={() => chooseListing(listing)}
                        >
                          Choisir ce bien
                        </button>
                        <Link
                          className="button button-primary"
                          href={`/annonces/${listing.id}/${listing.slug}`}
                        >
                          Voir la fiche et contacter
                        </Link>
                      </div>
                    </div>
                  </article>
                ))}
              </div>
            </section>
            <aside className="card registry-public-aside">
              <h2>{selected?.title || "Choisir une annonce"}</h2>
              {selected ? (
                <>
                  <p className="registry-public-price">
                    {listingPrice(selected)}
                  </p>
                  <p>
                    {selected.transactionType === "rent"
                      ? selected.spaces.length > 1
                        ? `Loyer mensuel du lot de ${selected.spaces.length} places`
                        : "Loyer mensuel de la place"
                      : selected.spaces.length > 1
                        ? `Prix total du lot de ${selected.spaces.length} places`
                        : "Prix de la place"}
                  </p>
                  <p>
                    Les dimensions, photos et observations restent propres à
                    chaque annonce et à ses unités.
                  </p>
                  <Link
                    className="button button-primary"
                    href={`/annonces/${selected.id}/${selected.slug}`}
                  >
                    Consulter ce bien
                  </Link>
                </>
              ) : null}
              <p className="muted">
                Les documents privés et les annonces à localisation masquée ne
                sont jamais inclus dans cette vue partagée.
              </p>
            </aside>
          </div>
        </>
      ) : null}
    </main>
  );
}
