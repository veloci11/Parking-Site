import type { ParkingRender } from "./parking-render";

type RenderArea = ParkingRender["spaces"][number];

export function parkingRenderAnchor(area: RenderArea): [number, number] {
  return (
    area.anchor ?? [
      area.polygon.reduce((sum, point) => sum + point[0], 0) /
        area.polygon.length,
      area.polygon.reduce((sum, point) => sum + point[1], 0) /
        area.polygon.length,
    ]
  );
}

/** Badge diameters stay inside their own place and clear neighbouring badges. */
export function parkingRenderBadges(
  areas: readonly RenderArea[],
  width: number,
  height: number,
) {
  return areas.map((area) => {
    const anchor = parkingRenderAnchor(area);
    const x = anchor[0] * width;
    const y = anchor[1] * height;
    const edgeDistance = Math.min(
      ...area.polygon.map((start, index) => {
        const end = area.polygon[(index + 1) % area.polygon.length];
        const ax = start[0] * width,
          ay = start[1] * height;
        const dx = (end[0] - start[0]) * width,
          dy = (end[1] - start[1]) * height;
        const t = Math.max(
          0,
          Math.min(
            1,
            ((x - ax) * dx + (y - ay) * dy) / (dx * dx + dy * dy || 1),
          ),
        );
        return Math.hypot(x - ax - t * dx, y - ay - t * dy);
      }),
    );
    const neighbourDistance = Math.min(
      Infinity,
      ...areas
        .filter((other) => other !== area)
        .map((other) => {
          const otherAnchor = parkingRenderAnchor(other);
          return Math.hypot(
            x - otherAnchor[0] * width,
            y - otherAnchor[1] * height,
          );
        }),
    );
    const diameter = Math.max(
      0,
      Math.min(30, edgeDistance * 2 - 4, neighbourDistance - 6),
    );
    return { number: area.number, anchor, diameter, visible: diameter >= 18 };
  });
}

/** A small fixed-camera translation keeps the chosen place central without free rotation. */
export function parkingRenderFocus(
  area: RenderArea | undefined,
  enabled: boolean,
) {
  if (!area || !enabled) return "translate(0%, 0%) scale(1)";
  const [x, y] = parkingRenderAnchor(area);
  const scale = 1.12;
  const clamp = (value: number) => Math.max(-18, Math.min(18, value));
  const tx = clamp((0.52 - (0.5 + (x - 0.5) * scale)) * 100);
  const ty = clamp((0.46 - (0.5 + (y - 0.5) * scale)) * 100);
  return `translate(${tx.toFixed(3)}%, ${ty.toFixed(3)}%) scale(${scale})`;
}
