"use client";

import {
  Component,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import dynamic from "next/dynamic";
import PreparedPhotos from "../PreparedPhotos";
import {
  Box,
  ChevronLeft,
  ChevronRight,
  ImageIcon,
  Layers3,
  MapPin,
  Maximize,
  Minimize,
  MousePointer2,
} from "lucide-react";
import { areaLabel, type Listing, type Space } from "@/lib/types";
import { parsePublicScene, type PublicScene } from "@/lib/scene-contract";
import type {
  PublicParkingLevelPlan,
  PublicParkingSceneGroup,
} from "@/lib/parking-registry";
import {
  readInteriorSelection,
  writeInteriorSelection,
} from "@/lib/interior-view";
import ParkingPlan2D from "./ParkingPlan2D";
import type { DisplaySpace } from "./ParkingScene";
import RenderedParkingLevel from "./RenderedParkingLevel";
import ParkingLevelStack from "./ParkingLevelStack";
import { parkingNumbersSummary } from "@/lib/parking-level-overview";
import {
  parkingListingGroups,
  parkingSpaceLocation,
  parkingUnitOnLevel,
  preferredParkingLotUnit,
} from "@/lib/parking-lots";
import { listingPrice } from "@/lib/listing-price";
import "@/styles/maps.css";

const MeasuredParkingCanvas = dynamic(() => import("./MeasuredParkingCanvas"), {
  ssr: false,
  loading: () => (
    <div className="gp-map-loading" role="status">
      Chargement du plan…
    </div>
  ),
});
const CityMap = dynamic(() => import("./CityMap"), {
  ssr: false,
  loading: () => (
    <div className="gp-map-loading" role="status">
      Chargement de la carte…
    </div>
  ),
});

export interface ParkingViewerProps {
  listing: Listing;
  onSpaceSelect?: (id: string) => void;
  viewLevel?: number;
  onViewLevelChange?: (level: number) => void;
  selectedSpaceId?: string | null;
  /** Only listings explicitly linked to the same canonical parking belong here. */
  group?: PublicParkingSceneGroup | null;
  onListingSelect?: (listingId: string, listingUnitId: string) => void;
}

type Mode = "3d" | "plan" | "photo" | "map";
type Scene = PublicScene | PublicParkingLevelPlan;
type UnitReference = {
  id: string;
  listingId: string;
  listingUnitId: string;
  space: Space;
};

class SceneBoundary extends Component<
  { children: ReactNode; fallback: ReactNode },
  { failed: boolean }
> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}

function floorLabel(level: number) {
  return level === 0 ? "RDC" : String(level).replace("-", "−");
}

function LevelSwitch({
  levels,
  current,
  onChange,
}: {
  levels: { level: number; label: string }[];
  current: number;
  onChange: (level: number) => void;
}) {
  if (!levels.length) return null;
  return (
    <div
      className="gp-level-switch"
      role="group"
      aria-label="Choisir le niveau du parking"
    >
      <Layers3 size={16} aria-hidden="true" />
      <span>Niveau</span>
      <div className="gp-level-segments">
        {levels.map(({ level, label }) => (
          <button
            type="button"
            key={level}
            className={level === current ? "is-active" : ""}
            aria-pressed={level === current}
            title={label}
            onClick={() => onChange(level)}
          >
            {floorLabel(level)}
          </button>
        ))}
      </div>
    </div>
  );
}

function Photos({
  listing,
  selectedId,
}: {
  listing: Listing;
  selectedId: string | null;
}) {
  const [index, setIndex] = useState(0);
  const photos =
    selectedId && listing.spacePhotos?.[selectedId]?.length
      ? listing.spacePhotos[selectedId]
      : listing.photos;
  useEffect(() => setIndex(0), [listing.id, selectedId]);
  const current = photos[Math.min(index, photos.length - 1)];
  return (
    <div className="gp-viewer-photo">
      {current ? (
        <PreparedPhotos
          key={`${listing.id}:${selectedId || "general"}`}
          photos={photos}
          index={Math.min(index, photos.length - 1)}
          alt={`Parking à ${listing.city}, ${listing.district} · photo ${Math.min(index, photos.length - 1) + 1}`}
          width={1200}
          height={800}
          sizes="(max-width:767px) calc(100vw - 48px), (max-width:1200px) 80vw, 960px"
        />
      ) : (
        <div className="gp-viewer-empty">
          <ImageIcon size={32} />
          <strong>Photos à venir</strong>
          <p>Les photos de ce niveau ne sont pas encore disponibles.</p>
        </div>
      )}
      {listing.isDemo && current ? (
        <span>Illustration · parking de démonstration</span>
      ) : null}
      {photos.length > 1 ? (
        <div className="gp-viewer-photo-controls">
          <button
            type="button"
            aria-label="Photo précédente"
            onClick={() =>
              setIndex((value) => (value + photos.length - 1) % photos.length)
            }
          >
            <ChevronLeft size={18} />
          </button>
          <span>
            {index + 1} / {photos.length}
          </span>
          <button
            type="button"
            aria-label="Photo suivante"
            onClick={() => setIndex((value) => (value + 1) % photos.length)}
          >
            <ChevronRight size={18} />
          </button>
        </div>
      ) : null}
    </div>
  );
}

