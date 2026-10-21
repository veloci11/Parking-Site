"use client";

import { useEffect, useRef, useState } from "react";
import type { Map as MapLibreMap, Marker } from "maplibre-gl";
import { Compass, Layers3, MapPin, Minus, Plus, RefreshCw } from "lucide-react";
import { money, type Listing } from "@/lib/types";
import "maplibre-gl/dist/maplibre-gl.css";
import "@/styles/maps.css";

interface CityMapProps {
  listings: Listing[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}

/** Coordinates reaching this component must already be the public projection. */
export default function CityMap({
  listings,
  selectedId,
  onSelect,
}: CityMapProps) {
  const container = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const markers = useRef<Marker[]>([]);
  const onSelectRef = useRef(onSelect);
  const [status, setStatus] = useState<"loading" | "ready" | "error">(
    "loading",
  );
  const [attempt, setAttempt] = useState(0);
  const [is3D, setIs3D] = useState(true);
  const [mapLoaded, setMapLoaded] = useState(0);
  const [zoom, setZoom] = useState(14.4);
  const previousSelected = useRef<string | null>(null);
  const publicCities = [...new Set(listings.map((listing) => listing.city))];
  const mapLabel =
    publicCities.length === 1
      ? publicCities[0]
      : publicCities.length > 1
        ? "France"
        : "Explorer";
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
          center: [4.8596, 45.7538],
          zoom: 14.4,
          pitch: reducedMotion ? 35 : 55,
          bearing: -28,
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
            customAttribution:
              "Données © OpenStreetMap · © OpenMapTiles · OpenFreeMap",
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
          setStatus("ready");
          setMapLoaded((value) => value + 1);
        });
        localMap.on("zoomend", () => {
          if (!disposed && localMap) setZoom(localMap.getZoom());
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
    const map = mapRef.current;
    if (!map || status !== "ready") return;
    let disposed = false;
    void import("maplibre-gl").then(({ Marker }) => {
      if (disposed) return;
      markers.current.forEach((marker) => marker.remove());
      const groups = new Map<string, Listing[]>();
      // Coarse buckets keep low-zoom views legible. The API limits responses to 500 points.
      listings.slice(0, 500).forEach((listing) => {
        const [lng, lat] = listing.coordinates;
        if (
          !Number.isFinite(lng) ||
          !Number.isFinite(lat) ||
          Math.abs(lng) > 180 ||
          Math.abs(lat) > 90
        )
          return;
        const precision = zoom < 11 ? 1 : zoom < 13 ? 2 : 5;
        const key = `${lng.toFixed(precision)}:${lat.toFixed(precision)}`;
        groups.set(key, [...(groups.get(key) || []), listing]);
      });
      markers.current = [...groups.values()].map((group) => {
        const first = group[0];
        const selected = group.some((item) => item.id === selectedId);
        const button = document.createElement("button");
        button.type = "button";
        button.className = `gp-map-price${selected ? " is-selected" : ""}${group.length > 1 ? " is-cluster" : ""}`;
        button.textContent =
          group.length > 1
            ? `${group.length} annonces · dès ${money(Math.min(...group.map((item) => item.priceCents)))}`
            : money(first.priceCents);
        button.setAttribute(
          "aria-label",
          group.length > 1
            ? `Agrandir le groupe de ${group.length} annonces`
            : `${first.city}, ${first.district}, ${money(first.priceCents)}${first.locationPrecision === "area" ? ", position de secteur" : ""}`,
        );
        if (selected) button.setAttribute("aria-pressed", "true");
        button.addEventListener("click", () => {
          if (group.length > 1) {
            const lngs = group.map((item) => item.coordinates[0]),
              lats = group.map((item) => item.coordinates[1]);
            map.fitBounds(
              [
                [Math.min(...lngs), Math.min(...lats)],
                [Math.max(...lngs), Math.max(...lats)],
              ],
              {
                padding: 120,
                maxZoom: 16,
                duration: window.matchMedia("(prefers-reduced-motion: reduce)")
                  .matches
                  ? 0
                  : 500,
              },
            );
          } else onSelectRef.current(first.id);
        });
        const coordinate: [number, number] =
          group.length > 1
            ? [
                group.reduce((sum, item) => sum + item.coordinates[0], 0) /
                  group.length,
                group.reduce((sum, item) => sum + item.coordinates[1], 0) /
                  group.length,
              ]
            : first.coordinates;
        return new Marker({ element: button, anchor: "bottom" })
          .setLngLat(coordinate)
          .addTo(map);
      });
    });
    return () => {
      disposed = true;
    };
  }, [listings, selectedId, status, mapLoaded, zoom]);

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
      map.easeTo({
        center: selected.coordinates,
        duration: window.matchMedia("(prefers-reduced-motion: reduce)").matches
          ? 0
          : 650,
      });
      previousSelected.current = selectedId;
    }
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
      <div className="gp-map-topline">
        <span className="gp-map-location">
          <MapPin size={16} /> {mapLabel}{" "}
          <span>· vue {is3D ? "3D" : "2D"}</span>
        </span>
      </div>
      <div className="gp-map-controls" aria-label="Commandes de la carte">
        <button
          type="button"
          onClick={() => mapRef.current?.zoomIn({ duration: 200 })}
          disabled={status !== "ready"}
          aria-label="Agrandir la carte"
        >
          <Plus size={20} />
        </button>
        <button
          type="button"
          onClick={() => mapRef.current?.zoomOut({ duration: 200 })}
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
