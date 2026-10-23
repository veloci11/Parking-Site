import type { CommercialDetails, Listing } from "./types";

const accessPriority: [keyof CommercialDetails["access"], string][] = [
  ["badge", "Badge"],
  ["key", "Clé"],
  ["gate", "Portail"],
  ["door", "Porte"],
  ["lift", "Ascenseur"],
];
const unknownAccess = new Set([
  "unknown",
  "inconnu",
  "inconnue",
  "non renseigne",
  "non renseignee",
  "non decrit",
  "non decrite",
  "a preciser",
  "a completer",
  "acces decrit",
  "n/a",
  "-",
  "—",
]);

/** A declared access device, then the seller's own legacy description. */
export function accessLabel(
  listing: Pick<Listing, "commercialDetails" | "quality">,
): string {
  const access = listing.commercialDetails?.access;
  const present = accessPriority.find(([key]) => access?.[key] === "present");
  if (present) return present[1];

  const legacy = listing.quality.access.replace(/\s+/g, " ").trim();
  const normalized = legacy
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[.!]+$/, "");
  if (!legacy || unknownAccess.has(normalized)) return "À préciser";
  if (legacy.length <= 44) return legacy;
  const short = legacy
    .slice(0, 43)
    .replace(/\s+\S*$/, "")
    .trimEnd();
  return `${short || legacy.slice(0, 43)}…`;
}
