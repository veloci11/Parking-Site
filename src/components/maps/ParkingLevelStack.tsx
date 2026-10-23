"use client";

import { useEffect, useState, type CSSProperties } from "react";
import { Layers3 } from "lucide-react";
import {
  loadDemoParkingRender,
  type ParkingRender,
} from "@/lib/parking-render";
import { parkingNumbersSummary } from "@/lib/parking-level-overview";
import type { PublicScene } from "@/lib/scene-contract";

type Floor = {
  level: number;
  label: string;
  spaces: { number: string }[];
  manifest?: PublicScene["manifest"];
};

function FloorPlate({ floor, demo }: { floor: Floor; demo: boolean }) {
  const [frame, setFrame] = useState<ParkingRender | null>(null);
  useEffect(() => {
    if (!demo) return;
    const controller = new AbortController();
    loadDemoParkingRender(floor.level, controller.signal)
      .then((value) => {
        if (!controller.signal.aborted) setFrame(value);
      })
      .catch(() => {});
    return () => controller.abort();
  }, [floor.level, demo]);

  if (demo && frame?.level === floor.level)
    return (
      <img
        src={`${frame.image}?v=${frame.renderHash.slice(0, 16)}`}
        width={frame.width}
        height={frame.height}
        alt=""
        draggable={false}
        decoding="async"
      />
    );
  const manifest = floor.manifest;
  if (!manifest)
    return (
      <span className="gp-stack-unavailable">
        <Layers3 size={38} />
        <span>Plan à venir</span>
      </span>
    );
  // A lightweight projection uses only approved geometry, without another WebGL context.
  const project = (points: readonly (readonly number[])[]) =>
    points.map(([x, z]) => [x - z, (x + z) * 0.42]);
  const boundary = project(manifest.floor.footprintXZ);
  const minX = Math.min(...boundary.map(([x]) => x)),
    minY = Math.min(...boundary.map(([, y]) => y));
  const width = Math.max(...boundary.map(([x]) => x)) - minX;
  const height = Math.max(...boundary.map(([, y]) => y)) - minY;
  const padding = Math.max(width, height) * 0.08;
  const points = (polygon: readonly (readonly number[])[]) =>
    project(polygon)
      .map((point) => point.join(","))
      .join(" ");
  return (
    <svg
      viewBox={`${minX - padding} ${minY - padding} ${width + padding * 2} ${height + padding * 2}`}
      aria-hidden="true"
    >
      <polygon
        points={boundary.map((point) => point.join(",")).join(" ")}
        fill="#e9e5de"
        stroke="#aaa29a"
        strokeWidth="1"
        vectorEffect="non-scaling-stroke"
      />
      {manifest.contextSpaces.map((space, index) => (
        <polygon
          key={`context-${index}`}
          points={points(space.footprintXZ)}
          fill="none"
          stroke="white"
          strokeWidth="1"
          vectorEffect="non-scaling-stroke"
        />
      ))}
      {manifest.spaces.map((space) => (
        <polygon
          key={space.id}
          points={points(space.footprintXZ)}
          fill="#e4d3a7"
          stroke="#ad8b43"
          strokeWidth="1"
          vectorEffect="non-scaling-stroke"
        />
      ))}
      {manifest.obstacles.map((obstacle, index) => (
        <polygon
          key={`obstacle-${index}`}
          points={points(obstacle.footprintXZ)}
          fill="#a9a39d"
        />
      ))}
    </svg>
  );
}

/** An exploded floor overview; selecting a layer opens its complete fixed view. */
export default function ParkingLevelStack({
  levels,
  demo,
  onSelect,
}: {
  levels: Floor[];
  demo: boolean;
  onSelect: (level: number) => void;
}) {
  return (
    <div
      className={`gp-floor-stack${levels.length <= 3 ? " is-short-stack" : ""}`}
      aria-label="Vue d’ensemble des niveaux du parking"
    >
      <p>Sélectionnez un niveau</p>
      <div className="gp-floor-stack-layers">
        {levels.map((floor, index) => (
          <button
            type="button"
            key={floor.level}
            className="gp-floor-stack-level"
            style={{ "--stack-order": levels.length - index } as CSSProperties}
            onClick={() => onSelect(floor.level)}
            aria-label={`Afficher le niveau ${floor.level === 0 ? "RDC" : floor.level}, ${parkingNumbersSummary(floor.spaces, floor.spaces.length)}`}
          >
            <span className="gp-floor-stack-plate" aria-hidden="true">
              <FloorPlate floor={floor} demo={demo} />
            </span>
            <span className="gp-floor-stack-label">
              <strong>
                {floor.level === 0
                  ? "RDC"
                  : `Niveau ${String(floor.level).replace("-", "−")}`}
              </strong>
              <span>
                {floor.spaces.length} place{floor.spaces.length > 1 ? "s" : ""}
              </span>
              <small>{parkingNumbersSummary(floor.spaces)}</small>
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}