/** A fictional cutaway is available only for the explicitly marked demonstration. */
function demoSlots(units: UnitReference[]): DisplaySpace[] {
  const slots: DisplaySpace[] = [];
  const assigned = [2, 3, 6, 1, 5, 0, 4, 7];
  const numbers = new Set(units.map(({ space }) => space.number));
  const ordered = [...units].sort((a, b) =>
    a.space.number.localeCompare(b.space.number, "fr", { numeric: true }),
  );
  let contextNumber = 10;
  for (let index = 0; index < 8; index++) {
    const unitIndex = assigned.indexOf(index);
    const unit = unitIndex >= 0 ? ordered[unitIndex] : undefined;
    while (numbers.has(String(contextNumber))) contextNumber++;
    slots.push({
      id: unit?.id ?? `context-${index}`,
      number: unit?.space.number || String(contextNumber++),
      x: -8.9 + (index % 4) * 3.55,
      z: index < 4 ? -5.7 : 5.7,
      width: 3.28,
      length: 5.7,
      available: Boolean(unit),
      areaM2: unit?.space.areaM2,
    });
  }
  return slots;
}

function DemoPlan2D({
  spaces,
  selected,
  onSelect,
}: {
  spaces: DisplaySpace[];
  selected: string | null;
  onSelect: (id: string) => void;
}) {
  return (
    <figure className="gp-plan2d">
      <svg
        viewBox="-12 -10 24 20"
        role="group"
        aria-label="Plan 2D fictif du parking de démonstration"
      >
        <rect
          x={-11.5}
          y={-9.5}
          width={23}
          height={19}
          fill="#DEDAD2"
          stroke="#9E9890"
          strokeWidth={0.12}
        />
        {spaces.map((space) => (
          <g
            key={space.id}
            className={space.available ? "gp-plan2d-space" : undefined}
            role={space.available ? "button" : undefined}
            tabIndex={space.available ? 0 : undefined}
            aria-label={space.available ? `Place ${space.number}` : undefined}
            aria-pressed={space.available ? selected === space.id : undefined}
            onClick={space.available ? () => onSelect(space.id) : undefined}
            onKeyDown={
              space.available
                ? (event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      onSelect(space.id);
                    }
                  }
                : undefined
            }
          >
            <rect
              x={space.x - space.width / 2}
              y={space.z - space.length / 2}
              width={space.width}
              height={space.length}
              fill={
                selected === space.id
                  ? "#E5CD86"
                  : space.available
                    ? "#EEE3CA"
                    : "none"
              }
              stroke={
                selected === space.id
                  ? "#6D28FF"
                  : space.available
                    ? "#C9A558"
                    : "#FFFFFF"
              }
              strokeWidth={selected === space.id ? 0.13 : 0.09}
            />
            <text
              x={space.x}
              y={space.z + 1.8}
              fill={space.available ? "#6A4A16" : "#77716A"}
              fontSize={0.7}
              fontWeight="650"
              textAnchor="middle"
            >
              {space.number}
            </text>
          </g>
        ))}
        <rect
          x={7.2}
          y={-9.2}
          width={3.5}
          height={16}
          fill="#B9B4AC"
          stroke="#AAA59C"
          strokeWidth={0.12}
        />
        <text
          x={8.95}
          y={-0.8}
          fill="#69625B"
          fontSize={0.58}
          textAnchor="middle"
          transform="rotate(90 8.95 -.8)"
        >
          Rampe
        </text>
        {[-10.1, -4.45, 1.55, 5.65].flatMap((x) =>
          [-2.15, 2.15].map((z) => (
            <rect
              key={`${x}:${z}`}
              x={x - 0.27}
              y={z - 0.27}
              width={0.54}
              height={0.54}
              fill="#928B80"
            />
          )),
        )}
      </svg>
      <figcaption>
        Organisation fictive, identique à la vue 3D de démonstration. Plan
        indicatif, non coté.
      </figcaption>
    </figure>
  );
}

