"use client";

import { useEffect, useId, useState } from "react";
import {
  loadDemoParkingRender,
  type ParkingRender,
} from "@/lib/parking-render";
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
  onSelect,
  onFallback,
}: {
  level: number;
  units: RenderUnit[];
  selected: string | null;
  onSelect: (id: string) => void;
  onFallback: () => void;
}) {
  const maskId = useId().replace(/[^a-zA-Z0-9_-]/g, "");
  const [frame, setFrame] = useState<ParkingRender | null>(null);
  const [failed, setFailed] = useState(false);
  const [imageReady, setImageReady] = useState(false);
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
      <div className="gp-render-message" role="status">
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
  const anchor =
    current?.area.anchor ??
    (current
      ? [
          current.area.polygon.reduce((sum, point) => sum + point[0], 0) /
            current.area.polygon.length,
          current.area.polygon.reduce((sum, point) => sum + point[1], 0) /
            current.area.polygon.length,
        ]
      : null);

  return (
    <div className="gp-rendered-level" aria-busy={!imageReady}>
      {!imageReady ? (
        <div className="gp-render-message" role="status">
          Préparation de la vue du parking…
        </div>
      ) : null}
      {visibleFrame ? (
        <div
          className={`gp-render-frame${imageReady ? " is-ready" : ""}`}
          style={{
            aspectRatio: `${visibleFrame.width} / ${visibleFrame.height}`,
          }}
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
                {current && anchor ? (
                  <g aria-hidden="true" className="gp-render-callout">
                    <line
                      x1={anchor[0] * visibleFrame.width}
                      y1={anchor[1] * visibleFrame.height}
                      x2={current.area.label[0] * visibleFrame.width}
                      y2={current.area.label[1] * visibleFrame.height}
                    />
                    <circle
                      cx={anchor[0] * visibleFrame.width}
                      cy={anchor[1] * visibleFrame.height}
                      r={10}
                    />
                  </g>
                ) : null}
              </svg>
              {mapped
                .filter(({ unit }) => unit.id !== selected && unit.lot)
                .map(({ area, unit }) => (
                  <span
                    key={unit.id}
                    className="gp-render-lot-badge"
                    style={{
                      left: `${(area.anchor?.[0] ?? area.label[0]) * 100}%`,
                      top: `${(area.anchor?.[1] ?? area.label[1]) * 100}%`,
                      color: unit.lot?.color,
                    }}
                    aria-hidden="true"
                  >
                    {unit.lot?.label} · {area.number}
                  </span>
                ))}
              {current ? (
                <span
                  className="gp-render-label"
                  aria-hidden="true"
                  style={{
                    left: `${current.area.label[0] * 100}%`,
                    top: `${current.area.label[1] * 100}%`,
                  }}
                >
                  {current.unit.lot ? (
                    <small style={{ color: current.unit.lot.color }}>
                      {current.unit.lot.label}
                    </small>
                  ) : null}
                  Place {current.area.number}
                  {current.unit.space.areaM2
                    ? ` · ${current.unit.space.areaM2} m²`
                    : ""}
                </span>
              ) : null}
            </>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
