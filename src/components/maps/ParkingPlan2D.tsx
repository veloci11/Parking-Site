"use client";

import type { PublicScene } from "@/lib/scene-contract";

type Manifest = PublicScene["manifest"];
type Props = {
  manifest: Manifest;
  selectedId: string;
  onSelect: (id: string) => void;
};
const points = (vertices: number[][]) =>
  vertices.map(([x, z]) => `${x},${z}`).join(" ");

/** Orthographic X/Z projection of the approved metric manifest, without inferred geometry. */
export default function ParkingPlan2D({
  manifest,
  selectedId,
  onSelect,
}: Props) {
  const floor = manifest.floor.footprintXZ;
  const minX = Math.min(...floor.map((p) => p[0])),
    minZ = Math.min(...floor.map((p) => p[1]));
  const width = Math.max(...floor.map((p) => p[0])) - minX,
    height = Math.max(...floor.map((p) => p[1])) - minZ;
  const extent = Math.max(width, height),
    padding = extent * 0.065,
    font = extent * 0.028;
  return (
    <figure className="gp-plan2d">
      <svg
        viewBox={`${minX - padding} ${minZ - padding} ${width + padding * 2} ${height + padding * 2}`}
        role="group"
        aria-label={`Plan 2D métrique du niveau ${manifest.level}. Chaque place se sélectionne au clavier ou avec la souris.`}
        preserveAspectRatio="xMidYMid meet"
      >
        <polygon
          points={points(floor)}
          fill="#E7E4DD"
          stroke="#8B8790"
          strokeWidth="1"
          vectorEffect="non-scaling-stroke"
        />
        {manifest.contextSpaces.map((space, i) => (
          <polygon
            key={`context-${i}`}
            points={points(space.footprintXZ)}
            fill="none"
            stroke="#FFFFFF"
            strokeWidth="2"
            vectorEffect="non-scaling-stroke"
          >
            <title>Emplacement de contexte, non proposé à la vente</title>
          </polygon>
        ))}
        {manifest.spaces.map((space, index) => {
          const center = space.footprintXZ.reduce(
            ([x, z], p) => [
              x + p[0] / space.footprintXZ.length,
              z + p[1] / space.footprintXZ.length,
            ],
            [0, 0],
          );
          const selected = space.id === selectedId;
          return (
            <g
              key={space.id}
              className="gp-plan2d-space"
              role="button"
              tabIndex={0}
              aria-pressed={selected}
              aria-label={`Place ${space.displayNumber}, ${space.dimensions.lengthM ?? "longueur inconnue"} par ${space.dimensions.widthM ?? "largeur inconnue"} mètres${selected ? ", sélectionnée" : ""}`}
              onClick={() => onSelect(space.id)}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  onSelect(space.id);
                }
                if (
                  ["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(
                    event.key,
                  )
                ) {
                  event.preventDefault();
                  const direction =
                    event.key === "ArrowLeft" || event.key === "ArrowUp"
                      ? -1
                      : 1;
                  const siblings =
                    event.currentTarget.parentElement?.querySelectorAll<SVGGElement>(
                      ".gp-plan2d-space",
                    );
                  siblings?.[
                    (index + direction + manifest.spaces.length) %
                      manifest.spaces.length
                  ]?.focus();
                }
              }}
            >
              <polygon
                points={points(space.footprintXZ)}
                fill={selected ? "#EAD8AE" : "#F8F9FC"}
                stroke={selected ? "#6D28FF" : "#81798F"}
                strokeWidth={selected ? 2.5 : 1.5}
                vectorEffect="non-scaling-stroke"
              />
              <text
                x={center[0]}
                y={center[1]}
                textAnchor="middle"
                dominantBaseline="middle"
                fontSize={font}
                fontWeight="700"
                fill="#252131"
                pointerEvents="none"
              >
                {space.displayNumber}
              </text>
            </g>
          );
        })}
        {manifest.obstacles.map((obstacle, i) => (
          <polygon
            key={`obstacle-${i}`}
            points={points(obstacle.footprintXZ)}
            fill={
              obstacle.kind === "ramp"
                ? "#C5BDD9"
                : obstacle.kind === "column"
                  ? "#66616C"
                  : "#A5A09A"
            }
            stroke="#625D67"
            strokeWidth="1"
            vectorEffect="non-scaling-stroke"
          >
            <title>
              {obstacle.kind === "ramp"
                ? "Rampe"
                : obstacle.kind === "column"
                  ? "Poteau"
                  : "Mur"}{" "}
              · hauteur {obstacle.heightM} m
            </title>
          </polygon>
        ))}
        {manifest.observations.map((note, i) => (
          <circle
            key={`note-${i}`}
            cx={note.positionXZ[0]}
            cy={note.positionXZ[1]}
            r={extent * 0.012}
            fill="#FFFFFF"
            stroke="#6D28FF"
            strokeWidth="1.5"
            vectorEffect="non-scaling-stroke"
          >
            <title>{note.description}</title>
          </circle>
        ))}
      </svg>
      <figcaption>
        Vue de dessus · proportions métriques du plan contrôlé. Gris : murs et
        poteaux. Lavande : rampes. Doré et violet : place sélectionnée.
      </figcaption>
    </figure>
  );
}