function PublicPlan({
  scene,
  units,
  selected,
  onSelect,
  demo,
}: {
  scene: Scene | null;
  units: UnitReference[];
  selected: string | null;
  onSelect: (id: string) => void;
  demo?: DisplaySpace[];
}) {
  return (
    <div className="gp-semantic-plan">
      {demo ? (
        <DemoPlan2D spaces={demo} selected={selected} onSelect={onSelect} />
      ) : scene ? (
        <ParkingPlan2D
          manifest={scene.manifest}
          selectedId={selected || ""}
          onSelect={onSelect}
        />
      ) : (
        <div className="gp-semantic-header">
          <Layers3 size={22} />
          <h3>Places de ce niveau</h3>
        </div>
      )}
      {!scene && !demo ? (
        <p>
          Consultez chaque place et ses dimensions. Le plan de ce niveau n’est
          pas encore disponible.
        </p>
      ) : null}
      <div className="gp-semantic-spaces">
        {units.map(({ id, space }) => (
          <button
            type="button"
            key={id}
            className={`gp-semantic-space${selected === id ? " is-selected" : ""}`}
            aria-pressed={selected === id}
            onClick={() => onSelect(id)}
          >
            <strong>Place {space.number || "non numérotée"}</strong>
            <span>{areaLabel([space])}</span>
            {space.lengthM && space.widthM ? (
              <small>
                {space.lengthM} × {space.widthM} m
              </small>
            ) : null}
          </button>
        ))}
      </div>
      {!units.length ? (
        <p>Aucune place proposée à ce niveau pour le moment.</p>
      ) : null}
    </div>
  );
}

