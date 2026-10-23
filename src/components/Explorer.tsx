"use client";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Check,
  Layers3,
  List,
  Map as MapIcon,
  MapPin,
  Search,
  SlidersHorizontal,
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
  searchByLocation,
  searchVisibleMapArea,
  explorerOfferFilterKey,
} from "@/lib/explorer-search";
import {
  encodeExplorerContinuation,
  explorerContinuationKey,
  explorerPageSize,
  explorerRequestError,
  loadExplorerWindow,
  restoredResultCount,
} from "@/lib/explorer-continuation";
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
import "@/styles/explorer-filters.css";
import { type Listing } from "@/lib/types";
import FilterSelect from "./FilterSelect";
import ListingCard from "./ListingCard";
import ListingInspector from "./ListingInspector";
import AnnualCostFilters from "./AnnualCostFilters";

// A map refresh often returns the same nearby offers. Keep their reference so
// existing marker elements and listing cards remain in place.
function keepUnchangedListings(current: Listing[], next: Listing[]) {
  return JSON.stringify(current) === JSON.stringify(next) ? current : next;
}

const CityMap = dynamic(() => import("./maps/CityMap"), {
  ssr: false,
  loading: () => (
    <div className="map-loading">
      <div className="loading-indicator" />
      <span>Chargement de la carte…</span>
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
  const windowRequestPending = useRef(false);
  const windowRequest = useRef<AbortController | null>(null);
  const resultWindow = useRef<{ context: string; count: number } | null>(null);
  const moreFiltersButton = useRef<HTMLButtonElement>(null);
  const moreFiltersPanel = useRef<HTMLDivElement>(null);
  const mapViewButton = useRef<HTMLButtonElement>(null);
  const [missingFavorites, setMissingFavorites] = useState<string[]>([]);
  const [listings, setListings] = useState<Listing[]>([]);
  const [resultsLocationQuery, setResultsLocationQuery] = useState("");
  const [loadedOfferFilterKey, setLoadedOfferFilterKey] = useState("");
  const locationInput = useRef<HTMLInputElement>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [closingSelection, setClosingSelection] = useState(false);
  const [expandedPreview, setExpandedPreview] = useState(false);
  const selectionCloseTimer = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );
  useEffect(() => {
    if (selectionCloseTimer.current) clearTimeout(selectionCloseTimer.current);
    selectionCloseTimer.current = null;
    setClosingSelection(false);
    setExpandedPreview(false);
    return () => {
      if (selectionCloseTimer.current)
        clearTimeout(selectionCloseTimer.current);
    };
  }, [selectedId]);
  function cancelSelectionClose() {
    if (selectionCloseTimer.current) clearTimeout(selectionCloseTimer.current);
    selectionCloseTimer.current = null;
    setClosingSelection(false);
  }
  const [clusterListingIds, setClusterListingIds] = useState<string[]>([]);
  const resultsPanel = useRef<HTMLElement>(null);
  const announcementPanel = useRef<HTMLElement>(null);
  const [desktopDetail, setDesktopDetail] = useState(false);
  useEffect(() => {
    const viewport = window.matchMedia("(min-width: 768px)");
    const update = () => setDesktopDetail(viewport.matches);
    update();
    viewport.addEventListener("change", update);
    return () => viewport.removeEventListener("change", update);
  }, []);
  const resultScrollBeforeSelection = useRef(0);
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
  const [minSpaces, setMinSpaces] = useState("");
  const [sellerType, setSellerType] = useState("");
  const [occupancy, setOccupancy] = useState("");
  const [level, setLevel] = useState("");
  const [bbox, setBbox] = useState("");
  const [center, setCenter] = useState("");
  const [radiusKm, setRadiusKm] = useState("");
  const [radiusDraft, setRadiusDraft] = useState("5");
  const [mapView, setMapView] = useState<MapViewState | undefined>(undefined);
  const [minArea, setMinArea] = useState("");
  const [annualChargesMax, setAnnualChargesMax] = useState("");
  const [propertyTaxMax, setPropertyTaxMax] = useState("");
  const [sort, setSort] = useState("recent");
  const [more, setMore] = useState(false);
  const [viewPreference, setViewPreference] =
    useState<ExplorerViewPreference>("auto");
  const [visibleView, setVisibleView] = useState<ExplorerView>("map");
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
      only3D: false,
      sort,
      covered: "",
      closed: "",
      minSpaces,
      sellerType,
      occupancy,
      level,
      bbox,
      center,
      radiusKm,
      annualChargesMax,
      propertyTaxMax,
    }),
    [
      city,
      transactionType,
      type,
      minPrice,
      maxPrice,
      minArea,
      sort,
      minSpaces,
      sellerType,
      occupancy,
      level,
      bbox,
      center,
      radiusKm,
      annualChargesMax,
      propertyTaxMax,
    ],
  );
  const advancedCount = [
    minPrice,
    minSpaces,
    sellerType,
    occupancy,
    level,
    radiusKm,
    annualChargesMax,
    propertyTaxMax,
  ].filter(Boolean).length;
  const mobileFilterCount =
    advancedCount + [type, maxPrice, minArea].filter(Boolean).length;
  useEffect(() => {
    if (more) moreFiltersPanel.current?.focus({ preventScroll: true });
  }, [more]);
  const apiQuery = searchParams(searchState, true).toString();
  const resultContext = `${favoritesOnly ? "favorites" : "explore"}:${allFavoriteOffers ? "all" : "single"}:${apiQuery}`;
  const offerFilterKey = `${favoritesOnly}:${allFavoriteOffers}:${favoriteKey}:${explorerOfferFilterKey(searchState)}`;
  function closeMoreFilters() {
    setMore(false);
    moreFiltersButton.current?.focus({ preventScroll: true });
  }
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
    setClusterListingIds([]);
    applySearch(searchVisibleMapArea(searchState, area));
    setSelectedId(null);
  }

  const load = useCallback(
    async (quiet = false) => {
      if (quiet && windowRequestPending.current) return;
      if (favoritesOnly && favorites.loading) {
        setLoading(true);
        return;
      }
      if (!quiet) setLoading(true);
      setError("");
      const generation = ++requestGeneration.current;
      windowRequest.current?.abort();
      const controller = new AbortController();
      windowRequest.current = controller;
      const request = (url: string) =>
        fetch(url, { signal: controller.signal, cache: "no-store" });
      windowRequestPending.current = true;
      setLoadingMore(false);
      try {
        const problem = searchProblem(searchState);
        if (problem) throw new Error(problem);
        const params = new URLSearchParams(apiQuery);
        params.set("limit", String(explorerPageSize));
        if (favoritesOnly) {
          const ids = favoriteKey.split(",").filter(Boolean);
          if (!ids.length) {
            if (generation === requestGeneration.current) {
              setListings([]);
              setResultsLocationQuery(searchState.city);
              setLoadedOfferFilterKey(offerFilterKey);
              setMissingFavorites([]);
              setTotal(0);
              setNextCursor(null);
              resultWindow.current = { context: resultContext, count: 0 };
            }
            return;
          }
          const results = await Promise.all(
            ids.map(async (id) => {
              const response = await request(`/api/listings/${id}`);
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
            const data = await loadAllFavoriteOffers(searchState, ids, request);
            if (generation !== requestGeneration.current) return;
            setListings((current) => keepUnchangedListings(current, data));
            setResultsLocationQuery(searchState.city);
            setLoadedOfferFilterKey(offerFilterKey);
            setNextCursor(null);
            setTotal(data.length);
            resultWindow.current = {
              context: resultContext,
              count: data.length,
            };
            return;
          }
        } else setMissingFavorites([]);
        let count = explorerPageSize;
        if (resultWindow.current?.context === resultContext)
          count = resultWindow.current.count;
        else {
          try {
            count = restoredResultCount(
              sessionStorage.getItem(explorerContinuationKey),
              resultContext,
            );
          } catch {
            /* Search remains available when optional session storage is blocked. */
          }
        }
        const result = await loadExplorerWindow(
          params,
          count,
          request,
          () => generation === requestGeneration.current,
        );
        if (!result || generation !== requestGeneration.current) return;
        setListings((current) => keepUnchangedListings(current, result.data));
        setResultsLocationQuery(searchState.city);
        setLoadedOfferFilterKey(offerFilterKey);
        setNextCursor(result.nextCursor);
        setTotal(result.total);
        resultWindow.current = {
          context: resultContext,
          count: result.data.length,
        };
      } catch (e) {
        if (generation === requestGeneration.current)
          setError(explorerRequestError(e));
      } finally {
        if (generation === requestGeneration.current) {
          windowRequestPending.current = false;
          setLoading(false);
        }
      }
    },
    [
      apiQuery,
      searchState,
      favoritesOnly,
      favoriteKey,
      favorites.loading,
      allFavoriteOffers,
      resultContext,
      offerFilterKey,
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
    setSort(search.sort);
    setMinSpaces(search.minSpaces);
    setSellerType(search.sellerType);
    setOccupancy(search.occupancy);
    setLevel(search.level);
    setBbox(search.bbox);
    setCenter(search.center);
    setRadiusKm(search.radiusKm);
    setRadiusDraft(search.radiusKm || "5");
    setAnnualChargesMax(search.annualChargesMax || "");
    setPropertyTaxMax(search.propertyTaxMax || "");
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
    return () => {
      requestGeneration.current++;
      windowRequest.current?.abort();
      window.removeEventListener("popstate", restore);
    };
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
      const frame = requestAnimationFrame(() => {
        if (window.matchMedia(MOBILE_MAP_MEDIA_QUERY).matches) {
          if (resultsPanel.current) resultsPanel.current.scrollTop = top;
        } else window.scrollTo({ top, behavior: "instant" });
      });
      previousView.current = visibleView;
      return () => cancelAnimationFrame(frame);
    }
    previousView.current = visibleView;
  }, [visibleView, initialized]);
  useEffect(() => {
    if (!initialized) return;
    requestGeneration.current++;
    windowRequest.current?.abort();
    setLoading(true);
    setLoadingMore(false);
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
    if (
      !initialized ||
      loading ||
      error ||
      resultWindow.current?.context !== resultContext
    )
      return;
    resultWindow.current.count = listings.length;
    try {
      sessionStorage.setItem(
        explorerContinuationKey,
        encodeExplorerContinuation(resultContext, listings.length),
      );
    } catch {
      /* Depth restoration is optional; no listing payload is stored. */
    }
  }, [initialized, loading, error, resultContext, listings.length]);
  useEffect(() => {
    if (!initialized || loading || error || restoredScroll.current) return;
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
          const frame = requestAnimationFrame(() => {
            if (window.matchMedia(MOBILE_MAP_MEDIA_QUERY).matches) {
              if (panel) panel.scrollTop = saved.top;
            } else window.scrollTo({ top: saved.top, behavior: "instant" });
          });
          return () => cancelAnimationFrame(frame);
        }
      } else if (panel) {
        const savedTop = Number(
          sessionStorage.getItem("gp:explore:scroll") || 0,
        );
        resultScrollBeforeSelection.current = savedTop;
        if (!selectedId) panel.scrollTop = savedTop;
      }
    } catch {
      /* No stored position. */
    }
  }, [loading, error, initialized, visibleView]);
  async function loadMore() {
    if (!nextCursor || loadingMore || windowRequestPending.current) return;
    setLoadingMore(true);
    const generation = requestGeneration.current;
    try {
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
      if (generation === requestGeneration.current)
        setError(explorerRequestError(e));
    } finally {
      if (generation === requestGeneration.current) setLoadingMore(false);
    }
  }
  const retainResults =
    loadedOfferFilterKey === offerFilterKey && listings.length > 0;
  const showSkeleton = loading && !retainResults;
  const filtered = !error && (!loading || retainResults) ? listings : [];
  const hasFilters = hasExplorerFilters(searchState);
  const hasOptionFilters = hasExplorerFilters({
    ...searchState,
    city: "",
    bbox: "",
    center: "",
    radiusKm: "",
  });
  const selected = filtered.find((l) => l.id === selectedId) || null;
  const sidebarListings =
    visibleView === "map" && clusterListingIds.length
      ? filtered.filter((item) => clusterListingIds.includes(item.id))
      : filtered;
  const inspecting = visibleView === "map" && Boolean(selected);
  useEffect(() => {
    if (!inspecting) return;
    const panel = announcementPanel.current;
    if (panel) {
      panel.scrollTop = 0;
      panel.focus({ preventScroll: true });
    }
  }, [inspecting, selected?.id]);
  useEffect(() => {
    setClusterListingIds([]);
  }, [resultContext]);
  function closeSelection() {
    if (selectionCloseTimer.current) return;
    const finish = () => {
      selectionCloseTimer.current = null;
      setClosingSelection(false);
      setSelectedId(null);
      requestAnimationFrame(() => {
        if (resultsPanel.current) {
          if (window.matchMedia(MOBILE_MAP_MEDIA_QUERY).matches)
            resultsPanel.current.scrollTop =
              resultScrollBeforeSelection.current;
          if (window.matchMedia(MOBILE_MAP_MEDIA_QUERY).matches)
            mapViewButton.current?.focus({ preventScroll: true });
          else resultsPanel.current.focus({ preventScroll: true });
        }
      });
    };
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      finish();
      return;
    }
    setClosingSelection(true);
    selectionCloseTimer.current = setTimeout(finish, 200);
  }
  function chooseCluster(ids: string[]) {
    cancelSelectionClose();
    setSelectedId(null);
    setMore(false);
    setClusterListingIds(ids);
    requestAnimationFrame(() => {
      resultsPanel.current?.focus({ preventScroll: true });
      if (resultsPanel.current) resultsPanel.current.scrollTop = 0;
    });
  }
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
    scrollPositions.current[visibleView] = window.matchMedia(
      MOBILE_MAP_MEDIA_QUERY,
    ).matches
      ? (resultsPanel.current?.scrollTop ?? 0)
      : window.scrollY;
    const params = favoritesOnly
      ? favoritesSearchParams(searchState, allFavoriteOffers)
      : searchParams(searchState);
    params.set("display", view);
    if (selectedId) params.set("listing", selectedId);
    window.history.pushState(null, "", `${window.location.pathname}?${params}`);
    setViewPreference(view);
  }
  function choose(id: string) {
    cancelSelectionClose();
    if (!selected)
      resultScrollBeforeSelection.current =
        resultsPanel.current?.scrollTop ?? 0;
    setMore(false);
    setSelectedId(id);
    setViewPreference("map");
  }
  function rememberListPosition() {
    try {
      sessionStorage.setItem(
        "gp:explore:list-scroll",
        JSON.stringify({
          href: window.location.pathname + window.location.search,
          top: window.matchMedia(MOBILE_MAP_MEDIA_QUERY).matches
            ? (resultsPanel.current?.scrollTop ?? 0)
            : window.scrollY,
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
    <main
      id="main"
      className={`explorer explorer-view-${visibleView}${inspecting ? " explorer-has-selection" : ""}`}
    >
      <section className="search-section">
        <div className="search-heading">
          <h1 className="explorer-title">
            {favoritesOnly ? "Mes favoris" : "Parkings à vendre et à louer"}
          </h1>
          <form
            className="location-search"
            onSubmit={(e) => {
              e.preventDefault();
              applySearch(searchByLocation(searchState, query));
              setClusterListingIds([]);
              setSelectedId(null);
            }}
          >
            <MapPin size={25} />
            <input
              ref={locationInput}
              aria-label="Rechercher une ville ou un quartier"
              placeholder="Rechercher un lieu"
              maxLength={80}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
            {query ? (
              <button
                type="button"
                className="location-clear"
                aria-label="Effacer le lieu recherché"
                onClick={() => {
                  applySearch(searchByLocation(searchState, ""));
                  setSelectedId(null);
                  setClusterListingIds([]);
                  locationInput.current?.focus();
                }}
              >
                <X size={15} />
              </button>
            ) : null}
            <button className="search-submit" aria-label="Rechercher">
              <Search size={25} />
            </button>
          </form>
        </div>
        <div className="filters">
          <div className="explorer-offer-filter">
            <FilterSelect
              label="Type d’offre"
              value={allFavoriteOffers ? "all" : transactionType}
              applied={!allFavoriteOffers}
              onChange={(value) => {
                setAllFavoriteOffers(favoritesOnly && value === "all");
                if (value === "all") setCompare([]);
                if (value !== "all")
                  setTransactionType(value as "sale" | "rent");
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
          </div>
          <div className="explorer-desktop-filters">
            <FilterSelect
              label="Type de parking"
              value={type}
              onChange={setType}
              applied
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
          </div>
          <button
            ref={moreFiltersButton}
            aria-label="Filtres de recherche"
            className={`filter-chip explorer-all-filters ${more || mobileFilterCount > 0 ? "filter-applied" : ""}`}
            onClick={() => (more ? closeMoreFilters() : setMore(true))}
            onKeyDown={(event) => {
              if (event.key === "Escape" && more) {
                event.preventDefault();
                closeMoreFilters();
              }
            }}
            aria-expanded={more}
            aria-controls="explorer-more-filters"
          >
            <SlidersHorizontal size={18} />
            <span className="explorer-desktop-label">Plus de filtres</span>
            <span className="explorer-mobile-label">Filtres</span>
            {advancedCount ? (
              <span className="filter-count explorer-desktop-label">
                {advancedCount}
              </span>
            ) : null}
            {mobileFilterCount ? (
              <span className="filter-count explorer-mobile-label">
                {mobileFilterCount}
              </span>
            ) : null}
          </button>
          {hasOptionFilters ? (
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
              ref={mapViewButton}
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
          <>
            <div
              className="explorer-filter-backdrop"
              aria-hidden="true"
              onClick={closeMoreFilters}
            />
            <div
              ref={moreFiltersPanel}
              tabIndex={-1}
              role="dialog"
              aria-modal="true"
              aria-labelledby="explorer-filter-title"
              className="filter-popover explorer-filter-panel"
              id="explorer-more-filters"
              onKeyDown={(event) => {
                if (event.key === "Escape" && !event.defaultPrevented) {
                  event.preventDefault();
                  closeMoreFilters();
                }
                if (event.key !== "Tab" || event.defaultPrevented) return;
                const panel = moreFiltersPanel.current;
                if (!panel?.contains(event.target as Node)) return;
                const controls = Array.from(
                  panel.querySelectorAll<HTMLElement>(
                    'button:not([disabled]), input:not([disabled]), select:not([disabled]), summary, a[href], [tabindex="0"]',
                  ),
                ).filter((control) => control.getClientRects().length > 0);
                const first = controls[0],
                  last = controls.at(-1);
                if (
                  event.shiftKey &&
                  (document.activeElement === first ||
                    document.activeElement === panel)
                ) {
                  event.preventDefault();
                  last?.focus();
                } else if (!event.shiftKey && document.activeElement === last) {
                  event.preventDefault();
                  first?.focus();
                }
              }}
            >
              <header className="explorer-filter-header">
                <h2 id="explorer-filter-title">Tous les filtres</h2>
                <button
                  type="button"
                  className="explorer-filter-skip"
                  onClick={() => {
                    closeMoreFilters();
                    changeView("list");
                    requestAnimationFrame(() =>
                      resultsPanel.current?.focus({ preventScroll: true }),
                    );
                  }}
                >
                  Aller aux résultats
                </button>
                <button
                  type="button"
                  className="icon-button"
                  onClick={closeMoreFilters}
                  aria-label="Fermer les filtres"
                >
                  <X size={20} />
                </button>
              </header>
              <div className="explorer-filter-body">
                <div className="explorer-filter-groups">
                  <fieldset className="explorer-filter-group">
                    <legend>Type de parking</legend>
                    <FilterSelect
                      label="Type de parking"
                      variant="field"
                      value={type}
                      onChange={setType}
                      applied={Boolean(type)}
                      options={[
                        { value: "", label: "Tous les types" },
                        { value: "covered", label: "Parking couvert" },
                        { value: "box", label: "Box fermé" },
                        { value: "outdoor", label: "Extérieur" },
                        { value: "mixed", label: "Lot mixte" },
                      ]}
                    />
                  </fieldset>
                  <fieldset className="explorer-filter-group">
                    <legend>Surface par place</legend>
                    <FilterSelect
                      label="Surface minimum par place"
                      variant="field"
                      value={minArea}
                      onChange={setMinArea}
                      applied={Boolean(minArea)}
                      options={[
                        { value: "", label: "Toutes les surfaces" },
                        ...(minArea && !["12", "14", "16"].includes(minArea)
                          ? [{ value: minArea, label: `${minArea} m² minimum` }]
                          : []),
                        { value: "12", label: "12 m² minimum" },
                        { value: "14", label: "14 m² minimum" },
                        { value: "16", label: "16 m² minimum" },
                      ]}
                    />
                    <p className="explorer-filter-hint">
                      Surface inconnue exclue si un minimum est choisi.
                    </p>
                  </fieldset>
                  <fieldset className="explorer-filter-group is-wide">
                    <legend>
                      {transactionType === "rent"
                        ? "Loyer mensuel (€)"
                        : "Budget (€)"}
                    </legend>
                    <div className="explorer-filter-pair">
                      <label
                        className={`field${minPrice ? " is-applied" : ""}`}
                      >
                        <span>Minimum</span>
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
                      <label
                        className={`field${maxPrice ? " is-applied" : ""}`}
                      >
                        <span>Maximum</span>
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
                    </div>
                    <p className="explorer-filter-hint">
                      {allFavoriteOffers
                        ? "Choisissez « À vendre » ou « À louer » pour filtrer le budget."
                        : "Par place disponible, ou pour le lot proposé ensemble."}
                    </p>
                  </fieldset>
                  <AnnualCostFilters
                    annualChargesMax={annualChargesMax}
                    setAnnualChargesMax={setAnnualChargesMax}
                    propertyTaxMax={propertyTaxMax}
                    setPropertyTaxMax={setPropertyTaxMax}
                  />
                  <fieldset className="explorer-filter-group is-wide">
                    <legend>Localisation</legend>
                    <span className="explorer-filter-label">
                      Rayon depuis le centre de la carte
                    </span>
                    <div
                      className="explorer-radius-options"
                      role="group"
                      aria-label="Rayon de recherche"
                    >
                      {[
                        "1",
                        "3",
                        "5",
                        "10",
                        "20",
                        ...(radiusDraft &&
                        !["1", "3", "5", "10", "20"].includes(radiusDraft)
                          ? [radiusDraft]
                          : []),
                      ].map((radius) => (
                        <button
                          key={radius}
                          type="button"
                          aria-pressed={radiusDraft === radius}
                          onClick={() => setRadiusDraft(radius)}
                        >
                          {radius} km
                        </button>
                      ))}
                    </div>
                    <div className="explorer-geography-actions">
                      <button
                        type="button"
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
                        Appliquer le rayon
                      </button>
                      {visibleView === "list" ? (
                        <button
                          type="button"
                          className="text-button"
                          onClick={() => {
                            setMore(false);
                            changeView("map");
                          }}
                        >
                          <MapIcon size={16} /> Choisir sur la carte
                        </button>
                      ) : null}
                    </div>
                    {!mapView ? (
                      <p className="explorer-filter-hint">
                        Ouvrez la carte pour choisir son centre.
                      </p>
                    ) : null}
                    {radiusKm ? (
                      <div className="explorer-active-area" role="status">
                        <span>Rayon actif : {radiusKm} km</span>
                        <button
                          type="button"
                          className="text-button"
                          aria-label="Retirer la limite géographique"
                          onClick={() => {
                            setBbox("");
                            setCenter("");
                            setRadiusKm("");
                          }}
                        >
                          Retirer
                        </button>
                      </div>
                    ) : null}
                  </fieldset>
                  <fieldset className="explorer-filter-group">
                    <legend>Nombre de places</legend>
                    <FilterSelect
                      label="Nombre minimum de places"
                      variant="field"
                      value={minSpaces}
                      onChange={setMinSpaces}
                      applied={Boolean(minSpaces)}
                      options={[
                        { value: "", label: "Indifférent" },
                        { value: "2", label: "2 places ou plus" },
                        { value: "3", label: "3 places ou plus" },
                        { value: "5", label: "5 places ou plus" },
                        { value: "10", label: "10 places ou plus" },
                        ...(minSpaces &&
                        !["2", "3", "5", "10"].includes(minSpaces)
                          ? [
                              {
                                value: minSpaces,
                                label: `${minSpaces} places ou plus`,
                              },
                            ]
                          : []),
                      ]}
                    />
                  </fieldset>
                  <fieldset className="explorer-filter-group">
                    <legend>Annonceur</legend>
                    <FilterSelect
                      label="Type d’annonceur"
                      variant="field"
                      value={sellerType}
                      onChange={setSellerType}
                      applied={Boolean(sellerType)}
                      options={[
                        { value: "", label: "Tous les annonceurs" },
                        { value: "private", label: "Particulier" },
                        { value: "professional", label: "Professionnel" },
                      ]}
                    />
                  </fieldset>
                  <fieldset className="explorer-filter-group">
                    <legend>Occupation</legend>
                    <FilterSelect
                      label="Occupation de la place"
                      variant="field"
                      value={occupancy}
                      onChange={setOccupancy}
                      applied={Boolean(occupancy)}
                      options={[
                        { value: "", label: "Indifférente" },
                        { value: "vacant", label: "Libre" },
                        { value: "occupied", label: "Occupée" },
                      ]}
                    />
                  </fieldset>
                  <fieldset className="explorer-filter-group">
                    <legend>Niveau</legend>
                    <FilterSelect
                      label="Niveau du parking"
                      variant="field"
                      value={level}
                      onChange={setLevel}
                      applied={Boolean(level)}
                      options={[
                        { value: "", label: "Tous les niveaux" },
                        { value: "0", label: "Rez-de-chaussée" },
                        ...["-1", "-2", "-3", "-4", "1", "2"].map((value) => ({
                          value,
                          label: `Niveau ${value.replace("-", "−")}`,
                        })),
                        ...(level &&
                        !["0", "-1", "-2", "-3", "-4", "1", "2"].includes(level)
                          ? [
                              {
                                value: level,
                                label: `Niveau ${level.replace("-", "−")}`,
                              },
                            ]
                          : []),
                      ]}
                    />
                  </fieldset>
                </div>
              </div>
              <footer className="explorer-filter-actions">
                <button
                  type="button"
                  className="text-button"
                  disabled={!hasFilters}
                  onClick={reset}
                >
                  Réinitialiser
                </button>
                <button
                  type="button"
                  className="button button-primary"
                  onClick={() => {
                    closeMoreFilters();
                    requestAnimationFrame(() => {
                      const panel = resultsPanel.current;
                      if (panel && panel.getClientRects().length > 0)
                        panel.focus({ preventScroll: true });
                    });
                  }}
                >
                  {error
                    ? "Voir les résultats"
                    : loading
                      ? "Afficher les annonces"
                      : `Afficher ${total} annonce${total > 1 ? "s" : ""}`}
                </button>
              </footer>
            </div>
          </>
        ) : null}
      </section>
      <div
        className={`explore-workspace mobile-${visibleView} view-${visibleView}${inspecting || (visibleView === "map" && clusterListingIds.length) ? " is-inspecting" : ""}${inspecting ? " has-selected-listing" : ""}`}
      >
        <section
          id="resultats"
          ref={resultsPanel}
          tabIndex={-1}
          onKeyDown={(event) => {
            if (event.key === "Escape" && inspecting) {
              event.preventDefault();
              closeSelection();
            }
          }}
          className="results-panel"
          data-map-overlay={
            !inspecting && visibleView === "map" && clusterListingIds.length
              ? "listing"
              : undefined
          }
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
          {visibleView === "map" &&
          !inspecting &&
          clusterListingIds.length > 0 ? (
            <div className="explorer-sheet-heading">
              <span>Annonces à cet endroit</span>
              <button
                type="button"
                className="icon-button"
                aria-label="Fermer l’aperçu"
                onClick={() => {
                  setClusterListingIds([]);
                  closeSelection();
                }}
              >
                <X size={20} />
              </button>
            </div>
          ) : null}
          <div className="results-content">
            <div className="results-heading">
              <h2>
                {clusterListingIds.length && visibleView === "map"
                  ? "Annonces à cet endroit"
                  : favoritesOnly
                    ? "Mes favoris"
                    : "Annonces"}
              </h2>
              <div className="results-meta">
                <span aria-live="polite">
                  {loading
                    ? "Recherche…"
                    : error
                      ? "Résultats à actualiser"
                      : clusterListingIds.length && visibleView === "map"
                        ? `${sidebarListings.length} annonce${sidebarListings.length > 1 ? "s" : ""} ici · ${total} au total`
                        : `${total} annonce${total > 1 ? "s" : ""}${listings.some((l) => l.isDemo) ? " de démonstration" : ""}`}
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
                    {
                      value: "area_asc",
                      label: "Surface par place croissante",
                    },
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
            {showSkeleton ? (
              <div
                className="list-skeleton"
                aria-label="Chargement des annonces"
              >
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
                      : "Aucun favori enregistré"
                    : "Aucune annonce pour ces critères"}
                </h3>
                <p>{emptyMessage}</p>
                {emptyAction}
              </div>
            ) : null}
            {clusterListingIds.length && visibleView === "map" ? (
              <div className="cluster-summary">
                <span>
                  {sidebarListings.length} annonce
                  {sidebarListings.length > 1 ? "s" : ""} regroupée
                  {sidebarListings.length > 1 ? "s" : ""}
                </span>
                <button
                  className="text-button"
                  onClick={() => setClusterListingIds([])}
                >
                  Tout afficher
                </button>
              </div>
            ) : null}
            <div className="results-list">
              {sidebarListings.map((l, index) => (
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
                    allFavoriteOffers || visibleView !== "list"
                      ? undefined
                      : () => toggleCompare(l.id)
                  }
                />
              ))}
            </div>
            {nextCursor && !clusterListingIds.length ? (
              <button
                className="button button-secondary full-width"
                onClick={loadMore}
                disabled={loadingMore || loading}
              >
                {loadingMore ? "Chargement…" : "Afficher plus d’annonces"}
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
            {listings.some((l) => l.isDemo) ? (
              <p className="demo-note">
                Exemples fictifs. Aucun bien proposé à la vente.
              </p>
            ) : null}
          </div>
        </section>
        {inspecting && selected ? (
          <section
            ref={announcementPanel}
            className={`announcement-panel${closingSelection ? " is-closing" : ""}${expandedPreview ? " is-expanded" : ""}`}
            data-map-overlay={desktopDetail ? undefined : "listing"}
            data-map-announcement={desktopDetail ? "listing" : undefined}
            tabIndex={-1}
            aria-label="Annonce sélectionnée"
            onKeyDown={(event) => {
              if (event.key === "Escape") {
                event.preventDefault();
                closeSelection();
              }
            }}
          >
            <ListingInspector
              variant={desktopDetail ? "panel" : "sheet"}
              expanded={expandedPreview}
              onExpandedChange={setExpandedPreview}
              key={selected.id}
              listing={selected}
              favorite={favorites.ids.includes(selected.id)}
              favoriteDisabled={
                favorites.loading || favorites.pendingIds.includes(selected.id)
              }
              favoriteError={favorites.error}
              onFavorite={() => void favorites.toggle(selected.id)}
              transactionType={offerFilter}
              onClose={closeSelection}
            />
          </section>
        ) : null}
        <section
          className={`map-panel ${selected ? "has-inspector" : ""}`}
          aria-label="Carte des parkings"
        >
          {initialized && mapRequested ? (
            <CityMap
              cooperativeGestures={false}
              listings={filtered}
              visible={visibleView === "map"}
              transactionType={offerFilter}
              selectedId={selected?.id || null}
              onSelect={choose}
              initialView={mapView}
              locationQuery={city}
              resultsLoading={loading}
              resultsLocationQuery={resultsLocationQuery}
              onCameraChange={cameraChanged}
              onSearchArea={searchArea}
              onClusterSelect={chooseCluster}
            />
          ) : (
            <div className="map-loading" role="status">
              Préparation de la carte…
            </div>
          )}
        </section>
      </div>
      {compare.length > 0 && visibleView === "list" ? (
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
