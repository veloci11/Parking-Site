export type ListingStatus =
  | "draft"
  | "pending"
  | "published"
  | "changes_requested"
  | "rejected"
  | "expired"
  | "suspended"
  | "paused"
  | "sold"
  | "withdrawn";
export type ParkingType = "covered" | "box" | "outdoor" | "mixed";
export type TransactionType = "sale" | "rent";
export interface FinancialSource {
  year: number | null;
  scope: string;
  sourceKind: "unknown" | "seller_declared" | "provided_document";
  sourceDocumentIds: string[];
}
export interface UnitDetails {
  type?: Exclude<ParkingType, "mixed">;
  levelLabel: string;
  privateLotReference?: string;
  dimensionSource: "unknown" | "seller_declared" | "measured" | "plan_derived";
  dimensionObservedAt: string | null;
  sourceDocumentIds?: string[];
  limitingPoint: string;
}
export interface CommercialDetails {
  postalCode: string;
  units: Record<string, UnitDetails>;
  access: Record<
    "gate" | "door" | "badge" | "key" | "lift",
    "unknown" | "present" | "absent"
  >;
  chargesSource: FinancialSource;
  taxSource: FinancialSource;
  rentalIncome: {
    amountCents: number | null;
    period: "month" | "year";
    observedAt: string | null;
    sourceKind: "unknown" | "seller_declared" | "provided_document";
    sourceDocumentIds: string[];
  } | null;
  photoMetadata: Record<string, { caption: string; takenAt: string | null }>;
}
export type ConditionCategory =
  | "floor"
  | "walls_ceiling"
  | "humidity"
  | "lighting"
  | "markings_cleanliness"
  | "maneuver"
  | "clearance_access"
  | "security"
  | "space";
export interface ConditionObservation {
  id: string;
  spaceId: string | null;
  category: ConditionCategory;
  value: string;
  comment: string;
  sourceKind:
    "seller_declared" | "photo_documented" | "measured" | "plan_derived";
  observedAt: string | null;
  evidenceMediaIds: string[];
  sourceDocumentIds?: string[];
  /** Private server attribution. Never part of a public projection. */
  observerId?: string;
  confidenceScope: "common_declared" | "unit_declared";
}
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
  /** Legacy absence means sale. priceCents is the whole lot sale price or its monthly rent. */
  transactionType?: TransactionType;
  type: ParkingType;
  spaces: Space[];
  photos: string[];
  spacePhotos?: Record<string, string[]>;
  quality: Quality;
  /** Per-place observations; missing entries stay unknown, never inherit lot-wide quality. */
  unitQuality?: Record<string, Quality>;
  conditionObservations?: ConditionObservation[];
  commercialDetails?: CommercialDetails;
  publicCoordinates?: [number, number];
  locationConfirmedAt?: string | null;
  locationPrecision: "area" | "exact_opt_in";
  coordinates: [number, number];
  address?: string;
  sceneAvailable: boolean;
  isDemo: boolean;
  status: ListingStatus;
  version: number;
  sellerName: string;
  sellerTypeSnapshot?: "private" | "professional" | null;
  createdAt: string;
  updatedAt: string;
  availabilityConfirmedAt?: string | null;
  availabilityExpiresAt?: string | null;
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
  sellerType?: "private" | "professional" | null;
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
  mixed: "Lot mixte",
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
  return `${min === max ? min : `${min}–${max}`} m²${spaces.length > 1 ? " / place" : ""}${known.length < spaces.length ? ` · ${known.length}/${spaces.length} surfaces renseignées` : ""}`;
}

export interface AdminUser {
  id: string;
  name: string;
  role: User["role"];
  status: "active" | "suspended" | "deletion_pending" | "deleted";
  version: number;
  sellerType?: "private" | "professional" | null;
}
export interface AuditEntry {
  id: string;
  actorId: string | null;
  action: string;
  targetId: string | null;
  createdAt: string;
  requestId?: string | null;
  before?: Record<string, string | number | null> | null;
  after?: Record<string, string | number | null> | null;
}
