"use client";
import { expandMapPrices, mapMarkerPriceLines } from "@/lib/map-marker-label";
import { withPoiIconFallback } from "@/lib/map-style";
import { isPublicShowcase } from "@/lib/public-showcase";
import { PARIS_CENTER, IDF_BOUNDS, isIdfCoordinate } from "@/lib/paris-region";

import { useEffect, useRef, useState } from "react";
import type { Map as MapLibreMap, Marker } from "maplibre-gl";
import { Compass, Layers3, MapPin, Minus, Plus, RefreshCw } from "lucide-react";
import { groupMapMarkers, mapResultBounds } from "@/lib/map-result-bounds";
import { type Listing, type TransactionType } from "@/lib/types";
import {
  normalizeMapView,
  normalizeMapSearchArea,
  selectedMapZoom,
  selectedMapOffset,
  type MapViewState,
  type MapSearchArea,
  type MapViewport,
} from "@/lib/map-view";
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
  onClusterSelect?: (ids: string[]) => void;
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
  onClusterSelect,
}: CityMapProps) {
  const container = useRef<HTMLDivElement>(null);
  const controls = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const markers = useRef<Marker[]>([]);
  const onSelectRef = useRef(onSelect);
  const onClusterSelectRef = useRef(onClusterSelect);
  onClusterSelectRef.current = onClusterSelect;
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
  const transientLocation = useRef(false);
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
  const previousSelected = useRef<string | null>(null);
  const selectionRef = useRef({ selectedId, listings });
  selectionRef.current = { selectedId, listings };
  const focusSelection = (map: MapLibreMap, duration: number) => {
    const selected = selectionRef.current.listings.find(
      (item) => item.id === selectionRef.current.selectedId,
    );
    const canvas = container.current;
    if (!selected || !canvas) return;
    const canvasRect = canvas.getBoundingClientRect();
    const controlsRect = controls.current?.getBoundingClientRect();
    const controlsTop =
      controlsRect && controlsRect.width > controlsRect.height
        ? controlsRect.top - canvasRect.top
        : undefined;
    const selectedMarker = markers.current
      .map((marker) => marker.getElement())
      .find(
        (element) =>
          element.matches(".is-selected") ||
          element.querySelector(".is-selected"),
      );
    const estimatedCount = Math.min(3, selectionRef.current.listings.length);
    const markerHeight =
      selectedMarker?.getBoundingClientRect().height ||
      (expandMapPrices(
        estimatedCount,
        selectedMapZoom(map.getZoom(), selected.locationPrecision),
      )
        ? estimatedCount * 52 - 8
        : 44);
    transientLocation.current = false;
    map.easeTo({
      center: selected.coordinates,
      zoom: selectedMapZoom(map.getZoom(), selected.locationPrecision),
      offset: selectedMapOffset(canvasRect.height, markerHeight, controlsTop),
      duration,
    });
    previousSelected.current = selected.id;
  };
  const focusSelectionRef = useRef(focusSelection);
  focusSelectionRef.current = focusSelection;
  const showcaseCentered = useRef(false);
  useEffect(() => {
    const map = mapRef.current;
    if (
      !map ||
      status !== "ready" ||
      selectedId ||
      manualMovement.current ||
      showcaseCentered.current ||
      !listings.length ||
      !listings.every((item) => isPublicShowcase(item.id))
    )
      return;
    showcaseCentered.current = true;
    map.jumpTo({ center: listings[0].coordinates, zoom: 16.5 });
  }, [listings, selectedId, status]);
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
    previousSelected.current = null;
    showcaseCentered.current = false;
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
        localMap.setStyle(
          process.env.NEXT_PUBLIC_MAP_STYLE ||
            "https://tiles.openfreemap.org/styles/liberty",
          { transformStyle: (_previous, next) => withPoiIconFallback(next) },
        );
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
    let width = container.current?.clientWidth;
    let height = container.current?.clientHeight;
    const resize = (force = false) => {
      const map = mapRef.current;
      const canvas = container.current;
      if (!map || !canvas) return;
      const changed =
        width !== canvas.clientWidth || height !== canvas.clientHeight;
      width = canvas.clientWidth;
      height = canvas.clientHeight;
      if (changed || force) {
        map.stop();
        map.resize();
        focusSelectionRef.current(map, 0);
      }
    };
    const frame = requestAnimationFrame(() => resize(true));
    const observer = new ResizeObserver(() => resize());
    if (container.current) observer.observe(container.current);
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
    };
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
      const sizes = new Map<string, { width: number; height: number }>();
      const canvasRect = container.current?.getBoundingClientRect();
      const controlsRect = controls.current?.getBoundingClientRect();
      const priceAreaHeight = canvasRect
        ? (controlsRect && controlsRect.width > controlsRect.height
            ? controlsRect.top - canvasRect.top
            : canvasRect.height) - 16
        : Infinity;
      const byId = new Map(available.map((listing) => [listing.id, listing]));
      const renderPrice = (button: HTMLButtonElement, group: Listing[]) => {
        const lines = document.createElement("span");
        lines.className = "gp-map-price-lines";
        for (const label of mapMarkerPriceLines(group, transactionType)) {
          const line = document.createElement("span");
          line.textContent = label;
          lines.appendChild(line);
        }
        button.replaceChildren(lines);
        if (group.length > 1) {
          const count = document.createElement("span");
          count.className = "gp-map-price-count";
          count.textContent = String(group.length);
          count.setAttribute("aria-hidden", "true");
          button.appendChild(count);
        }
      };
      const priceButton = (group: Listing[], interactive: boolean) => {
        const first = group[0];
        const selected = group.some((item) => item.id === selectedId);
        const button = document.createElement("button");
        button.type = "button";
        button.className = `gp-map-price${selected ? " is-selected" : ""}${group.length > 1 ? " is-cluster" : ""}`;
        renderPrice(button, group);
        const priceLabel = mapMarkerPriceLines(group, transactionType).join(
          " · ",
        );
        button.setAttribute(
          "aria-label",
          group.length > 1
            ? `${priceLabel} · Voir les ${group.length} annonces à cet endroit`
            : `${first.city}, ${first.district}, ${priceLabel}${first.locationPrecision === "area" ? ", position de secteur" : ""}`,
        );
        if (selected) button.setAttribute("aria-pressed", "true");
        if (interactive)
          button.addEventListener("click", () => {
            if (group.length > 1 && onClusterSelectRef.current) {
              onClusterSelectRef.current(group.map((item) => item.id));
              const bounds = mapResultBounds(
                group.map((item) => item.coordinates),
              );
              if (bounds)
                map.fitBounds(bounds, {
                  padding: 70,
                  maxZoom: group.some(
                    (item) => item.locationPrecision === "area",
                  )
                    ? 15
                    : 16.5,
                  duration: window.matchMedia(
                    "(prefers-reduced-motion: reduce)",
                  ).matches
                    ? 0
                    : 450,
                });
            } else onSelectRef.current(first.id);
          });
        return button;
      };
      const markerElement = (
        group: Listing[],
        interactive: boolean,
      ): HTMLElement => {
        if (!expandMapPrices(group.length, map.getZoom(), priceAreaHeight))
          return priceButton(group, interactive);
        const stack = document.createElement("div");
        stack.className = "gp-map-price-stack";
        stack.setAttribute("role", "group");
        stack.setAttribute(
          "aria-label",
          `${group.length} annonces à cet endroit`,
        );
        for (const listing of group)
          stack.appendChild(priceButton([listing], interactive));
        return stack;
      };
      const measure = (group: Listing[]) => {
        const key = group
          .map((item) => item.id)
          .sort()
          .join("|");
        const existing = sizes.get(key);
        if (existing) return existing;
        const measuring = markerElement(group, false);
        measuring.style.visibility = "hidden";
        measuring.style.pointerEvents = "none";
        container.current?.appendChild(measuring);
        const rect = measuring.getBoundingClientRect();
        measuring.remove();
        // Includes the marker tail in collision spacing, also for expanded prices.
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
            ...measure([listing]),
          };
        }),
        (_count, ids) => measure(ids.map((id) => byId.get(id)!)),
      );
      markers.current = groups.map((placement) => {
        const group = placement.ids.map((id) => byId.get(id)!);
        const coordinate =
          group.length > 1
            ? map.unproject([placement.x, placement.y])
            : group[0].coordinates;
        return new Marker({
          element: markerElement(group, true),
          anchor: "bottom",
        })
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
    map.resize();
    focusSelectionRef.current(
      map,
      window.matchMedia("(prefers-reduced-motion: reduce)").matches ? 0 : 650,
    );
  }, [selectedId, listings, status]);

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

  return (
    <section
      className="gp-city-map"
      aria-label="Carte interactive des parkings"
    >
      <div ref={container} className="gp-city-canvas" />
      <div className="gp-map-toolbar">
        <span className="gp-map-location">
          <MapPin size={16} /> {mapLabel} <span>· {is3D ? "3D" : "2D"}</span>
        </span>
        {onSearchArea ? (
          <button
            type="button"
            className="gp-map-search-area button button-secondary"
            disabled={!searchAreaReady || status !== "ready"}
            aria-label="Rechercher dans cette zone"
            title={
              searchAreaReady
                ? "Rechercher les annonces dans la zone affichée"
                : "Déplacez la carte pour choisir une nouvelle zone"
            }
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
            Rechercher ici
          </button>
        ) : null}
      </div>
      <div
        ref={controls}
        className="gp-map-controls"
        aria-label="Commandes de la carte"
      >
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
      {status === "loading" ? (
        <div className="gp-map-loading" role="status">
          <span className="gp-map-spinner" />
          Chargement de la carte…
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
