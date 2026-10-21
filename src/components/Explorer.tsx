"use client";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  ChevronDown,
  Heart,
  Layers3,
  List,
  Map as MapIcon,
  MapPin,
  Search,
  SlidersHorizontal,
  Tag,
  X,
} from "lucide-react";
import { api } from "@/lib/client";
import { useFavorites } from "@/lib/favorites";
import { money, type Listing, type ParkingType } from "@/lib/types";
import ListingCard from "./ListingCard";
import ListingInspector from "./ListingInspector";
const CityMap = dynamic(() => import("./maps/CityMap"), {
  ssr: false,
  loading: () => (
    <div className="map-loading">
      <div className="loading-indicator" />
      <span>La ville prend forme…</span>
    </div>
  ),
});
const ParkingViewer = dynamic(() => import("./maps/ParkingViewer"), {
  ssr: false,
  loading: () => (
    <div className="map-loading">
      <div className="loading-indicator" />
      <span>Préparation du parking…</span>
    </div>
  ),
});
export default function Explorer({
  favoritesOnly = false,
}: {
  favoritesOnly?: boolean;
}) {
  const restoredScroll = useRef(false);
  const [missingFavorites, setMissingFavorites] = useState<string[]>([]);
  const [listings, setListings] = useState<Listing[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [initialized, setInitialized] = useState(false);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [total, setTotal] = useState(0);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [city, setCity] = useState("");
  const [type, setType] = useState("");
  const [maxPrice, setMaxPrice] = useState("");
  const [minArea, setMinArea] = useState("");
  const [sort, setSort] = useState("recent");
  const [more, setMore] = useState(false);
  const [only3D, setOnly3D] = useState(false);
  const [view, setView] = useState<"city" | "parking">("city");
  const [mobileView, setMobileView] = useState<"list" | "map">("list");
  const [compare, setCompare] = useState<string[]>([]);
  const [compareNotice, setCompareNotice] = useState("");
  const favorites = useFavorites();
  const favoriteKey = favoritesOnly ? favorites.ids.join(",") : "";
  const load = useCallback(
    async (quiet = false) => {
      if (!quiet) setLoading(true);
      setError("");
      try {
        if (favoritesOnly) {
          const ids = favoriteKey.split(",").filter(Boolean);
          const results = await Promise.all(
            ids.map(async (id) => {
              const response = await fetch(`/api/listings/${id}`, {
                cache: "no-store",
              });
              if (response.status === 404) return { id, listing: null };
              const result = await response.json();
              if (!response.ok)
                throw new Error(
                  result.error || "Impossible de vérifier vos favoris.",
                );
              return { id, listing: result.data as Listing };
            }),
          );
          const available = results.flatMap((r) =>
            r.listing ? [r.listing] : [],
          );
          setMissingFavorites(
            results.filter((r) => !r.listing).map((r) => r.id),
          );
          setListings(available);
          setTotal(results.length);
          setNextCursor(null);
          return;
        }
        const params = new URLSearchParams();
        if (city) params.set("q", city);
        if (type) params.set("type", type);
        if (maxPrice) params.set("priceMax", String(Number(maxPrice) * 100));
        if (minArea) params.set("areaMin", minArea);
        if (only3D) params.set("scene", "1");
        params.set("sort", sort);
        params.set("limit", "24");
        const r = await fetch("/api/listings?" + params);
        const result = await r.json();
        if (!r.ok)
          throw new Error(result.error || "La recherche est interrompue.");
        setListings(result.data);
        setNextCursor(result.nextCursor || null);
        setTotal(result.total ?? result.data.length);
      } catch (e) {
        setError((e as Error).message);
      } finally {
        setLoading(false);
      }
    },
    [city, type, maxPrice, minArea, sort, only3D, favoritesOnly, favoriteKey],
  );
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    setQuery(params.get("city") || "");
    setCity(params.get("city") || "");
    setType(params.get("type") || "");
    setMaxPrice(params.get("priceMax") || "");
    setMinArea(params.get("areaMin") || "");
    setOnly3D(params.get("scene") === "1");
    setSort(params.get("sort") || "recent");
    setSelectedId(params.get("listing"));
    if (params.get("listing")) setMobileView("map");
    if (params.get("view") === "parking") setView("parking");
    setInitialized(true);
  }, []);
  useEffect(() => {
    if (initialized) void load();
  }, [initialized, load]);
  useEffect(() => {
    if (!initialized) return;
    const onFocus = () => {
      if (document.visibilityState === "visible") void load(true);
    };
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible" && listings.length <= 24)
        void load(true);
    }, 30000);
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onFocus);
    return () => {
      clearInterval(timer);
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onFocus);
    };
  }, [initialized, load, listings.length]);
  useEffect(() => {
    if (loading || restoredScroll.current) return;
    restoredScroll.current = true;
    const panel = document.getElementById("resultats");
    if (panel)
      panel.scrollTop = Number(
        sessionStorage.getItem("gp:explore:scroll") || 0,
      );
  }, [loading]);
  async function loadMore() {
    if (!nextCursor || loadingMore) return;
    setLoadingMore(true);
    try {
      const p = new URLSearchParams({ cursor: nextCursor, sort, limit: "24" });
      if (city) p.set("q", city);
      if (type) p.set("type", type);
      if (maxPrice) p.set("priceMax", String(Number(maxPrice) * 100));
      if (minArea) p.set("areaMin", minArea);
      if (only3D) p.set("scene", "1");
      const r = await fetch("/api/listings?" + p);
      const v = await r.json();
      if (!r.ok) throw new Error(v.error);
      setListings((current) => [
        ...current,
        ...v.data.filter((l: Listing) => !current.some((c) => c.id === l.id)),
      ]);
      setNextCursor(v.nextCursor || null);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoadingMore(false);
    }
  }
  const filtered = useMemo(
    () =>
      listings
        .filter(
          (l) =>
            (!favoritesOnly || favorites.ids.includes(l.id)) &&
            (!city ||
              `${l.city} ${l.district}`
                .toLocaleLowerCase("fr")
                .includes(city.toLocaleLowerCase("fr"))) &&
            (!type || l.type === type) &&
            (!maxPrice || l.priceCents <= Number(maxPrice) * 100) &&
            (!minArea ||
              l.spaces.every(
                (s) => s.areaM2 !== null && s.areaM2 >= Number(minArea),
              )) &&
            (!only3D || l.sceneAvailable),
        )
        .sort((a, b) =>
          sort === "price_asc"
            ? a.priceCents - b.priceCents
            : sort === "price_desc"
              ? b.priceCents - a.priceCents
              : b.createdAt.localeCompare(a.createdAt),
        ),
    [
      listings,
      city,
      type,
      maxPrice,
      minArea,
      only3D,
      sort,
      favoritesOnly,
      favorites.ids,
    ],
  );
  const selected = filtered.find((l) => l.id === selectedId) || null;
  useEffect(() => {
    if (!loading) {
      const params = new URLSearchParams();
      if (city) params.set("city", city);
      if (type) params.set("type", type);
      if (maxPrice) params.set("priceMax", maxPrice);
      if (minArea) params.set("areaMin", minArea);
      if (only3D) params.set("scene", "1");
      if (selectedId) params.set("listing", selectedId);
      if (view === "parking") params.set("view", "parking");
      if (sort !== "recent") params.set("sort", sort);
      const href = `${window.location.pathname}${params.size ? "?" + params : ""}`;
      sessionStorage.setItem("gp:explore:href", href);
      window.history.replaceState(
        null,
        "",
        `${window.location.pathname}${params.size ? "?" + params : ""}`,
      );
    }
  }, [city, type, maxPrice, minArea, only3D, selectedId, sort, view, loading]);
  function toggleCompare(id: string) {
    setCompareNotice("");
    setCompare((current) =>
      current.includes(id)
        ? current.filter((x) => x !== id)
        : current.length < 3
          ? [...current, id]
          : (setCompareNotice("Vous pouvez comparer trois biens à la fois."),
            current),
    );
  }
  function reset() {
    setQuery("");
    setCity("");
    setType("");
    setMaxPrice("");
    setMinArea("");
    setOnly3D(false);
  }
  function choose(id: string) {
    setSelectedId(id);
    setView("city");
    setMobileView("map");
  }
  return (
    <main id="main" className="explorer">
      <section className="search-section">
        <div className="search-heading">
          <h1>
            {favoritesOnly
              ? "Vos places préférées."
              : "Votre prochaine place est ici."}
          </h1>
          <form
            className="location-search"
            onSubmit={(e) => {
              e.preventDefault();
              setCity(query);
            }}
          >
            <MapPin size={25} />
            <input
              aria-label="Ville ou quartier"
              placeholder="Ville ou quartier"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
            <span className="search-separator" />
            <Tag size={22} />
            <span className="search-sale">À vendre</span>
            <button className="search-submit" aria-label="Rechercher">
              <Search size={25} />
            </button>
          </form>
        </div>
        <div className="filters">
          <span className="filter-chip active-filter">À vendre</span>
          <label
            className={`filter-chip select-chip ${type ? "filter-applied" : ""}`}
          >
            <span className="sr-only">Type de parking</span>
            <select
              aria-label="Type de parking"
              value={type}
              onChange={(e) => setType(e.target.value as ParkingType)}
            >
              <option value="">Parking & box</option>
              <option value="covered">Parking couvert</option>
              <option value="box">Box fermé</option>
              <option value="outdoor">Extérieur</option>
            </select>
            <ChevronDown size={16} />
          </label>
          <label
            className={`filter-chip select-chip ${maxPrice ? "filter-applied" : ""}`}
          >
            <span className="sr-only">Budget maximum</span>
            <select
              aria-label="Budget maximum"
              value={maxPrice}
              onChange={(e) => setMaxPrice(e.target.value)}
            >
              <option value="">Budget</option>
              <option value="20000">Jusqu’à 20 000 €</option>
              <option value="25000">Jusqu’à 25 000 €</option>
              <option value="30000">Jusqu’à 30 000 €</option>
              <option value="50000">Jusqu’à 50 000 €</option>
            </select>
            <ChevronDown size={16} />
          </label>
          <label
            className={`filter-chip select-chip ${minArea ? "filter-applied" : ""}`}
          >
            <select
              aria-label="Surface minimum par place"
              value={minArea}
              onChange={(e) => setMinArea(e.target.value)}
            >
              <option value="">Surface</option>
              <option value="12">12 m² minimum</option>
              <option value="14">14 m² minimum</option>
              <option value="16">16 m² minimum</option>
            </select>
            <ChevronDown size={16} />
          </label>
          <button
            className={`filter-chip ${more || only3D ? "filter-applied" : ""}`}
            onClick={() => setMore(!more)}
            aria-expanded={more}
          >
            <SlidersHorizontal size={18} />
            Plus de filtres
            {only3D ? <span className="filter-count">1</span> : null}
          </button>
          {city || type || maxPrice || minArea || only3D ? (
            <button className="text-button clear-filters" onClick={reset}>
              <X size={15} />
              Effacer
            </button>
          ) : null}
          <div className="mobile-view-switch">
            <button
              onClick={() => setMobileView("list")}
              className={mobileView === "list" ? "active" : ""}
            >
              <List size={16} />
              Liste
            </button>
            <button
              onClick={() => setMobileView("map")}
              className={mobileView === "map" ? "active" : ""}
            >
              <MapIcon size={16} />
              Carte
            </button>
          </div>
        </div>
        {more ? (
          <div className="filter-popover">
            <div className="section-row">
              <strong>Affiner la découverte</strong>
              <button
                className="icon-button"
                onClick={() => setMore(false)}
                aria-label="Fermer les filtres"
              >
                <X size={20} />
              </button>
            </div>
            <label className="checkbox-field">
              <input
                type="checkbox"
                checked={only3D}
                onChange={(e) => setOnly3D(e.target.checked)}
              />
              <Layers3 size={18} />
              Avec un plan 3D disponible
            </label>
            <p className="small muted">
              Les surfaces inconnues sont exclues lorsqu’un minimum est choisi.
              Le budget correspond au prix total du bien ou du lot.
            </p>
            <button
              className="button button-primary full-width"
              onClick={() => setMore(false)}
            >
              Voir les {filtered.length} résultats
              <ArrowRight size={17} />
            </button>
          </div>
        ) : null}
      </section>
      <div className={`explore-workspace mobile-${mobileView}`}>
        <section
          id="resultats"
          className="results-panel"
          aria-label="Résultats"
          onScroll={(event) =>
            sessionStorage.setItem(
              "gp:explore:scroll",
              String(event.currentTarget.scrollTop),
            )
          }
        >
          <div className="results-heading">
            <h2>
              {favoritesOnly ? "Mes favoris" : "Les parkings à découvrir"}
            </h2>
            <div className="results-meta">
              <span aria-live="polite">
                {loading
                  ? "Recherche…"
                  : `${favoritesOnly ? filtered.length : total} bien${(favoritesOnly ? filtered.length : total) > 1 ? "s" : ""}${listings.some((l) => l.isDemo) ? " d’exemple" : ""}`}
              </span>
              <select
                aria-label="Trier les résultats"
                value={sort}
                onChange={(e) => setSort(e.target.value)}
              >
                <option value="recent">Plus récents</option>
                <option value="price_asc">Prix croissant</option>
                <option value="price_desc">Prix décroissant</option>
              </select>
            </div>
          </div>
          {error ? (
            <div className="empty-state">
              <h3>La recherche est interrompue.</h3>
              <p>{error}</p>
              <button
                className="button button-primary"
                onClick={() => void load()}
              >
                Réessayer
              </button>
            </div>
          ) : null}
          {loading ? (
            <div className="list-skeleton" aria-label="Chargement des annonces">
              {[0, 1, 2].map((i) => (
                <div className="skeleton-card" key={i} />
              ))}
            </div>
          ) : null}
          {!loading && !error && !filtered.length ? (
            <div className="empty-state">
              <Search size={32} />
              <h3>
                {favoritesOnly
                  ? "Vos favoris commencent ici."
                  : "Aucune place pour ces critères."}
              </h3>
              <p>
                {favoritesOnly
                  ? "Touchez le cœur d’une annonce pour la retrouver ici."
                  : "Essayez un autre quartier ou élargissez votre budget."}
              </p>
              {favoritesOnly ? (
                <Link href="/" className="button button-primary">
                  Explorer les parkings
                </Link>
              ) : (
                <button className="button button-secondary" onClick={reset}>
                  Réinitialiser les filtres
                </button>
              )}
            </div>
          ) : null}
          <div className="results-list">
            {filtered.map((l, index) => (
              <ListingCard
                key={l.id}
                eager={index < 2}
                listing={l}
                selected={selectedId === l.id}
                onSelect={() => choose(l.id)}
                favorite={favorites.ids.includes(l.id)}
                onFavorite={() => void favorites.toggle(l.id)}
                compare={compare.includes(l.id)}
                onCompare={() => toggleCompare(l.id)}
              />
            ))}
          </div>
          {nextCursor ? (
            <button
              className="button button-secondary full-width"
              onClick={loadMore}
              disabled={loadingMore}
            >
              {loadingMore ? "Chargement…" : "Afficher plus de biens"}
            </button>
          ) : null}
          {favoritesOnly && missingFavorites.length > 0 ? (
            <div className="unavailable-favorites">
              <h3>Biens indisponibles</h3>
              <p>
                Ces annonces ont été retirées ou ne sont plus publiques. Vos
                favoris restent enregistrés.
              </p>
              {missingFavorites.map((id, index) => (
                <div key={id}>
                  <span>Annonce indisponible {index + 1}</span>
                  <button
                    className="text-button"
                    onClick={() => void favorites.toggle(id)}
                  >
                    Retirer des favoris
                  </button>
                </div>
              ))}
            </div>
          ) : null}
          <div className="results-note">
            <span className="status-dot" />
            <p>
              Des photos, un état détaillé.
              <br />
              Pour choisir en toute clarté.
            </p>
          </div>
          <p className="demo-note">
            {listings.some((l) => l.isDemo)
              ? "Version de démonstration · biens fictifs"
              : "Annonces proposées par leurs vendeurs"}
          </p>
        </section>
        <section
          className={`map-panel ${selected ? "has-inspector" : ""}`}
          aria-label={
            view === "parking" ? "Vue du parking" : "Carte des parkings"
          }
        >
          {view === "parking" && selected ? (
            <>
              <div className="map-breadcrumb">
                <button className="text-button" onClick={() => setView("city")}>
                  <ArrowLeft size={18} />
                  Carte de {selected.city}
                </button>
                <span />
                {selected.district}
                <Link
                  className="parking-detail-shortcut text-button"
                  href={`/annonces/${selected.id}/${selected.slug}`}
                >
                  Voir la fiche <ArrowRight size={16} />
                </Link>
              </div>
              <ParkingViewer listing={selected} />
              <div className="parking-mobile-summary">
                <strong>{money(selected.priceCents)}</strong>
                <Link
                  className="button"
                  href={`/annonces/${selected.id}/${selected.slug}`}
                >
                  Voir le bien <ArrowRight size={16} />
                </Link>
              </div>
            </>
          ) : (
            <CityMap
              listings={filtered}
              selectedId={selected?.id || null}
              onSelect={choose}
            />
          )}
          <div className="map-top-label">
            <span className="status-dot" />
            {view === "parking"
              ? "À chaque place, sa perspective."
              : "Explorez la ville autrement."}
          </div>
          {selected ? (
            <ListingInspector
              key={selected.id}
              listing={selected}
              onClose={() => {
                setSelectedId(null);
                setView("city");
              }}
              onInterior={() => setView("parking")}
            />
          ) : (
            <div className="map-hint">
              <MapPin size={18} />
              <span>
                Choisissez un prix sur la carte pour découvrir le bien.
              </span>
            </div>
          )}
          <button
            className="compare-floating button"
            onClick={() => {
              if (compare.length >= 2)
                window.location.assign(`/comparer?ids=${compare.join(",")}`);
              else
                setCompareNotice(
                  "Ajoutez au moins deux biens avec « Comparer » sous les annonces.",
                );
            }}
          >
            <Layers3 size={19} />
            Comparer des biens
            {compare.length ? (
              <span className="compare-count">{compare.length}</span>
            ) : null}
          </button>
        </section>
      </div>
      {compare.length > 0 ? (
        <a
          className="mobile-compare button"
          href={
            compare.length >= 2
              ? `/comparer?ids=${compare.join(",")}`
              : "#resultats"
          }
        >
          <Layers3 size={18} />
          {compare.length >= 2
            ? `Comparer les ${compare.length} biens`
            : "Sélectionnez un deuxième bien"}
        </a>
      ) : null}
      {compareNotice || favorites.error ? (
        <div className="toast" role="status">
          <Check size={18} />
          {compareNotice || favorites.error}
          <button
            className="icon-button"
            onClick={() => setCompareNotice("")}
            aria-label="Fermer"
          >
            <X size={16} />
          </button>
        </div>
      ) : null}
    </main>
  );
}
