export type ListingStatus =
  | "draft"
  | "pending"
  | "published"
  | "changes_requested"
  | "rejected"
  | "suspended"
  | "paused"
  | "sold"
  | "withdrawn";
export type ParkingType = "covered" | "box" | "outdoor";
export interface Quality {
  floor: string;
  lighting: string;
  humidity: string;
  access: string;
  maneuver: string;
  observations: string;
  observedAt?: string | null;
  basis?: "seller_observation" | "provided_document" | "unknown";
}
export interface Space {
  id: string;
  number: string;
  level: number;
  areaM2: number | null;
  lengthM: number | null;
  widthM: number | null;
  clearanceM: number | null;
}
export interface Listing {
  id: string;
  slug: string;
  title: string;
  description: string;
  city: string;
  district: string;
  priceCents: number;
  type: ParkingType;
  spaces: Space[];
  photos: string[];
  spacePhotos?: Record<string, string[]>;
  quality: Quality;
  /** Per-place observations; missing entries stay unknown, never inherit lot-wide quality. */
  unitQuality?: Record<string, Quality>;
  locationPrecision: "area" | "exact_opt_in";
  coordinates: [number, number];
  address?: string;
  sceneAvailable: boolean;
  isDemo: boolean;
  status: ListingStatus;
  version: number;
  sellerName: string;
  createdAt: string;
  updatedAt: string;
  rejectionReason?: string;
  occupancy?: "vacant" | "occupied" | "unknown";
  annualChargesCents?: number | null;
  propertyTaxCents?: number | null;
  observedAt?: string | null;
}
export interface User {
  id: string;
  name: string;
  email: string;
  role: "member" | "moderator" | "admin";
  emailVerified: boolean;
}
export interface Conversation {
  id: string;
  listingId: string;
  listingTitle: string;
  otherName: string;
  updatedAt: string;
  unread: number;
  blockedByMe?: boolean;
  blocked?: boolean;
}
export interface Message {
  id: string;
  conversationId: string;
  senderId: string;
  body: string;
  createdAt: string;
}
export interface Visit {
  id: string;
  conversationId: string;
  status: "requested" | "accepted" | "declined" | "cancelled" | "confirmed";
  proposedAt: string | null;
  confirmedAt: string | null;
  version: number;
}
export interface ApiResult<T> {
  data?: T;
  error?: string;
  code?: string;
}
export const typeLabels: Record<ParkingType, string> = {
  covered: "Parking couvert",
  box: "Box fermé",
  outdoor: "Parking extérieur",
};
export function money(cents: number) {
  return new Intl.NumberFormat("fr-FR", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 0,
  }).format(cents / 100);
}
export function areaLabel(spaces: Space[]) {
  const known = spaces
    .map((s) => s.areaM2)
    .filter((v): v is number => v !== null);
  if (!known.length) return "Surface à préciser";
  const min = Math.min(...known),
    max = Math.max(...known);
  return `${min === max ? min : `${min}–${max}`} m²${spaces.length > 1 ? " / place" : ""}${known.length < spaces.length ? " · partiel" : ""}`;
}