export default function ParkingViewer(props: ParkingViewerProps) {
  const { listing, group } = props;
  const units = useMemo<UnitReference[]>(
    () =>
      group
        ? group.levels.flatMap((floor) => floor.spaces)
        : listing.spaces.map((space) => ({
            id: space.id,
            listingId: listing.id,
            listingUnitId: space.id,
            space,
          })),
    [group, listing.id, listing.spaces],
  );
  const levels = useMemo(
    () =>
      group
        ? group.levels
            .map(({ level, label }) => ({ level, label }))
            .sort((a, b) => b.level - a.level)
        : [
            ...new Set(
              listing.spaces
                .filter((space) => space.levelKnown !== false)
                .map(({ level }) => level),
            ),
          ]
            .sort((a, b) => b - a)
            .map((level) => ({ level, label: `Niveau ${floorLabel(level)}` })),
    [group, listing.spaces],
  );
  const selectionListing = useMemo(
    () => ({
      ...listing,
      spaces: units.map(({ id, space }) => ({ ...space, id })),
    }),
    [listing, units],
  );
  const defaultLevel =
    props.viewLevel ??
    units.find((unit) => unit.listingId === listing.id)?.space.level ??
    levels[0]?.level ??
    -1;
  const [level, setLevel] = useState(defaultLevel);
  const [selected, setSelected] = useState<string | null>(null);
  const [stackOverview, setStackOverview] = useState(true);
  const [mode, setMode] = useState<Mode>("3d");
  const [expanded, setExpanded] = useState(false);
  const viewerRoot = useRef<HTMLElement>(null);
  const expandButton = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!expanded) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    viewerRoot.current?.focus({ preventScroll: true });
    return () => {
      document.body.style.overflow = previousOverflow;
      expandButton.current?.focus({ preventScroll: true });
    };
  }, [expanded]);
  const [mapRequested, setMapRequested] = useState(false);
  const [individualScene, setIndividualScene] = useState<PublicScene | null>(
    null,
  );
  const [loadingScene, setLoadingScene] = useState(false);
  const [supported, setSupported] = useState<boolean | null>(null);
  const levelLayer = useRef<HTMLDivElement>(null);
  const firstLookup = useRef(true);
  const contextId = group?.parkingId || listing.id;
  const lots = useMemo(
    () => parkingListingGroups(group ?? { listings: [listing] }),
    [group, listing],
  );
  const currentLevel = group?.levels.find((floor) => floor.level === level);
  const scene: Scene | null = group
    ? (currentLevel?.scene ?? null)
    : individualScene?.manifest.level === level
      ? individualScene
      : null;
  const levelUnits = units.filter((unit) => unit.space.level === level);
  const selectedReference = units.find((unit) => unit.id === selected);
  const selectedLot = lots.find(
    (lot) =>
      lot.listing.id === selectedReference?.listingId &&
      lot.spaces.some((space) => space.id === selectedReference.listingUnitId),
  );
  const photoListing =
    group?.listings.find((item) => item.id === selectedReference?.listingId) ||
    listing;
  const demoAllowed =
    listing.isDemo &&
    listing.spaces.every((space) => space.levelKnown !== false) &&
    listing.sceneAvailable &&
    listing.locationPrecision === "exact_opt_in" &&
    (!group || group.listings.every((item) => item.isDemo));
  const hasModel =
    levelUnits.length > 0 &&
    levelUnits.every((unit) => unit.space.levelKnown !== false) &&
    (Boolean(scene) || (demoAllowed && levelUnits.length <= 8));
  const effectiveMode =
    mode === "3d" && !hasModel && !loadingScene ? "photo" : mode;
  const showLevelNavigation =
    levels.length > 1 && (effectiveMode === "3d" || effectiveMode === "plan");
  const showStack =
    levels.length > 1 && effectiveMode === "3d" && stackOverview;

  useEffect(() => setStackOverview(true), [contextId]);
  const slots = useMemo(() => demoSlots(levelUnits), [levelUnits]);
  const sceneTooLarge = Boolean(
    scene &&
    scene.manifest.spaces.length + scene.manifest.obstacles.length > 180,
  );

  const persistSelection = (nextLevel: number, unit: string | null) => {
    setLevel(nextLevel);
    setSelected(unit);
    const params = writeInteriorSelection(
      window.location.search,
      selectionListing,
      nextLevel,
      unit,
    );
    params.set("parking", contextId);
    window.history.replaceState(
      window.history.state,
      "",
      `${window.location.pathname}?${params}${window.location.hash}`,
    );
    try {
      sessionStorage.setItem(
        `gp:interior-selection:v1:${contextId}`,
        params.toString(),
      );
      if (window.location.pathname === "/")
        sessionStorage.setItem(
          "gp:explore:href",
          `${window.location.pathname}?${params}`,
        );
    } catch {}
  };
  const chooseUnit = (id: string) => {
    const reference = units.find((unit) => unit.id === id);
    if (!reference) return;
    setStackOverview(false);
    if (id === selected && reference.space.level === level) return;
    firstLookup.current = false;
    persistSelection(reference.space.level, id);
    props.onViewLevelChange?.(reference.space.level);
    if (reference.listingId === listing.id)
      props.onSpaceSelect?.(reference.listingUnitId);
    props.onListingSelect?.(reference.listingId, reference.listingUnitId);
  };
  const chooseLevel = (next: number) => {
    setStackOverview(false);
    if (next === level) return;
    firstLookup.current = false;
    const nextUnit = parkingUnitOnLevel(units, next, selectedLot, listing.id);
    persistSelection(next, nextUnit?.id ?? null);
    props.onViewLevelChange?.(next);
    if (nextUnit) {
      if (nextUnit.listingId === listing.id)
        props.onSpaceSelect?.(nextUnit.listingUnitId);
      props.onListingSelect?.(nextUnit.listingId, nextUnit.listingUnitId);
    }
  };
  const chooseLot = (lotKey: string) => {
    const lot = lots.find((item) => item.key === lotKey);
    if (!lot) return;
    const reference = preferredParkingLotUnit(lot, units, level);
    if (!reference) return;
    setStackOverview(false);
    persistSelection(reference.space.level, reference.id);
    props.onViewLevelChange?.(reference.space.level);
    if (reference.listingId === listing.id)
      props.onSpaceSelect?.(reference.listingUnitId);
    props.onListingSelect?.(reference.listingId, reference.listingUnitId);
  };

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const animation = levelLayer.current?.animate(
      [
        { opacity: 0.2, transform: "translateY(18px)" },
        { opacity: 1, transform: "translateY(0)" },
      ],
      { duration: 380, easing: "cubic-bezier(.2,.65,.25,1)" },
    );
    return () => animation?.cancel();
  }, [level, showStack]);

  useEffect(() => {
    if (demoAllowed) {
      setSupported(true);
      return;
    }
    try {
      const canvas = document.createElement("canvas");
      const gl = canvas.getContext("webgl2");
      setSupported(Boolean(gl));
      gl?.getExtension("WEBGL_lose_context")?.loseContext();
    } catch {
      setSupported(false);
    }
    return () => {
      document.body.style.cursor = "";
    };
  }, [demoAllowed]);

  useEffect(() => {
    firstLookup.current = true;
    const restore = () => {
      const params = new URLSearchParams(window.location.search);
      let source = window.location.search;
      if (
        params.get("parking") !== listing.id &&
        params.get("parking") !== contextId
      ) {
        try {
          source =
            sessionStorage.getItem(`gp:interior-selection:v1:${contextId}`) ||
            source;
        } catch {}
      }
      const sourceParams = new URLSearchParams(source);
      // Old listing-unit links and the canonical physical aliases both remain valid.
      const rawUnit = sourceParams.get("unit");
      const alias = units.find(
        (unit) =>
          unit.id === rawUnit ||
          (unit.listingId === listing.id && unit.listingUnitId === rawUnit),
      );
      if (alias) sourceParams.set("unit", alias.id);
      if (sourceParams.get("parking") === contextId)
        sourceParams.set("parking", listing.id);
      const restored = readInteriorSelection(
        sourceParams.toString(),
        selectionListing,
      );
      const requested = units.find(
        (unit) =>
          unit.id === props.selectedSpaceId ||
          (unit.listingId === listing.id &&
            unit.listingUnitId === props.selectedSpaceId),
      );
      let nextLevel =
        sourceParams.get("parking") === listing.id
          ? restored.level
          : defaultLevel;
      if (
        props.viewLevel !== undefined &&
        levels.some((floor) => floor.level === props.viewLevel)
      )
        nextLevel = props.viewLevel;
      if (requested && props.viewLevel === undefined)
        nextLevel = requested.space.level;
      const restoredUnit = units.find(
        (unit) => unit.id === restored.unit && unit.space.level === nextLevel,
      )?.id;
      const nextSelected =
        requested?.space.level === nextLevel
          ? requested.id
          : (restoredUnit ??
            units.find(
              (unit) =>
                unit.listingId === listing.id && unit.space.level === nextLevel,
            )?.id ??
            units.find((unit) => unit.space.level === nextLevel)?.id ??
            null);
      firstLookup.current = !sourceParams.has("floor");
      persistSelection(nextLevel, nextSelected);
      const selectedUnit = units.find((unit) => unit.id === nextSelected);
      if (selectedUnit)
        props.onListingSelect?.(
          selectedUnit.listingId,
          selectedUnit.listingUnitId,
        );
    };
    restore();
    window.addEventListener("popstate", restore);
    return () => window.removeEventListener("popstate", restore);
  }, [
    listing.id,
    contextId,
    selectionListing,
    props.viewLevel,
    props.selectedSpaceId,
  ]);

  useEffect(() => {
    setIndividualScene(null);
    if (
      group ||
      listing.locationPrecision !== "exact_opt_in" ||
      !listing.sceneAvailable ||
      listing.spaces.some((space) => space.levelKnown === false) ||
      demoAllowed
    ) {
      setLoadingScene(false);
      return;
    }
    const controller = new AbortController();
    setLoadingScene(true);
    void (async () => {
      let response = await fetch(
        `/api/scenes?listingId=${encodeURIComponent(listing.id)}&level=${level}`,
        { signal: controller.signal },
      );
      if (!response.ok && firstLookup.current && levels.length > 1)
        response = await fetch(
          `/api/scenes?listingId=${encodeURIComponent(listing.id)}`,
          { signal: controller.signal },
        );
      firstLookup.current = false;
      if (!response.ok) return;
      const result = await response.json();
      const parsed = parsePublicScene(result.data);
      if (parsed && !controller.signal.aborted) {
        setIndividualScene(parsed);
        if (parsed.manifest.level !== level)
          persistSelection(parsed.manifest.level, null);
      }
    })()
      .catch(() => {})
      .finally(() => {
        if (!controller.signal.aborted) setLoadingScene(false);
      });
    return () => controller.abort();
  }, [
    group,
    listing.id,
    listing.locationPrecision,
    listing.sceneAvailable,
    level,
    demoAllowed,
  ]);

  const plan = (
    <PublicPlan
      scene={scene}
      units={levelUnits}
      selected={selected}
      onSelect={chooseUnit}
      demo={demoAllowed && levelUnits.length <= 8 ? slots : undefined}
    />
  );
  const title = selectedReference
    ? `${selectedLot ? `${selectedLot.label} · ` : ""}Place ${selectedReference.space.number || "non numérotée"}`
    : `Niveau ${floorLabel(level)}`;
  return (
    <section
      ref={viewerRoot}
      className={`gp-parking-viewer${expanded ? " is-expanded" : ""}`}
      role={expanded ? "dialog" : undefined}
      aria-modal={expanded || undefined}
      tabIndex={expanded ? -1 : undefined}
      onKeyDown={(event) => {
        if (!expanded) return;
        if (event.key === "Escape") {
          event.preventDefault();
          setExpanded(false);
          return;
        }
        if (event.key !== "Tab") return;
        const root = viewerRoot.current;
        if (!root) return;
        const controls = Array.from(
          root.querySelectorAll<HTMLElement>(
            'button:not([disabled]), a[href], summary, [tabindex="0"]',
          ),
        ).filter((control) => control.getClientRects().length > 0);
        const first = controls[0],
          last = controls.at(-1);
        if (
          event.shiftKey &&
          (document.activeElement === first || document.activeElement === root)
        ) {
          event.preventDefault();
          last?.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first?.focus();
        }
      }}
      aria-label={
        group ? `Plan intérieur de ${group.name}` : "Plan intérieur du parking"
      }
    >
      <div className="gp-viewer-heading">
        <div
          className="gp-viewer-tabs"
          role="group"
          aria-label="Mode de présentation"
        >
          <button
            type="button"
            className={effectiveMode === "3d" ? "is-active" : ""}
            disabled={!hasModel && !loadingScene}
            aria-pressed={effectiveMode === "3d"}
            onClick={() => setMode("3d")}
          >
            <Box size={17} />
            Plan 3D
          </button>
          <button
            type="button"
            className={effectiveMode === "plan" ? "is-active" : ""}
            aria-pressed={effectiveMode === "plan"}
            onClick={() => setMode("plan")}
          >
            <Layers3 size={17} />
            {scene ? "Plan 2D" : "Places"}
          </button>
          <button
            type="button"
            className={effectiveMode === "photo" ? "is-active" : ""}
            aria-pressed={effectiveMode === "photo"}
            onClick={() => setMode("photo")}
          >
            <ImageIcon size={17} />
            Photos
          </button>
          <button
            type="button"
            className={effectiveMode === "map" ? "is-active" : ""}
            aria-pressed={effectiveMode === "map"}
            onClick={() => {
              setMapRequested(true);
              setMode("map");
            }}
          >
            <MapPin size={17} />
            Carte
          </button>
        </div>
        {effectiveMode !== "map" && !showLevelNavigation ? (
          <LevelSwitch levels={levels} current={level} onChange={chooseLevel} />
        ) : null}
      </div>
      {lots.length > 1 ? (
        <div
          className="gp-viewer-lots"
          role="group"
          aria-label="Lots proposés dans ce parking"
        >
          {lots.map((lot) => (
            <button
              key={lot.key}
              type="button"
              aria-pressed={selectedLot?.key === lot.key}
              onClick={() => chooseLot(lot.key)}
              style={{ borderLeftColor: lot.color }}
              aria-label={`${lot.label}, ${lot.spaces.map(parkingSpaceLocation).join(", ")}, ${listingPrice(lot.listing, lot.transactionType)}`}
            >
              <strong>
                <i style={{ background: lot.color }} />
                {lot.label}
                <span>
                  {lot.spaces.length} place{lot.spaces.length > 1 ? "s" : ""}
                </span>
              </strong>
              <small>{parkingNumbersSummary(lot.spaces)}</small>
              <span className="gp-mobile-lot-numbers">
                {parkingNumbersSummary(lot.spaces)}
              </span>
              <small>{listingPrice(lot.listing, lot.transactionType)}</small>
            </button>
          ))}
        </div>
      ) : null}
      {showLevelNavigation ? (
        <div
          className="gp-floor-navigation"
          role="group"
          aria-label="Niveaux du parking"
        >
          {effectiveMode === "3d" ? (
            <button
              type="button"
              aria-pressed={showStack}
              onClick={() => setStackOverview(true)}
            >
              <Layers3 size={16} aria-hidden="true" /> Tous les niveaux
            </button>
          ) : null}
          {levels.map((floor) => (
            <button
              type="button"
              key={floor.level}
              aria-pressed={!showStack && floor.level === level}
              aria-label={`Afficher le niveau ${floorLabel(floor.level)}`}
              onClick={() => chooseLevel(floor.level)}
            >
              {floorLabel(floor.level)}
              <span>
                {
                  units.filter((unit) => unit.space.level === floor.level)
                    .length
                }{" "}
                places
              </span>
            </button>
          ))}
        </div>
      ) : null}
      <div
        className={`gp-viewer-workspace${effectiveMode === "3d" && demoAllowed ? " has-render-plates" : ""}${showStack ? " is-stack-overview" : ""}`}
      >
        <div className="gp-viewer-level-layer" ref={levelLayer}>
          <div className="gp-viewer-stage">
            <button
              type="button"
              ref={expandButton}
              className="gp-viewer-expand"
              aria-label={
                expanded
                  ? "Fermer la vue agrandie du parking"
                  : "Agrandir la vue du parking"
              }
              aria-haspopup={expanded ? undefined : "dialog"}
              onClick={() => setExpanded((value) => !value)}
            >
              {expanded ? <Minimize size={16} /> : <Maximize size={16} />}
              {expanded ? "Réduire" : "Agrandir"}
            </button>
            {mapRequested ? (
              <div className="gp-viewer-city" hidden={effectiveMode !== "map"}>
                <CityMap
                  key={contextId}
                  listings={[photoListing]}
                  selectedId={photoListing.id}
                  onSelect={() => {}}
                  visible={effectiveMode === "map"}
                  cooperativeGestures={false}
                  initialView={{
                    center: photoListing.coordinates,
                    zoom: 15.5,
                    bearing: -28,
                    pitch: 50,
                  }}
                />
              </div>
            ) : null}
            {effectiveMode === "map" ? null : showStack ? (
              <ParkingLevelStack
                levels={levels.map((floor) => ({
                  ...floor,
                  spaces: units
                    .filter((unit) => unit.space.level === floor.level)
                    .map((unit) => unit.space),
                  manifest:
                    group?.levels.find((item) => item.level === floor.level)
                      ?.scene?.manifest ??
                    (scene?.manifest.level === floor.level
                      ? scene.manifest
                      : undefined),
                }))}
                demo={Boolean(demoAllowed)}
                onSelect={chooseLevel}
              />
            ) : effectiveMode === "photo" ? (
              <Photos
                listing={photoListing}
                selectedId={selectedReference?.listingUnitId || null}
              />
            ) : effectiveMode === "plan" ||
              (!demoAllowed && supported === false) ||
              sceneTooLarge ? (
              plan
            ) : (loadingScene && !hasModel) ||
              (!demoAllowed && supported === null) ? (
              <div className="gp-map-loading" role="status">
                <span className="gp-map-spinner" />
                Chargement du plan…
              </div>
            ) : demoAllowed ? (
              <RenderedParkingLevel
                key={`${contextId}:${level}`}
                level={level}
                units={levelUnits.map((unit) => ({
                  ...unit,
                  lot:
                    lots.length > 1
                      ? lots.find(
                          (lot) =>
                            lot.listing.id === unit.listingId &&
                            lot.spaces.some(
                              (space) => space.id === unit.listingUnitId,
                            ),
                        )
                      : undefined,
                }))}
                selected={selected}
                onSelect={chooseUnit}
                onFallback={() => setMode("plan")}
              />
            ) : scene ? (
              <SceneBoundary key={contextId} fallback={plan}>
                <MeasuredParkingCanvas
                  manifest={scene.manifest}
                  selectedId={selected}
                  onSelect={chooseUnit}
                  onUnavailable={() => setSupported(false)}
                />
              </SceneBoundary>
            ) : (
              plan
            )}
            {effectiveMode === "3d" &&
            !showStack &&
            (demoAllowed || supported) &&
            hasModel &&
            !sceneTooLarge ? (
              <>
                {!demoAllowed ? (
                  <div className="gp-viewer-gesture">
                    <MousePointer2 size={14} />
                    Sélectionnez une place pour la découvrir
                  </div>
                ) : null}
                <div className="gp-viewer-disclaimer">
                  {demoAllowed
                    ? "Parking et plan d’exemple"
                    : `Plan contrôlé · niveau ${floorLabel(level)}`}
                </div>
              </>
            ) : null}
            {effectiveMode === "photo" && !hasModel ? (
              <div className="gp-viewer-model-note">
                <Layers3 size={15} />
                <span>Le plan de ce niveau n’est pas encore disponible.</span>
              </div>
            ) : null}
          </div>
        </div>
      </div>
      {effectiveMode === "3d" && !showStack && levelUnits.length ? (
        <div
          className="gp-viewer-spaces gp-viewer-spaces-grid"
          role="group"
          aria-label="Places proposées à ce niveau"
        >
          {levelUnits.map(({ id, space }) => (
            <button
              type="button"
              key={id}
              className={selected === id ? "is-selected" : ""}
              aria-pressed={selected === id}
              onClick={() => chooseUnit(id)}
            >
              <i aria-hidden="true" />
              Place {space.number || "non numérotée"}
              <span>{space.areaM2 ? `${space.areaM2} m²` : ""}</span>
            </button>
          ))}
        </div>
      ) : null}
      <div className="gp-viewer-footer">
        <span className="gp-selection-key">
          <i aria-hidden="true" />
          {showStack
            ? `${levels.length} niveaux · ${units.length} places`
            : title}
          {!showStack &&
          selectedReference &&
          selectedReference.space.levelKnown !== false
            ? ` · niveau ${floorLabel(selectedReference.space.level)}`
            : ""}
          {!showStack && selectedReference?.space.areaM2
            ? ` · ${selectedReference.space.areaM2} m²`
            : ""}
        </span>
        <span role="status" aria-live="polite">
          {demoAllowed
            ? "Démonstration fictive · organisation et dimensions indicatives"
            : scene
              ? `Relevé du ${new Date(scene.manifest.provenance.observedAt).toLocaleDateString("fr-FR")} · ±${Math.round(scene.manifest.provenance.accuracyM * 100)} cm`
              : "Les photos et dimensions renseignées restent consultables."}
        </span>
      </div>
      {demoAllowed ? (
        <details className="gp-viewer-provenance">
          <summary>À propos de cette représentation</summary>
          <p>
            Un schéma représentatif pour mieux comprendre le parking et ses
            places. Cette démonstration est fictive.
          </p>
          <a
            href="/parking-renders/ATTRIBUTION.txt"
            target="_blank"
            rel="noreferrer"
          >
            Crédits du rendu
          </a>
        </details>
      ) : null}
      {scene && !demoAllowed ? (
        <details className="gp-viewer-provenance">
          <summary>À propos de ce plan</summary>
          <p>{scene.manifest.provenance.publicSummary}</p>
          <p>
            Contrôlé le {new Date(scene.reviewedAt).toLocaleDateString("fr-FR")}{" "}
            · version {scene.version}. Le contrôle du plan ne constitue pas une
            expertise immobilière.
          </p>
          {scene.manifest.observations.map((note, index) => (
            <p key={note.id || index}>
              {note.category} : {note.description}
              <small>
                {note.observedAt
                  ? ` Relevé du ${new Date(note.observedAt).toLocaleDateString("fr-FR")}.`
                  : " Date inconnue."}{" "}
                {note.evidenceCount || 0} pièce(s) privée(s) associée(s).
              </small>
            </p>
          ))}
          {"documentation" in scene ? (
            <p>
              Observations contrôlées :{" "}
              {scene.documentation?.reviewedObservationIds?.length || 0}/
              {scene.manifest.observations.length}. Ce périmètre ne décrit pas
              automatiquement tout l’état des places.
            </p>
          ) : null}
          {"manifestHash" in scene && scene.manifestHash ? (
            <p title={scene.manifestHash}>
              Empreinte du plan public : {scene.manifestHash.slice(0, 12)}…
            </p>
          ) : null}
        </details>
      ) : null}
    </section>
  );
}
