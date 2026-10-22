import type { ParkingType, Space, TransactionType } from "@/lib/types";
export const preparationKey = "gp:preparation:v1";
export interface Preparation {
  title: string;
  city: string;
  type: ParkingType;
  quantity: number;
  transactionType?: TransactionType;
}
export const emptyPreparation: Preparation = {
  title: "",
  city: "",
  type: "covered",
  quantity: 1,
  transactionType: "sale",
};
export function decodePreparation(raw: string | null): Preparation | null {
  if (!raw || raw.length > 3000) return null;
  try {
    const value = JSON.parse(raw);
    if (
      !value ||
      typeof value !== "object" ||
      Array.isArray(value) ||
      typeof value.title !== "string" ||
      typeof value.city !== "string" ||
      !["covered", "box", "outdoor", "mixed"].includes(value.type) ||
      (value.transactionType !== undefined &&
        !["sale", "rent"].includes(value.transactionType)) ||
      !Number.isInteger(value.quantity) ||
      value.quantity < 1 ||
      value.quantity > 500
    )
      return null;
    return {
      title: value.title.slice(0, 90),
      city: value.city.slice(0, 80),
      type: value.type,
      quantity: value.quantity,
      ...(value.transactionType
        ? { transactionType: value.transactionType }
        : {}),
    };
  } catch {
    return null;
  }
}
export function preparationPayload(value: Preparation, makeId: () => string) {
  const safe = decodePreparation(JSON.stringify(value));
  if (!safe)
    throw new Error(
      "La préparation locale est invalide. Recommencez les informations de base.",
    );
  const spaces: Space[] = Array.from({ length: safe.quantity }, (_, i) => ({
    id: makeId(),
    number: "",
    level: -1,
    areaM2: null,
    lengthM: null,
    widthM: null,
    clearanceM: null,
    offer: {
      transactionType: safe.transactionType || "sale",
      priceCents: 0,
      status: "available",
    },
  }));
  return {
    title: safe.title,
    city: safe.city,
    type: safe.type,
    spaces,
    pricingMode: "per_space" as const,
    ...(safe.transactionType ? { transactionType: safe.transactionType } : {}),
  };
}
