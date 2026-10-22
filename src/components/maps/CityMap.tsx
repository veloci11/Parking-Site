"use client";
import { listingPrice } from "@/lib/listing-price";
import { PARIS_CENTER, IDF_BOUNDS, isIdfCoordinate } from "@/lib/paris-region";

import { useEffect, useRef, useState } from "react";
import type { Map as MapLibreMap, Marker } from "maplibre-gl";
import {
  Compass,
  Layers3,
  MapPin,
  Minus,
  Plus,
  RefreshCw,
  LocateFixed,
  Scan,
  X,
} from "lucide-react";
import { mapResultBounds, groupMapMarkers } from "@/lib/map-result-bounds";
import { type Listing, type TransactionType } from "@/lib/types";
import {
  normalizeMapView,
  normalizeMapSearchArea,
  type MapViewState,
  type MapSearchArea,
  type MapViewport,
} from "@/lib/map-view";
import {
  approximateBrowserPosition,
  geolocationErrorMessage,
} from "@/lib/geolocation";
import "maplibre-gl/dist/maplibre-gl.css";
import "@/styles/maps.css";

export interface CityMapProps {
  initialView?: MapViewState | null;
  onCameraChange?: (view: MapViewState, meta?: { transient?: boolean }) => void;
  onViewChange?: (view: MapViewState) => void;
  onViewportChange?: (viewport: MapViewport) => void;
  onSearchArea?: (area: MapSearchArea) => void;
  listings: Listing[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  transactionType?: TransactionType;
  visible?: boolean;
  onRecenter?: () => void;
}

/** Coordinates reaching this component must already be the public projection. */
export default function CityMap({
  listings,
  selectedId,
  onSelect,
  initialView,
  onCameraChange,
  onViewChange,
  onViewportChange,
  onSearchArea,
  transactionType,
  visible = true,
  onRecenter,
}: CityMapProps) {
  const container = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const markers = useRef<Marker[]>([]);
  const [clusterIds, setClusterIds] = useState<string[]>([]);
  const clusterPanel = useRef<HTMLDivElement>(null);
  const clusterTrigger = useRef<HTMLButtonElement | null>(null);
  const clusterChoices = listings.filter((listing) =>
    clusterIds.includes(listing.id),
  );
  useEffect(() => {
    if (clusterIds.length) clusterPanel.current?.focus();
  }, [clusterIds]);
  const closeCluster = () => {
    setClusterIds([]);
    if (clusterTrigger.current?.isConnected) clusterTrigger.current.focus();
    else mapRef.current?.getCanvas().focus({ preventScroll: true });
  };
  const onSelectRef = useRef(onSelect);
  const normalizedInitialView = normalizeMapView(initialView);
  const initialViewRef = useRef(
    normalizedInitialView && isIdfCoordinate(normalizedInitialView.center)
      ? normalizedInitialView
      : null,
  );
  const cameraCallbacks = useRef({
    onCameraChange,
    onViewChange,
    onViewportChange,
    onSearchArea,
  });
  cameraCallbacks.current = {
    onCameraChange,
    onViewChange,
    onViewportChange,
    onSearchArea,
  };
  const manualMovement = useRef(false);
  const transientLocation = useRef(false),
    locationRequest = useRef(0);
  const [locating, setLocating] = useState(false),
    [locationNotice, setLocationNotice] = useState("");
  useEffect(
    () => () => {
      locationRequest.current++;
    },
    [],
  );
  const [searchAreaReady, setSearchAreaReady] = useState(false);
  const readArea = (map: MapLibreMap) => {
    const bounds = map.getBounds(),
      center = map.getCenter();
    return normalizeMapSearchArea(
      [
        bounds.getWest(),
        bounds.getSouth(),
        bounds.getEast(),
        bounds.getNorth(),
      ],
      [center.lng, center.lat],
    );
  };
  const publishCamera = (map: MapLibreMap) => {
    const center = map.getCenter();
    const view = normalizeMapView({
      center: [center.lng, center.lat],
      zoom: map.getZoom(),
      bearing: map.getBearing(),
      pitch: map.getPitch(),
    });
    if (view) {
      cameraCallbacks.current.onCameraChange?.(view, {
        transient: transientLocation.current,
      });
      if (!transientLocation.current)
        cameraCallbacks.current.onViewChange?.(view);
    }
    const area = readArea(map);
    if (area && !transientLocation.current)
      cameraCallbacks.current.onViewportChange?.({
        center: area.center,
        bounds: area.bbox,
      });
  };
  const [status, setStatus] = useState<"loading" | "ready" | "error">(
    "loading",
  );
  const [attempt, setAttempt] = useState(0);
  const [is3D, setIs3D] = useState((initialViewRef.current?.pitch ?? 55) > 0);
  const [mapLoaded, setMapLoaded] = useState(0);
  const [markerView, setMarkerView] = useState(0);
  const previousSelected = useRef<string | null>(
    initialViewRef.current ? selectedId : null,
  );
  const publicCities = [...new Set(listings.map((listing) => listing.city))];
  const mapLabel =
    publicCities.length === 1
      ? publicCities[0]
      : publicCities.length > 1
        ? "Île-de-France"
        : "Paris · Île-de-France";
  onSelectRef.current = onSelect;

  useEffect(() => {
    let disposed = false;
    let localMap: MapLibreMap | null = null;
    let timeout: ReturnType<typeof setTimeout> | undefined;
    setStatus("loading");
    async function mount() {
      try {
        const maplibre = await import("maplibre-gl");
        maplibre.setWorkerUrl(
          "/vendor/maplibre-gl-6.15.0/maplibre-gl-worker.mjs",
        );
        if (disposed || !container.current) return;
        const reducedMotion = window.matchMedia(
          "(prefers-reduced-motion: reduce)",
        ).matches;
        localMap = new maplibre.Map({
          container: container.current,
          style:
            process.env.NEXT_PUBLIC_MAP_STYLE ||
            "https://tiles.openfreemap.org/styles/liberty",
          center: initialViewRef.current?.center ?? PARIS_CENTER,
          maxBounds: [
            [IDF_BOUNDS[0], IDF_BOUNDS[1]],
            [IDF_BOUNDS[2], IDF_BOUNDS[3]],
          ],
          zoom: initialViewRef.current?.zoom ?? 14.4,
          pitch: initialViewRef.current?.pitch ?? (reducedMotion ? 35 : 55),
          bearing: initialViewRef.current?.bearing ?? -28,
          maxPitch: 70,
          minZoom: 4,
          maxZoom: 19,
          attributionControl: false,
          cooperativeGestures: true,
          locale: {
            "Map.Title": "Carte des annonces de parking",
            "Marker.Title": "Annonce de parking",
            "AttributionControl.ToggleAttribution":
              "Afficher les sources de la carte",
            "CooperativeGesturesHandler.WindowsHelpText":
              "Utilisez Ctrl et la molette pour zoomer",
            "CooperativeGesturesHandler.MacHelpText":
              "Utilisez ⌘ et la molette pour zoomer",
            "CooperativeGesturesHandler.MobileHelpText":
              "Utilisez deux doigts pour déplacer la carte",
          },
          renderWorldCopies: false,
          refreshExpiredTiles: true,
        });
        mapRef.current = localMap;
        localMap.addControl(
          new maplibre.AttributionControl({
            compact: true,
          }),
          "bottom-left",
        );
        // Do not overwrite source heights with marketplace dimensions.
        localMap.on("load", () => {
          if (disposed || !localMap) return;
          if (timeout) clearTimeout(timeout);
          const map = localMap;
          const paint = (
            id: string,
            property:
              | "background-color"
              | "fill-color"
              | "fill-outline-color"
              | "fill-extrusion-color"
              | "fill-extrusion-opacity"
              | "fill-extrusion-height"
              | "fill-extrusion-base",
            value: string | number | ["coalesce", ["get", string], number],
          ) => {
            if (map.getLayer(id)) map.setPaintProperty(id, property, value);
          };
          paint("background", "background-color", "#F0EFFA");
          paint("water", "fill-color", "#A8D6F0");
          paint("park", "fill-color", "#DCEAC8");
          paint("building", "fill-color", "#E5E1F0");
          paint("building", "fill-outline-color", "#F8F9FC");
          if (map.getLayer("building-3d")) {
            map.setLayerZoomRange("building-3d", 13, 24);
            paint("building-3d", "fill-extrusion-color", "#DAD6ED");
            paint("building-3d", "fill-extrusion-opacity", 0.94);
            paint("building-3d", "fill-extrusion-height", [
              "coalesce",
              ["get", "render_height"],
              8,
            ]);
            paint("building-3d", "fill-extrusion-base", [
              "coalesce",
              ["get", "render_min_height"],
              0,
            ]);
          }
          map.setLight({
            anchor: "viewport",
            position: [1.5, 210, 35],
            color: "#FFFFFF",
            intensity: 0.45,
          });
          publishCamera(map);
          setStatus("ready");
          setMapLoaded((value) => value + 1);
        });
        localMap.on("movestart", (event) => {
          if ("originalEvent" in event && event.originalEvent) {
            manualMovement.current = true;
            transientLocation.current = false;
          }
        });
        localMap.on("moveend", () => {
          if (disposed || !localMap) return;
          publishCamera(localMap);
          setIs3D(localMap.getPitch() > 0);
          setMarkerView((value) => value + 1);
          if (manualMovement.current) {
            setSearchAreaReady(true);
            manualMovement.current = false;
          }
        });
        localMap.on("resize", () => {
          if (!disposed) setMarkerView((value) => value + 1);
        });
        localMap.on("webglcontextlost", () => {
          if (!disposed) setStatus("error");
        });
        localMap.on("error", (event) => {
          // A single missing tile need not hide an otherwise usable map.
          if (
            localMap &&
            !localMap.isStyleLoaded() &&
            /style|fetch|network|Failed/i.test(event.error?.message || "")
          ) {
            setStatus("error");
          }
        });
        timeout = setTimeout(() => {
          if (!disposed && localMap && !localMap.loaded()) setStatus("error");
        }, 15000);
      } catch {
        if (!disposed) setStatus("error");
      }
    }
    void mount();
    return () => {
      disposed = true;
      if (timeout) clearTimeout(timeout);
      markers.current.forEach((marker) => marker.remove());
      markers.current = [];
      localMap?.remove();
      mapRef.current = null;
    };
  }, [attempt]);

  useEffect(() => {
    if (!visible || status !== "ready") return;
    const frame = requestAnimationFrame(() => mapRef.current?.resize());
    return () => cancelAnimationFrame(frame);
  }, [visible, status]);

  useEffect(() => {
    const map = mapRef.current;
    if (!selectedId) previousSelected.current = null;
    if (!map || status !== "ready") return;
    let disposed = false;
    void import("maplibre-gl").then(({ Marker }) => {
      if (disposed) return;
      markers.current.forEach((marker) => marker.remove());
      const available = listings
        .slice(0, 500)
        .filter(
          (listing) =>
            listing.coordinates.length === 2 &&
            listing.coordinates.every(Number.isFinite) &&
            isIdfCoordinate(listing.coordinates),
        );
      const measuring = document.createElement("button");
      measuring.style.cssText =
        "position:absolute;visibility:hidden;pointer-events:none;";
      container.current?.appendChild(measuring);
      const sizes = new Map<string, { width: number; height: number }>();
      const measure = (label: string, cluster = false) => {
        const key = `${cluster}:${label}`;
        const existing = sizes.get(key);
        if (existing) return existing;
        measuring.className = `gp-map-price${cluster ? " is-cluster" : ""}`;
        measuring.textContent = label;
        const rect = measuring.getBoundingClientRect();
        // Includes the selected border and marker tail in collision spacing.
        const size = {
          width: Math.max(44, rect.width) + 4,
          height: Math.max(44, rect.height) + 8,
        };
        sizes.set(key, size);
        return size;
      };
      const groups = groupMapMarkers(
        available.map((listing) => {
          const point = map.project(listing.coordinates);
          return {
            id: listing.id,
            x: point.x,
            y: point.y,
            ...measure(listingPrice(listing, transactionType)),
          };
        }),
        (count) => measure(`${count} annonces`, true),
      );
      measuring.remove();
      markers.current = groups.map((placement) => {
        const group = placement.ids.map((id) =>
          available.find((listing) => listing.id === id)!,
        );
        const first = group[0];
        const selected = group.some((item) => item.id === selectedId);
        const button = document.createElement("button");
        button.type = "button";
        button.className = `gp-map-price${selected ? " is-selected" : ""}${group.length > 1 ? " is-cluster" : ""}`;
        button.textContent =
          group.length > 1
            ? `${group.length} annonces`
            : listingPrice(first, transactionType);
        button.setAttribute(
          "aria-label",
          group.length > 1
            ? `Choisir parmi ${group.length} annonces proches`
            : `${first.city}, ${first.district}, ${listingPrice(first, transactionType)}${first.locationPrecision === "area" ? ", position de secteur" : ""}`,
        );
        if (selected) button.setAttribute("aria-pressed", "true");
        button.addEventListener("click", () => {
          if (group.length > 1) {
            clusterTrigger.current = button;
            setClusterIds(group.map((item) => item.id));
          } else onSelectRef.current(first.id);
        });
        const coordinate =
          group.length > 1
            ? map.unproject([placement.x, placement.y])
            : first.coordinates;
        return new Marker({ element: button, anchor: "bottom" })
          .setLngLat(coordinate)
          .addTo(map);
      });
    });
    return () => {
      disposed = true;
    };
  }, [listings, selectedId, status, mapLoaded, markerView, transactionType]);

  useEffect(() => {
    const map = mapRef.current;
    if (
      !map ||
      status !== "ready" ||
      !selectedId ||
      previousSelected.current === selectedId
    )
      return;
    const selected = listings.find((item) => item.id === selectedId);
    if (selected) {
      transientLocation.current = false;
      setLocationNotice("");
      map.easeTo({
        center: selected.coordinates,
        duration: window.matchMedia("(prefers-reduced-motion: reduce)").matches
          ? 0
          : 650,
      });
      previousSelected.current = selectedId;
    }
  }, [selectedId, listings, status]);

  const locate = () => {
    if (!navigator.geolocation) {
      setLocationNotice(
        "La localisation n’est pas disponible sur ce navigateur.",
      );
      return;
    }
    const requestId = ++locationRequest.current;
    setLocating(true);
    setLocationNotice(
      "Votre navigateur peut vous demander l’autorisation de vous localiser.",
    );
    navigator.geolocation.getCurrentPosition(
      (position) => {
        if (requestId !== locationRequest.current || !mapRef.current) return;
        setLocating(false);
        const center = approximateBrowserPosition(
          position.coords.longitude,
          position.coords.latitude,
        );
        if (!center) {
          setLocationNotice(geolocationErrorMessage(2));
          return;
        }
        transientLocation.current = true;
        manualMovement.current = true;
        mapRef.current.easeTo({
          center,
          zoom: Math.max(mapRef.current.getZoom(), 14),
          duration: window.matchMedia("(prefers-reduced-motion: reduce)")
            .matches
            ? 0
            : 600,
        });
        setSearchAreaReady(true);
        setLocationNotice(
          "Position approximative utilisée pour cette carte. Cliquez sur « Rechercher dans cette zone » pour chercher des annonces ici.",
        );
      },
      (error) => {
        if (requestId !== locationRequest.current) return;
        setLocating(false);
        setLocationNotice(geolocationErrorMessage(error.code));
      },
      { enableHighAccuracy: false, timeout: 10000, maximumAge: 60000 },
    );
  };

  const toggleDimension = () => {
    const next = !is3D;
    setIs3D(next);
    mapRef.current?.easeTo({
      pitch: next ? 55 : 0,
      bearing: next ? -28 : 0,
      duration: window.matchMedia("(prefers-reduced-motion: reduce)").matches
        ? 0
        : 500,
    });
  };
  const resultBounds = mapResultBounds(
    listings.slice(0, 500).map((listing) => listing.coordinates),
  );
  const fitResults = () => {
    const map = mapRef.current;
    if (!map || !resultBounds) return;
    transientLocation.current = false;
    manualMovement.current = false;
    setSearchAreaReady(false);
    setLocationNotice("");
    setClusterIds([]);
    onRecenter?.();
    const camera = map.cameraForBounds(resultBounds, {
      padding: { top: 180, bottom: 180, left: 115, right: 115 },
      bearing: map.getBearing(),
      maxZoom: 15,
    });
    if (!camera) return;
    map.easeTo({
      ...camera,
      // cameraForBounds fits the ground plane; allow room for pitched near edges.
      zoom: Math.max(
        map.getMinZoom(),
        (camera.zoom ?? map.getZoom()) - (map.getPitch() > 0 ? 0.3 : 0),
      ),
      duration: window.matchMedia("(prefers-reduced-motion: reduce)").matches
        ? 0
        : 500,
    });
  };

  return (
    <section
      className="gp-city-map"
      aria-label="Carte interactive des parkings"
    >
      <div ref={container} className="gp-city-canvas" />
      {clusterChoices.length > 0 ? (
        <div
          className="gp-map-cluster-choices"
          ref={clusterPanel}
          tabIndex={-1}
          role="region"
          aria-label="Annonces à cet endroit"
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              event.stopPropagation();
              closeCluster();
            }
          }}
        >
          <div className="section-row">
            <strong>{clusterChoices.length} annonces ici</strong>
            <button
              type="button"
              className="icon-button"
              aria-label="Fermer le choix d’annonces"
              onClick={closeCluster}
            >
              <X size={18} />
            </button>
          </div>
          {clusterChoices.map((listing) => (
            <button
              type="button"
              className="gp-map-cluster-item"
              key={listing.id}
              onClick={() => {
                setClusterIds([]);
                onSelectRef.current(listing.id);
              }}
            >
              <span>{listing.title}</span>
              <strong>{listingPrice(listing, transactionType)}</strong>
            </button>
          ))}
        </div>
      ) : null}
      <div className="gp-map-topline">
        <span className="gp-map-location">
          <MapPin size={16} /> {mapLabel}{" "}
          <span>· vue {is3D ? "3D" : "2D"}</span>
        </span>
      </div>
      <div className="gp-map-position-actions">
        <button
          type="button"
          className="gp-map-geolocate"
          onClick={locate}
          disabled={locating || status !== "ready"}
          title="Localisation facultative, utilisée uniquement après ce clic pour centrer la carte"
        >
          <LocateFixed size={18} />
          {locating ? "Localisation…" : "Me localiser"}
        </button>
        {resultBounds ? (
          <button
            type="button"
            className="gp-map-geolocate"
            onClick={fitResults}
            disabled={status !== "ready"}
            title="Centrer sur les annonces affichées, sans modifier les filtres"
          >
            <Scan size={18} />
            Voir les annonces
          </button>
        ) : null}
      </div>
      {locationNotice ? (
        <p className="gp-map-geo-status" role="status">
          {locationNotice}
        </p>
      ) : null}
      {onSearchArea && searchAreaReady && status === "ready" ? (
        <button
          type="button"
          className="gp-map-search-area button button-primary"
          onClick={() => {
            const map = mapRef.current;
            if (!map) return;
            const area = readArea(map);
            if (area) {
              cameraCallbacks.current.onSearchArea?.(area);
              setSearchAreaReady(false);
            }
          }}
        >
          Rechercher dans cette zone
        </button>
      ) : null}
      <div className="gp-map-controls" aria-label="Commandes de la carte">
        <button
          type="button"
          onClick={() => {
            manualMovement.current = true;
            transientLocation.current = false;
            mapRef.current?.zoomIn({ duration: 200 });
          }}
          disabled={status !== "ready"}
          aria-label="Agrandir la carte"
        >
          <Plus size={20} />
        </button>
        <button
          type="button"
          onClick={() => {
            manualMovement.current = true;
            transientLocation.current = false;
            mapRef.current?.zoomOut({ duration: 200 });
          }}
          disabled={status !== "ready"}
          aria-label="Réduire la carte"
        >
          <Minus size={20} />
        </button>
        <button
          type="button"
          onClick={() => mapRef.current?.resetNorth({ duration: 300 })}
          disabled={status !== "ready"}
          aria-label="Orienter la carte au nord"
        >
          <Compass size={20} />
        </button>
        <button
          type="button"
          onClick={toggleDimension}
          disabled={status !== "ready"}
          aria-label={
            is3D ? "Passer à la carte en 2D" : "Passer à la carte en 3D"
          }
          aria-pressed={is3D}
        >
          <Layers3 size={20} />
          <span>{is3D ? "3D" : "2D"}</span>
        </button>
      </div>
      <div className="gp-map-note">
        Positions de secteur pour les annonces à adresse masquée.
      </div>
      {status === "loading" ? (
        <div className="gp-map-loading" role="status">
          <span className="gp-map-spinner" />
          La ville prend forme…
        </div>
      ) : null}
      {status === "error" ? (
        <div className="gp-map-unavailable" role="status">
          <MapPin size={32} />
          <h3>La carte est indisponible</h3>
          <p>
            Les annonces, photos et fiches restent accessibles dans la liste.
          </p>
          <button
            type="button"
            className="button button-secondary"
            onClick={() => setAttempt((value) => value + 1)}
          >
            <RefreshCw size={16} /> Réessayer la carte
          </button>
        </div>
      ) : null}
    </section>
  );
}
