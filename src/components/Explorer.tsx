"use client";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowRight,
  Check,
  Layers3,
  List,
  Map as MapIcon,
  MapPin,
  Search,
  SlidersHorizontal,
  Tag,
  X,
} from "lucide-react";
import {
  readSearch,
  searchParams,
  searchProblem,
  type SearchState,
} from "@/lib/search-client";
import {
  hasExplorerFilters,
  resetExplorerFilters,
} from "@/lib/explorer-search";
import {
  normalizeMapView,
  type MapViewState,
  type MapSearchArea,
} from "@/lib/map-view";
import { useFavorites } from "@/lib/favorites";
import {
  favoritesSearchParams,
  loadAllFavoriteOffers,
  showsAllFavoriteOffers,
} from "@/lib/favorites-search";
import {
  MOBILE_MAP_MEDIA_QUERY,
  observeCityMapDemand,
  readExplorerView,
  type ExplorerView,
  type ExplorerViewPreference,
} from "@/lib/map-demand";
import "@/styles/explorer.css";
import { type Listing } from "@/lib/types";
import FilterSelect from "./FilterSelect";
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
export default function Explorer({
  favoritesOnly = false,
}: {
  favoritesOnly?: boolean;
}) {
  const restoredScroll = useRef(false);
  const requestGeneration = useRef(0);
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
  const [transactionType, setTransactionType] = useState<"sale" | "rent">(
    "sale",
  );
  const [allFavoriteOffers, setAllFavoriteOffers] = useState(favoritesOnly);
  const offerFilter = allFavoriteOffers ? undefined : transactionType;
  const [maxPrice, setMaxPrice] = useState("");
  const [minPrice, setMinPrice] = useState("");
  const [covered, setCovered] = useState("");
  const [closed, setClosed] = useState("");
  const [occupancy, setOccupancy] = useState("");
  const [level, setLevel] = useState("");
  const [bbox, setBbox] = useState("");
  const [center, setCenter] = useState("");
  const [radiusKm, setRadiusKm] = useState("");
  const [radiusDraft, setRadiusDraft] = useState("5");
  const [mapView, setMapView] = useState<MapViewState | undefined>(undefined);
  const [minArea, setMinArea] = useState("");
  const [sort, setSort] = useState("recent");
  const [more, setMore] = useState(false);
  const [only3D, setOnly3D] = useState(false);
  const [viewPreference, setViewPreference] =
    useState<ExplorerViewPreference>("auto");
  const [visibleView, setVisibleView] = useState<ExplorerView>("list");
  const scrollPositions = useRef({ list: 0, map: 0 });
  const previousView = useRef<ExplorerView | null>(null);
  const [mapRequested, setMapRequested] = useState(false);
  const [compare, setCompare] = useState<string[]>([]);
  const [compareNotice, setCompareNotice] = useState("");
  const favorites = useFavorites();
  const favoriteKey = favoritesOnly ? favorites.ids.join(",") : "";
  const searchState = useMemo(
    () => ({
      city,
      transactionType,
      type,
      minPrice,
      maxPrice,
      minArea,
      only3D,
      sort,
      covered,
      closed,
      occupancy,
      level,
      bbox,
      center,
      radiusKm,
    }),
    [
      city,
      transactionType,
      type,
      minPrice,
      maxPrice,
      minArea,
      only3D,
      sort,
      covered,
      closed,
      occupancy,
      level,
      bbox,
      center,
      radiusKm,
    ],
  );
  const advancedCount = [
    minPrice,
    covered,
    closed,
    occupancy,
    level,
    bbox,
    radiusKm,
    only3D,
  ].filter((v) => v !== "" && v !== false).length;
  const apiQuery = searchParams(searchState, true).toString();
  function cameraChanged(value: MapViewState, meta?: { transient?: boolean }) {
    setMapView(value);
    if (meta?.transient) return;
    try {
      sessionStorage.setItem("gp:explore:map:v1", JSON.stringify(value));
    } catch {
      /* Camera persistence is optional. */
    }
  }
  function searchArea(area: MapSearchArea) {
    setBbox(area.bbox.join(","));
    setCenter("");
    setRadiusKm("");
    setSelectedId(null);
  }

  const load = useCallback(
    async (quiet = false) => {
      if (favoritesOnly && favorites.loading) {
        setLoading(true);
        return;
      }
      if (!quiet) setLoading(true);
      setError("");
      const generation = ++requestGeneration.current;
      try {
        const problem = searchProblem(searchState);
        if (problem) throw new Error(problem);
        const params = new URLSearchParams(apiQuery);
        params.set("limit", "24");
        if (favoritesOnly) {
          const ids = favoriteKey.split(",").filter(Boolean);
          if (!ids.length) {
            if (generation === requestGeneration.current) {
              setListings([]);
              setMissingFavorites([]);
              setTotal(0);
              setNextCursor(null);
            }
            return;
          }
          const results = await Promise.all(
            ids.map(async (id) => {
              const response = await fetch(`/api/listings/${id}`, {
                cache: "no-store",
              });
              if (response.status === 404) return id;
              const result = await response.json();
              if (!response.ok)
                throw new Error(
                  result.error || "Impossible de vérifier vos favoris.",
                );
              return null;
            }),
          );
          if (generation !== requestGeneration.current) return;
          setMissingFavorites(
            results.filter((id): id is string => id !== null),
          );
          params.set("ids", ids.join(","));
          if (allFavoriteOffers) {
            const data = await loadAllFavoriteOffers(searchState, ids);
            if (generation !== requestGeneration.current) return;
            setListings(data);
            setNextCursor(null);
            setTotal(data.length);
            return;
          }
        } else setMissingFavorites([]);
        const r = await fetch("/api/listings?" + params);
        const result = await r.json();
        if (!r.ok)
          throw new Error(result.error || "La recherche est interrompue.");
        if (generation !== requestGeneration.current) return;
        setListings(result.data);
        setNextCursor(result.nextCursor || null);
        setTotal(result.total ?? result.data.length);
      } catch (e) {
        if (generation === requestGeneration.current)
          setError((e as Error).message);
      } finally {
        if (generation === requestGeneration.current) setLoading(false);
      }
    },
    [
      apiQuery,
      searchState,
      favoritesOnly,
      favoriteKey,
      favorites.loading,
      allFavoriteOffers,
    ],
  );
  const applySearch = useCallback((search: SearchState) => {
    setQuery(search.city);
    setCity(search.city);
    setType(search.type);
    setTransactionType(search.transactionType);
    setMinPrice(search.minPrice);
    setMaxPrice(search.maxPrice);
    setMinArea(search.minArea);
    setOnly3D(search.only3D);
    setSort(search.sort);
    setCovered(search.covered);
    setClosed(search.closed);
    setOccupancy(search.occupancy);
    setLevel(search.level);
    setBbox(search.bbox);
    setCenter(search.center);
    setRadiusKm(search.radiusKm);
    setRadiusDraft(search.radiusKm || "5");
  }, []);
  useEffect(() => {
    const restore = () => {
      const params = new URLSearchParams(window.location.search);
      applySearch(readSearch(params));
      setAllFavoriteOffers(favoritesOnly && showsAllFavoriteOffers(params));
      setSelectedId(params.get("listing"));
      setViewPreference(readExplorerView(params));
    };
    restore();
    try {
      setMapView(
        normalizeMapView(
          JSON.parse(sessionStorage.getItem("gp:explore:map:v1") || "null"),
        ) || undefined,
      );
    } catch {
      /* No stored camera. */
    }
    setInitialized(true);
    window.addEventListener("popstate", restore);
    return () => window.removeEventListener("popstate", restore);
  }, [applySearch, favoritesOnly]);
  useEffect(() => {
    if (!initialized) return;
    return observeCityMapDemand(
      window.matchMedia(MOBILE_MAP_MEDIA_QUERY),
      viewPreference,
      () => setMapRequested(true),
      setVisibleView,
    );
  }, [initialized, viewPreference]);
  useEffect(() => {
    if (!initialized) return;
    if (previousView.current && previousView.current !== visibleView) {
      const top = scrollPositions.current[visibleView];
      const frame = requestAnimationFrame(() =>
        window.scrollTo({ top, behavior: "instant" }),
      );
      previousView.current = visibleView;
      return () => cancelAnimationFrame(frame);
    }
    previousView.current = visibleView;
  }, [visibleView, initialized]);
  useEffect(() => {
    if (!initialized) return;
    requestGeneration.current++;
    setLoading(true);
    setNextCursor(null);
    const timer = window.setTimeout(() => void load(), 200);
    return () => window.clearTimeout(timer);
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
    if (!initialized || loading || restoredScroll.current) return;
    restoredScroll.current = true;
    const panel = document.getElementById("resultats");
    try {
      if (visibleView === "list") {
        const saved = JSON.parse(
          sessionStorage.getItem("gp:explore:list-scroll") || "null",
        );
        if (
          saved?.href === window.location.pathname + window.location.search &&
          Number.isFinite(saved.top) &&
          saved.top >= 0
        ) {
          scrollPositions.current.list = saved.top;
          const frame = requestAnimationFrame(() =>
            window.scrollTo({ top: saved.top, behavior: "instant" }),
          );
          return () => cancelAnimationFrame(frame);
        }
      } else if (panel) {
        panel.scrollTop = Number(
          sessionStorage.getItem("gp:explore:scroll") || 0,
        );
      }
    } catch {
      /* No stored position. */
    }
  }, [loading, initialized, visibleView]);
  async function loadMore() {
    if (!nextCursor || loadingMore) return;
    setLoadingMore(true);
    try {
      const generation = requestGeneration.current;
      const p = new URLSearchParams(apiQuery);
      p.set("cursor", nextCursor);
      p.set("limit", "24");
      if (favoritesOnly) p.set("ids", favoriteKey);
      const r = await fetch("/api/listings?" + p);
      const v = await r.json();
      if (!r.ok) throw new Error(v.error);
      if (generation !== requestGeneration.current) return;
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
  const filtered = !loading && !error ? listings : [];
  const hasFilters = hasExplorerFilters(searchState);
  const selected = filtered.find((l) => l.id === selectedId) || null;
  useEffect(() => {
    if (initialized) {
      const params = favoritesOnly
        ? favoritesSearchParams(searchState, allFavoriteOffers)
        : searchParams(searchState);
      if (viewPreference !== "auto") params.set("display", viewPreference);
      if (selectedId) params.set("listing", selectedId);
      const href = `${window.location.pathname}${params.size ? "?" + params : ""}`;
      try {
        sessionStorage.setItem("gp:explore:href", href);
      } catch {
        /* URL remains the source of navigation context. */
      }
      window.history.replaceState(
        null,
        "",
        `${window.location.pathname}${params.size ? "?" + params : ""}`,
      );
    }
  }, [
    searchState,
    selectedId,
    initialized,
    viewPreference,
    favoritesOnly,
    allFavoriteOffers,
  ]);
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
    applySearch(resetExplorerFilters(searchState));
    setSelectedId(null);
  }
  function changeView(view: ExplorerView) {
    if (view === visibleView && viewPreference !== "auto") return;
    scrollPositions.current[visibleView] = window.scrollY;
    const params = favoritesOnly
      ? favoritesSearchParams(searchState, allFavoriteOffers)
      : searchParams(searchState);
    params.set("display", view);
    if (selectedId) params.set("listing", selectedId);
    window.history.pushState(null, "", `${window.location.pathname}?${params}`);
    setViewPreference(view);
  }
  function choose(id: string) {
    setSelectedId(id);
    setViewPreference("map");
  }
  function rememberListPosition() {
    try {
      sessionStorage.setItem(
        "gp:explore:list-scroll",
        JSON.stringify({
          href: window.location.pathname + window.location.search,
          top: window.scrollY,
        }),
      );
    } catch {
      /* Returning to the list still works without optional scroll persistence. */
    }
  }
  const emptyMessage = favoritesOnly
    ? favorites.ids.length
      ? "Aucun favori disponible ne correspond à ces filtres. Vos favoris restent enregistrés."
      : "Touchez le cœur d’une annonce pour la retrouver ici."
    : hasFilters
      ? "Élargissez votre recherche en retirant des filtres ou en choisissant un autre secteur."
      : `Aucune annonce à ${transactionType === "rent" ? "louer" : "vendre"} pour le moment. De nouvelles places pourront être proposées ici.`;
  const emptyAction = hasFilters ? (
    <button className="button button-secondary" onClick={reset}>
      Élargir la recherche
    </button>
  ) : favoritesOnly ? (
    <Link href={`/?display=${visibleView}`} className="button button-primary">
      Explorer les parkings
    </Link>
  ) : (
    <button
      className="button button-secondary"
      onClick={() => {
        setTransactionType(transactionType === "rent" ? "sale" : "rent");
        setSelectedId(null);
      }}
    >
      Voir les parkings à {transactionType === "rent" ? "vendre" : "louer"}
    </button>
  );
  return (
    <main id="main" className={`explorer explorer-view-${visibleView}`}>
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
            <span className="search-sale">
              {allFavoriteOffers
                ? "Tous mes favoris"
                : transactionType === "rent"
                  ? "À louer"
                  : "À vendre"}
            </span>
            <button className="search-submit" aria-label="Rechercher">
              <Search size={25} />
            </button>
          </form>
        </div>
        <div className="filters">
          <FilterSelect
            label="Type d’offre"
            value={allFavoriteOffers ? "all" : transactionType}
            applied={!allFavoriteOffers}
            onChange={(value) => {
              setAllFavoriteOffers(favoritesOnly && value === "all");
              if (value === "all") setCompare([]);
              if (value !== "all") setTransactionType(value as "sale" | "rent");
              if (value === "all" && sort.startsWith("price_"))
                setSort("recent");
              setMinPrice("");
              setMaxPrice("");
              setSelectedId(null);
            }}
            options={[
              ...(favoritesOnly
                ? [{ value: "all", label: "Tous mes favoris" }]
                : []),
              { value: "sale", label: "À vendre" },
              { value: "rent", label: "À louer" },
            ]}
          />
          <FilterSelect
            label="Type de parking"
            value={type}
            onChange={setType}
            applied={Boolean(type)}
            options={[
              { value: "", label: "Parking & box" },
              { value: "covered", label: "Parking couvert" },
              { value: "box", label: "Box fermé" },
              { value: "outdoor", label: "Extérieur" },
              { value: "mixed", label: "Lot mixte" },
            ]}
          />
          <FilterSelect
            label="Budget maximum"
            disabled={allFavoriteOffers}
            hint={
              transactionType === "rent"
                ? "Loyer mensuel par place, ou du lot proposé ensemble"
                : "Prix par place, ou du lot proposé ensemble"
            }
            value={maxPrice}
            onChange={setMaxPrice}
            applied={Boolean(maxPrice || minPrice)}
            options={[
              { value: "", label: "Budget maximum" },
              ...(maxPrice &&
              !(
                transactionType === "rent"
                  ? ["50", "100", "150", "200"]
                  : ["20000", "25000", "30000", "50000"]
              ).includes(maxPrice)
                ? [
                    {
                      value: maxPrice,
                      label: `Jusqu’à ${Number(maxPrice).toLocaleString("fr-FR")} €`,
                    },
                  ]
                : []),
              ...(transactionType === "rent"
                ? [
                    { value: "50", label: "Jusqu’à 50 € / mois" },
                    { value: "100", label: "Jusqu’à 100 € / mois" },
                    { value: "150", label: "Jusqu’à 150 € / mois" },
                    { value: "200", label: "Jusqu’à 200 € / mois" },
                  ]
                : [
                    { value: "20000", label: "Jusqu’à 20 000 €" },
                    { value: "25000", label: "Jusqu’à 25 000 €" },
                    { value: "30000", label: "Jusqu’à 30 000 €" },
                    { value: "50000", label: "Jusqu’à 50 000 €" },
                  ]),
            ]}
          />
          <FilterSelect
            label="Surface minimum par place"
            value={minArea}
            onChange={setMinArea}
            applied={Boolean(minArea)}
            options={[
              { value: "", label: "Surface" },
              { value: "12", label: "12 m² minimum" },
              { value: "14", label: "14 m² minimum" },
              { value: "16", label: "16 m² minimum" },
            ]}
          />
          <button
            className={`filter-chip ${more || advancedCount > 0 ? "filter-applied" : ""}`}
            onClick={() => setMore(!more)}
            aria-expanded={more}
          >
            <SlidersHorizontal size={18} />
            Plus de filtres
            {advancedCount ? (
              <span className="filter-count">{advancedCount}</span>
            ) : null}
          </button>
          {hasFilters ? (
            <button className="text-button clear-filters" onClick={reset}>
              <X size={15} />
              Effacer
            </button>
          ) : null}
          <div
            className="explorer-view-switch"
            role="group"
            aria-label="Affichage des annonces"
          >
            <button
              type="button"
              onClick={() => changeView("list")}
              aria-pressed={visibleView === "list"}
              className={visibleView === "list" ? "active" : ""}
            >
              <List size={16} />
              Liste
            </button>
            <button
              type="button"
              onClick={() => changeView("map")}
              aria-pressed={visibleView === "map"}
              className={visibleView === "map" ? "active" : ""}
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
            <div className="explorer-advanced-grid">
              <label className="field">
                {transactionType === "rent"
                  ? "Loyer minimum mensuel (€)"
                  : "Budget minimum (€)"}
                <input
                  className="input"
                  type="number"
                  min="0"
                  step="1"
                  value={minPrice}
                  disabled={allFavoriteOffers}
                  onChange={(e) => setMinPrice(e.target.value)}
                  placeholder="Sans minimum"
                />
              </label>
              <label className="field">
                {transactionType === "rent"
                  ? "Loyer maximum mensuel (€)"
                  : "Budget maximum (€)"}
                <input
                  className="input"
                  type="number"
                  min="0"
                  step="1"
                  value={maxPrice}
                  disabled={allFavoriteOffers}
                  onChange={(e) => setMaxPrice(e.target.value)}
                  placeholder="Sans maximum"
                />
              </label>
              <div className="field">
                <span>Couverture</span>
                <FilterSelect
                  label="Couverture"
                  variant="field"
                  value={covered}
                  onChange={setCovered}
                  applied={Boolean(covered)}
                  options={[
                    { value: "", label: "Indifférent" },
                    { value: "1", label: "Couvert (parking ou box)" },
                    { value: "0", label: "Extérieur" },
                  ]}
                />
              </div>
              <div className="field">
                <span>Fermeture</span>
                <FilterSelect
                  label="Fermeture"
                  variant="field"
                  value={closed}
                  onChange={setClosed}
                  applied={Boolean(closed)}
                  options={[
                    { value: "", label: "Indifférent" },
                    { value: "1", label: "Box fermé" },
                    { value: "0", label: "Place ouverte" },
                  ]}
                />
              </div>
              <div className="field">
                <span>Occupation déclarée</span>
                <FilterSelect
                  label="Occupation déclarée"
                  variant="field"
                  value={occupancy}
                  onChange={setOccupancy}
                  applied={Boolean(occupancy)}
                  options={[
                    { value: "", label: "Indifférente" },
                    { value: "vacant", label: "Libre" },
                    { value: "occupied", label: "Occupée" },
                    { value: "unknown", label: "Non renseignée" },
                  ]}
                />
              </div>
              <label className="field">
                Niveau d’au moins une place
                <input
                  className="input"
                  type="number"
                  min="-20"
                  max="50"
                  step="1"
                  value={level}
                  onChange={(e) => setLevel(e.target.value)}
                  placeholder="Tous les niveaux"
                />
              </label>
            </div>
            <fieldset className="explorer-geography">
              <legend>Zone de recherche</legend>
              <p className="small muted">
                Déplacez la carte puis utilisez « Rechercher dans cette zone »,
                ou choisissez un rayon autour de son centre. Les distances
                utilisent la position publique : elles restent approximatives
                pour une annonce localisée au quartier.
              </p>
              {visibleView === "list" ? (
                <button
                  type="button"
                  className="text-button"
                  onClick={() => {
                    setMore(false);
                    changeView("map");
                  }}
                >
                  <MapIcon size={16} />
                  Ouvrir la carte pour choisir une zone
                </button>
              ) : null}
              <label className="field">
                Rayon autour du centre de la carte (km)
                <input
                  className="input"
                  type="number"
                  min="0.1"
                  max="200"
                  step="0.1"
                  value={radiusDraft}
                  onChange={(e) => setRadiusDraft(e.target.value)}
                />
              </label>
              <button
                className="button button-secondary"
                disabled={
                  !mapView ||
                  !Number.isFinite(Number(radiusDraft)) ||
                  Number(radiusDraft) < 0.1 ||
                  Number(radiusDraft) > 200
                }
                onClick={() => {
                  if (!mapView) return;
                  setCenter(mapView.center.join(","));
                  setRadiusKm(radiusDraft);
                  setBbox("");
                  setSelectedId(null);
                }}
              >
                Appliquer autour du centre de la carte
              </button>
              {bbox || radiusKm ? (
                <div className="notice" role="status">
                  <p>
                    {bbox
                      ? "Recherche limitée à la zone de carte sélectionnée."
                      : `Recherche dans un rayon de ${radiusKm} km autour du centre sélectionné.`}{" "}
                    Le déplacement de la carte ne change pas ce filtre
                    automatiquement.
                  </p>
                  <button
                    className="text-button"
                    onClick={() => {
                      setBbox("");
                      setCenter("");
                      setRadiusKm("");
                    }}
                  >
                    Retirer la limite géographique
                  </button>
                </div>
              ) : null}
            </fieldset>
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
              {allFavoriteOffers
                ? " Choisissez « À vendre » ou « À louer » pour filtrer par budget."
                : transactionType === "rent"
                  ? "Le budget s’applique au loyer mensuel d’une place disponible ; pour un lot indivisible, au loyer total du lot."
                  : "Le budget s’applique au prix d’une place disponible ; pour un lot indivisible, au prix total du lot."}
            </p>
            <button
              className="button button-primary full-width"
              onClick={() => setMore(false)}
            >
              Voir les {total} résultats
              <ArrowRight size={17} />
            </button>
          </div>
        ) : null}
      </section>
      <div
        className={`explore-workspace mobile-${visibleView} view-${visibleView}`}
      >
        <section
          id="resultats"
          className="results-panel"
          aria-label="Résultats"
          onScroll={(event) => {
            try {
              sessionStorage.setItem(
                "gp:explore:scroll",
                String(event.currentTarget.scrollTop),
              );
            } catch {
              /* Optional position persistence. */
            }
          }}
        >
          <div className="results-heading">
            <h2>
              {favoritesOnly ? "Mes favoris" : "Les parkings à découvrir"}
            </h2>
            <div className="results-meta">
              <span aria-live="polite">
                {loading
                  ? "Recherche…"
                  : `${total} bien${total > 1 ? "s" : ""}${listings.some((l) => l.isDemo) ? " d’exemple" : ""}`}
              </span>
              <FilterSelect
                label="Trier les résultats"
                variant="sort"
                value={sort}
                onChange={setSort}
                options={[
                  { value: "recent", label: "Plus récents" },
                  ...(!allFavoriteOffers
                    ? [
                        {
                          value: "price_asc",
                          label:
                            transactionType === "rent"
                              ? "Loyer croissant"
                              : "Prix croissant",
                        },
                        {
                          value: "price_desc",
                          label:
                            transactionType === "rent"
                              ? "Loyer décroissant"
                              : "Prix décroissant",
                        },
                      ]
                    : []),
                  { value: "area_asc", label: "Surface par place croissante" },
                  {
                    value: "spaces_desc",
                    label: "Nombre de places décroissant",
                  },
                ]}
              />
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
          {!loading &&
          !error &&
          !filtered.length &&
          !(favoritesOnly && missingFavorites.length) ? (
            <div className="empty-state">
              <Search size={32} />
              <h3>
                {favoritesOnly
                  ? favorites.ids.length
                    ? "Aucun favori pour ces critères."
                    : "Vos favoris commencent ici."
                  : "Aucune place pour ces critères."}
              </h3>
              <p>{emptyMessage}</p>
              {emptyAction}
            </div>
          ) : null}
          <div className="results-list">
            {filtered.map((l, index) => (
              <ListingCard
                key={l.id}
                eager={index < 2}
                listing={l}
                transactionType={offerFilter}
                selected={selectedId === l.id}
                href={
                  visibleView === "list"
                    ? `/annonces/${l.id}/${l.slug}${offerFilter ? `?transactionType=${offerFilter}` : ""}`
                    : undefined
                }
                onSelect={() => choose(l.id)}
                onNavigate={rememberListPosition}
                favorite={favorites.ids.includes(l.id)}
                favoriteDisabled={favorites.loading}
                onFavorite={() => void favorites.toggle(l.id)}
                compare={compare.includes(l.id)}
                onCompare={
                  allFavoriteOffers ? undefined : () => toggleCompare(l.id)
                }
              />
            ))}
          </div>
          {nextCursor ? (
            <button
              className="button button-secondary full-width"
              onClick={loadMore}
              disabled={loadingMore || loading}
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
                    disabled={favorites.loading}
                    onClick={() => void favorites.toggle(id)}
                  >
                    Retirer des favoris
                  </button>
                </div>
              ))}
            </div>
          ) : null}
          <p className="demo-note">
            {listings.some((l) => l.isDemo)
              ? "Version de démonstration · biens fictifs"
              : "Annonces proposées par leurs vendeurs"}
          </p>
        </section>
        <section
          className={`map-panel ${selected ? "has-inspector" : ""}`}
          aria-label="Carte des parkings"
        >
          {initialized && mapRequested ? (
            <CityMap
              listings={filtered}
              visible={visibleView === "map"}
              transactionType={offerFilter}
              selectedId={selected?.id || null}
              onSelect={choose}
              initialView={mapView}
              onCameraChange={cameraChanged}
              onSearchArea={searchArea}
              onRecenter={() => setSelectedId(null)}
            />
          ) : (
            <div className="map-loading" role="status">
              Préparation de la carte…
            </div>
          )}
          {selected ? (
            <ListingInspector
              key={selected.id}
              listing={selected}
              transactionType={offerFilter}
              onClose={() => {
                setSelectedId(null);
              }}
            />
          ) : !loading && !error && filtered.length ? (
            <div className="map-hint">
              <MapPin size={18} />
              <span>
                Choisissez un prix sur la carte pour découvrir le bien.
              </span>
            </div>
          ) : !loading && !error ? (
            <div className="map-empty-state" role="status">
              <Search size={24} />
              <strong>
                {favoritesOnly
                  ? "Aucun favori à afficher ici."
                  : "Aucune annonce pour cette recherche."}
              </strong>
              <p>{emptyMessage}</p>
              {emptyAction}
            </div>
          ) : error ? (
            <div className="map-empty-state" role="status">
              <strong>La recherche est interrompue.</strong>
              <p>{error}</p>
              <button
                className="button button-primary"
                onClick={() => void load()}
              >
                Réessayer
              </button>
            </div>
          ) : null}
          {!allFavoriteOffers && (filtered.length > 0 || compare.length > 0) ? (
            <button
              className="compare-floating button"
              onClick={() => {
                if (compare.length >= 2)
                  window.location.assign(
                    `/comparer?ids=${compare.join(",")}${offerFilter ? `&transactionType=${offerFilter}` : ""}`,
                  );
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
          ) : null}
        </section>
      </div>
      {compare.length > 0 ? (
        <a
          className="mobile-compare explorer-compare button"
          href={
            compare.length >= 2
              ? `/comparer?ids=${compare.join(",")}${offerFilter ? `&transactionType=${offerFilter}` : ""}`
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
