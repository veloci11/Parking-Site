import {
  money,
  type Listing,
  type Space,
  type SpaceOffer,
  type SpaceOfferStatus,
  type TransactionType,
} from "./types";

type PriceListing = Pick<Listing, "priceCents" | "transactionType"> &
  Partial<Pick<Listing, "pricingMode" | "spaces" | "status" | "catalogMatch">>;

/** A sale amount must never silently become a monthly rent, or vice versa. */
export function lotOfferChange(
  listing: PriceListing,
  transactionType: TransactionType,
): Pick<Listing, "transactionType" | "priceCents"> | null {
  if (listing.pricingMode === "per_space") return null;
  return {
    transactionType,
    priceCents:
      transactionType === (listing.transactionType ?? "sale")
        ? listing.priceCents
        : 0,
  };
}
export const offerStatusLabels: Record<SpaceOfferStatus, string> = {
  available: "Disponible",
  reserved: "Réservée",
  sold: "Vendue",
  rented: "Louée",
  withdrawn: "Retirée",
};
export function offerStatusLabel(status: SpaceOfferStatus): string {
  return offerStatusLabels[status];
}
/** Legacy offers keep their whole-lot scope; an incomplete per-place offer is unavailable. */
export function spaceOffer(listing: PriceListing, space: Space): SpaceOffer {
  if (listing.pricingMode === "per_space")
    return (
      space.offer ?? {
        transactionType: listing.transactionType ?? "sale",
        priceCents: 0,
        status: "withdrawn",
      }
    );
  const transactionType = listing.transactionType ?? "sale";
  return {
    transactionType,
    priceCents: listing.priceCents,
    status:
      listing.status === "sold"
        ? transactionType === "rent"
          ? "rented"
          : "sold"
        : listing.status === "withdrawn"
          ? "withdrawn"
          : "available",
  };
}
export function availableOffers(
  listing: PriceListing,
  transactionType?: TransactionType,
): { space: Space; offer: SpaceOffer }[] {
  return (listing.spaces ?? [])
    .map((space) => ({ space, offer: spaceOffer(listing, space) }))
    .filter(
      ({ offer }) =>
        offer.status === "available" &&
        (!transactionType || offer.transactionType === transactionType),
    );
}
function amount(
  offer: Pick<SpaceOffer, "priceCents" | "transactionType">,
): string {
  return (
    money(offer.priceCents) +
    (offer.transactionType === "rent" ? " / mois" : "")
  );
}
export function spaceOfferPrice(listing: PriceListing, space: Space): string {
  const offer = spaceOffer(listing, space);
  return (
    (offer.priceCents > 0 ? amount(offer) : "Prix à préciser") +
    (listing.pricingMode === "per_space" ? " / place" : " · lot entier")
  );
}
export function listingPrice(
  listing: PriceListing,
  transactionType?: TransactionType,
): string {
  if (listing.pricingMode !== "per_space")
    return amount({
      priceCents: listing.priceCents,
      transactionType: listing.transactionType ?? "sale",
    });
  if (
    transactionType &&
    listing.catalogMatch?.transactionType === transactionType
  )
    return amount(listing.catalogMatch) + " / place";
  const offers = availableOffers(listing, transactionType);
  if (!offers.length) return "Aucune offre disponible";
  const price = (kind: TransactionType) => {
    const values = offers
      .filter(({ offer }) => offer.transactionType === kind)
      .map(({ offer }) => offer.priceCents);
    return values.length
      ? amount({ priceCents: Math.min(...values), transactionType: kind })
      : null;
  };
  const sale = price("sale"),
    rent = price("rent");
  if (sale && rent)
    return `Vente dès ${sale} / place · Location dès ${rent} / place`;
  return `${offers.length > 1 ? "Dès " : ""}${sale ?? rent} / place`;
}
export interface OfferFilters {
  transactionType?: TransactionType;
  minPrice?: number | null;
  maxPrice?: number | null;
  minArea?: number | null;
  type?: string | null;
  covered?: boolean | null;
  closed?: boolean | null;
  level?: number | null;
}
export interface CatalogOfferMatch {
  priceCents: number;
  spaceIds: string[];
  areaM2: number | null;
  spaceCount: number;
}
/** Every unit criterion is evaluated on the same available offer in per-space mode. */
export function catalogOfferMatch(
  listing: Listing,
  filters: OfferFilters,
): CatalogOfferMatch | null {
  const unitType = (space: Space) =>
    listing.type === "mixed"
      ? (listing.commercialDetails?.units[space.id]?.type ?? null)
      : listing.type;
  const area = (spaces: Space[]) =>
    spaces.length && spaces.every((s) => s.areaM2 !== null)
      ? Math.min(...spaces.map((s) => s.areaM2!))
      : null;
  if (listing.pricingMode !== "per_space") {
    const kinds = listing.spaces.map(unitType),
      a = area(listing.spaces);
    if (
      (listing.transactionType ?? "sale") !==
        (filters.transactionType ?? "sale") ||
      (filters.minPrice != null && listing.priceCents < filters.minPrice) ||
      (filters.maxPrice != null && listing.priceCents > filters.maxPrice) ||
      (filters.minArea != null && (a === null || a < filters.minArea)) ||
      (filters.type &&
        listing.type !== filters.type &&
        !kinds.includes(filters.type as "covered" | "box" | "outdoor")) ||
      (filters.covered != null &&
        kinds.every((k) => k === "covered" || k === "box") !==
          filters.covered) ||
      (filters.closed != null &&
        kinds.every((k) => k === "box") !== filters.closed) ||
      (filters.level != null &&
        !listing.spaces.some((s) => s.level === filters.level))
    )
      return null;
    return {
      priceCents: listing.priceCents,
      spaceIds: listing.spaces.map((s) => s.id),
      areaM2: a,
      spaceCount: listing.spaces.length,
    };
  }
  const matches = availableOffers(
    listing,
    filters.transactionType ?? "sale",
  ).filter(({ space, offer }) => {
    const kind = unitType(space);
    return (
      (filters.minPrice == null || offer.priceCents >= filters.minPrice) &&
      (filters.maxPrice == null || offer.priceCents <= filters.maxPrice) &&
      (filters.minArea == null ||
        (space.areaM2 !== null && space.areaM2 >= filters.minArea)) &&
      (!filters.type ||
        (filters.type === "mixed" && listing.type === "mixed") ||
        kind === filters.type) &&
      (filters.covered == null ||
        (kind === "covered" || kind === "box") === filters.covered) &&
      (filters.closed == null || (kind === "box") === filters.closed) &&
      (filters.level == null || space.level === filters.level)
    );
  });
  if (!matches.length) return null;
  return {
    priceCents: Math.min(...matches.map(({ offer }) => offer.priceCents)),
    spaceIds: matches.map(({ space }) => space.id),
    areaM2: area(matches.map(({ space }) => space)),
    spaceCount: matches.length,
  };
}
export function offerLabel(
  listing: Pick<Listing, "transactionType"> &
    Partial<Pick<Listing, "pricingMode" | "spaces" | "priceCents" | "status">>,
): string {
  if (listing.pricingMode === "per_space") {
    const offers = availableOffers({
      ...listing,
      priceCents: listing.priceCents ?? 0,
    });
    const sale = offers.some(({ offer }) => offer.transactionType === "sale"),
      rent = offers.some(({ offer }) => offer.transactionType === "rent");
    if (sale && rent) return "À vendre et à louer";
    if (rent) return "À louer";
    if (!sale) return "Indisponible";
  }
  return listing.transactionType === "rent" ? "À louer" : "À vendre";
}
/** Derived compatibility fields never add a sale price to a monthly rent. */
export function normalizeListingOffers<T extends PriceListing>(listing: T): T {
  if (listing.pricingMode !== "per_space") return listing;
  const offers = availableOffers(listing),
    kind =
      offers[0]?.offer.transactionType ??
      listing.spaces?.[0]?.offer?.transactionType ??
      listing.transactionType ??
      "sale";
  const prices = offers
    .filter(({ offer }) => offer.transactionType === kind)
    .map(({ offer }) => offer.priceCents);
  return {
    ...listing,
    transactionType: kind,
    priceCents: prices.length ? Math.min(...prices) : 0,
  };
}
