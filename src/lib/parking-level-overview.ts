/** Short labels never substitute for the complete, individually selectable spaces. */
export function parkingNumbersSummary(
  spaces: readonly { number: string }[],
  maximum = 3,
) {
  if (!spaces.length) return "Aucune place";
  const shown = spaces.slice(0, Math.max(1, maximum));
  const remainder = spaces.length - shown.length;
  return `${spaces.length > 1 ? "Places" : "Place"} ${shown
    .map((space) => space.number || "sans numéro")
    .join(
      ", ",
    )}${remainder ? ` et ${remainder} autre${remainder > 1 ? "s" : ""}` : ""}`;
}
