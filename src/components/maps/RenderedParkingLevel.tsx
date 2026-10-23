"use client";

import { useEffect, useId, useRef, useState, type CSSProperties } from "react";
import {
  loadDemoParkingRender,
  type ParkingRender,
} from "@/lib/parking-render";
import {
  parkingRenderBadges,
  parkingRenderFocus,
} from "@/lib/parking-render-navigation";
import "@/styles/parking-render.css";

interface RenderUnit {
  id: string;
  space: { number: string; areaM2: number | null };
  lot?: { label: string; color: string };
}

export default function RenderedParkingLevel({
  level,
  units,
  selected,
  focusRevision = 0,
  onSelect,
  onFallback,
}: {
  level: number;
  units: RenderUnit[];
  selected: string | null;
  focusRevision?: number;
  onSelect: (id: string) => void;
  onFallback: () => void;
}) {
  const maskId = useId().replace(/[^a-zA-Z0-9_-]/g, "");
  const [frame, setFrame] = useState<ParkingRender | null>(null);
  const [failed, setFailed] = useState(false);
  const [imageReady, setImageReady] = useState(false);
  const viewport = useRef<HTMLDivElement>(null);
  const [frameWidth, setFrameWidth] = useState(0);
  const [overviewRevision, setOverviewRevision] = useState(-1);
  useEffect(() => {
    const node = viewport.current;
    if (!node) return;
    const observer = new ResizeObserver(() => setFrameWidth(node.clientWidth));
    observer.observe(node);
    setFrameWidth(node.clientWidth);
    return () => observer.disconnect();
  }, [failed]);
  useEffect(() => {
    const controller = new AbortController();
    setFrame(null);
    setFailed(false);
    setImageReady(false);
    loadDemoParkingRender(level, controller.signal)
      .then((value) => {
        if (!controller.signal.aborted) setFrame(value);
      })
      .catch(() => {
        if (!controller.signal.aborted) setFailed(true);
      });
    return () => controller.abort();
  }, [level]);

  if (failed)
    return (
      <div className="gp-render-message is-failed" role="status">
        <p>La vue du parking est momentanément indisponible.</p>
        <button className="text-button" onClick={onFallback}>
          Consulter les places sur le plan
        </button>
      </div>
    );

  const visibleFrame = frame?.level === level ? frame : null;
  const mapped =
    visibleFrame?.spaces.flatMap((area) => {
      const unit = units.find((item) => item.space.number === area.number);
      return unit ? [{ area, unit }] : [];
    }) ?? [];
  const current = mapped.find(({ unit }) => unit.id === selected);
  const badges = visibleFrame
    ? parkingRenderBadges(
        mapped.map(({ area }) => area),
        frameWidth,
        (frameWidth * visibleFrame.height) / visibleFrame.width,
      )
    : [];
  const focused =
    focusRevision > 0 && focusRevision !== overviewRevision && Boolean(current);
  const mobileFocused = focusRevision !== overviewRevision && Boolean(current);

  return (
    <div className="gp-rendered-level" aria-busy={!imageReady} ref={viewport}>
      {focused || mobileFocused ? (
        <button
          className={`gp-render-overview${!focused ? " is-mobile-only" : ""}`}
          type="button"
          onClick={() => setOverviewRevision(focusRevision)}
        >
          Vue d’ensemble
        </button>
      ) : null}
      <div className="gp-render-viewport">
        {!imageReady ? (
          <div className="gp-render-message" role="status">
            Préparation de la vue du parking…
          </div>
        ) : null}
        {visibleFrame ? (
          <div
            className={`gp-render-frame${imageReady ? " is-ready" : ""}`}
            style={
              {
                aspectRatio: `${visibleFrame.width} / ${visibleFrame.height}`,
                "--parking-render-focus": parkingRenderFocus(
                  current?.area,
                  focused,
                ),
                "--parking-mobile-focus": parkingRenderFocus(
                  current?.area,
                  mobileFocused,
                ),
                "--parking-mobile-scale": mobileFocused ? 1.2 : 1,
              } as CSSProperties
            }
          >
            <img
              src={`${visibleFrame.image}?v=${visibleFrame.renderHash.slice(0, 16)}`}
              alt={`Vue en perspective du parking fictif, niveau ${String(level).replace("-", "−")}. Les places proposées sont sélectionnables.`}
              width={visibleFrame.width}
              height={visibleFrame.height}
              draggable={false}
              onLoad={() => setImageReady(true)}
              onError={() => setFailed(true)}
            />
            {imageReady ? (
              <>
                <svg
                  className="gp-render-hit-map"
                  viewBox={`0 0 ${visibleFrame.width} ${visibleFrame.height}`}
                  aria-label="Places proposées dans le parking"
                  role="group"
                >
                  <defs>
                    {mapped.map(({ area }, index) =>
                      area.mask ? (
                        <mask
                          key={area.number}
                          id={`${maskId}-${index}`}
                          maskUnits="userSpaceOnUse"
                          x="0"
                          y="0"
                          width={visibleFrame.width}
                          height={visibleFrame.height}
                          style={{ maskType: "alpha" }}
                        >
                          <image
                            href={`${area.mask}?v=${area.maskHash?.slice(0, 16)}`}
                            x="0"
                            y="0"
                            width={visibleFrame.width}
                            height={visibleFrame.height}
                          />
                        </mask>
                      ) : null,
                    )}
                  </defs>
                  {mapped.map(({ area, unit }, index) => (
                    <path
                      key={unit.id}
                      d={(area.hitContours ?? [area.polygon])
                        .map(
                          (contour) =>
                            contour
                              .map(
                                ([x, y], i) =>
                                  `${i ? "L" : "M"}${x * visibleFrame.width},${y * visibleFrame.height}`,
                              )
                              .join(" ") + "Z",
                        )
                        .join(" ")}
                      fillRule="evenodd"
                      clipRule="evenodd"
                      mask={area.mask ? `url(#${maskId}-${index})` : undefined}
                      className={`gp-render-space${selected === unit.id ? " is-selected" : ""}`}
                      style={
                        selected === unit.id
                          ? undefined
                          : { fill: unit.lot?.color, stroke: unit.lot?.color }
                      }
                      role="button"
                      tabIndex={0}
                      aria-label={`${unit.lot ? `${unit.lot.label}, ` : ""}Place ${area.number}${unit.space.areaM2 ? `, ${unit.space.areaM2} m²` : ""}, consulter cette place`}
                      aria-pressed={selected === unit.id}
                      onClick={() => onSelect(unit.id)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter" || event.key === " ") {
                          event.preventDefault();
                          onSelect(unit.id);
                        }
                      }}
                    />
                  ))}
                </svg>
                {mapped.map(({ unit }, index) => {
                  const badge = badges[index];
                  return badge?.visible ? (
                    <span
                      key={unit.id}
                      className={`gp-render-number${unit.id === selected ? " is-selected" : ""}`}
                      aria-hidden="true"
                      style={{
                        left: `${badge.anchor[0] * 100}%`,
                        top: `${badge.anchor[1] * 100}%`,
                        width: badge.diameter,
                        height: badge.diameter,
                        fontSize: Math.min(12, badge.diameter * 0.43),
                        color:
                          unit.id === selected ? undefined : unit.lot?.color,
                      }}
                    >
                      {unit.space.number}
                    </span>
                  ) : null;
                })}
              </>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}
