import type { Space } from "./types";

/** Unknown dimensions and floor stay unknown until the seller supplies them. */
export function createDraftSpace(id = crypto.randomUUID()): Space {
  return {
    id,
    number: "",
    level: 0,
    levelKnown: false,
    areaM2: null,
    lengthM: null,
    widthM: null,
    clearanceM: null,
    offer: { transactionType: "sale", priceCents: 0, status: "available" },
  };
}

export function parseSpaceCount(input: string): number | null {
  if (!/^\d+$/.test(input.trim())) return null;
  const count = Number(input);
  return Number.isSafeInteger(count) && count >= 1 && count <= 500
    ? count
    : null;
}

/** Called only after the seller applies the count, never during typing. */
export function resizeDraftSpaces(spaces: Space[], input: string): Space[] {
  const count = parseSpaceCount(input);
  if (count === null) throw new Error("Indiquez un nombre entier de 1 à 500.");
  return Array.from(
    { length: count },
    (_, index) => spaces[index] || createDraftSpace(),
  );
}
