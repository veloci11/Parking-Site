import type { ExpressionSpecification, StyleSpecification } from "maplibre-gl";

/** OpenFreeMap's POI classes can outnumber the icons shipped in its sprite.
 * Resolve the provider icon when present, otherwise render its neutral point.
 * This preserves the POI and its label; network/style errors remain observable.
 * https://maplibre.org/maplibre-gl-js/docs/examples/use-a-fallback-image/
 */
export function withPoiIconFallback(
  style: StyleSpecification,
): StyleSpecification {
  if (
    typeof style.sprite !== "string" ||
    !style.sprite.startsWith("https://tiles.openfreemap.org/sprites/")
  )
    return style;
  return {
    ...style,
    layers: style.layers.map((layer) => {
      if (layer.type !== "symbol" || layer["source-layer"] !== "poi")
        return layer;
      const icon = layer.layout?.["icon-image"];
      if (!Array.isArray(icon)) return layer;
      return {
        ...layer,
        layout: {
          ...layer.layout,
          "icon-image": [
            "coalesce",
            ["image", icon],
            ["image", "circle_11_black"],
          ] as ExpressionSpecification,
        },
      };
    }),
  };
}
