/** Discard raw browser accuracy/altitude and round before passing to the map. */
export function approximateBrowserPosition(
  longitude: number,
  latitude: number,
): [number, number] | null {
  if (
    !Number.isFinite(longitude) ||
    !Number.isFinite(latitude) ||
    Math.abs(longitude) > 180 ||
    Math.abs(latitude) > 90
  )
    return null;
  return [
    Math.round(longitude * 1000) / 1000,
    Math.round(latitude * 1000) / 1000,
  ];
}
export function geolocationErrorMessage(code: number) {
  return code === 1
    ? "La localisation a été refusée. Vous pouvez rechercher une ville ou déplacer la carte."
    : code === 3
      ? "La localisation prend trop de temps. Réessayez ou recherchez une ville."
      : "Votre position est indisponible. Vous pouvez rechercher une ville ou déplacer la carte.";
}
