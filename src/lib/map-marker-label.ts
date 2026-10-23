import { availableOffers } from "./listing-price";
import { money, type Listing, type TransactionType } from "./types";

type MapPriceListing = Pick<Listing, "priceCents" | "transactionType"> &
  Partial<Pick<Listing, "pricingMode" | "spaces" | "status" | "catalogMatch">>;

/** A small group at street scale exposes each offer without overlapping buttons. */
export function expandMapPrices(
  count: number,
  zoom: number,
  availableHeight = Infinity,
): boolean {
  return (
    count > 1 &&
    count <= 3 &&
    zoom >= 16 &&
    count * 52 - 8 + 24 <= availableHeight
  );
}

/** Prices remain visible when several public positions share one marker.
 * Monthly rents, whole lots and prices per place are never combined into a range.
 */
export function mapMarkerPriceLines(
  listings: readonly MapPriceListing[],
  transactionType?: TransactionType,
): string[] {
  const buckets = new Map<
    string,
    {
      kind: TransactionType;
      perPlace: boolean;
      prices: number[];
      from: boolean;
    }
  >();
  const add = (
    kind: TransactionType,
    perPlace: boolean,
    prices: number[],
    from = false,
  ) => {
    const valid = prices.filter((price) => Number.isFinite(price) && price > 0);
    if (!valid.length) return;
    const key = `${kind}:${perPlace}`;
    const previous = buckets.get(key);
    buckets.set(key, {
      kind,
      perPlace,
      prices: [...(previous?.prices ?? []), ...valid],
      from: from || !!previous?.from,
    });
  };
  for (const listing of listings) {
    if (listing.pricingMode !== "per_space") {
      const kind = listing.transactionType ?? "sale";
      if (!transactionType || transactionType === kind)
        add(kind, false, [listing.priceCents]);
      continue;
    }
    if (
      transactionType &&
      listing.catalogMatch?.transactionType === transactionType
    ) {
      add(
        transactionType,
        true,
        [listing.catalogMatch.priceCents],
        listing.catalogMatch.spaceIds.length > 1,
      );
      continue;
    }
    const offers = availableOffers(listing, transactionType);
    for (const kind of ["sale", "rent"] as const)
      add(
        kind,
        true,
        offers
          .filter(({ offer }) => offer.transactionType === kind)
          .map(({ offer }) => offer.priceCents),
      );
  }
  const values = [...buckets.values()].sort((a, b) =>
    a.kind === b.kind
      ? Number(a.perPlace) - Number(b.perPlace)
      : a.kind === "sale"
        ? -1
        : 1,
  );
  const mixedTransactions = new Set(values.map((item) => item.kind)).size > 1;
  const mixedScopes = new Set(values.map((item) => item.perPlace)).size > 1;
  return values.length
    ? values.map(({ kind, perPlace, prices, from }) => {
        const min = Math.min(...prices),
          max = Math.max(...prices);
        const range =
          min === max
            ? `${from ? "Dès " : ""}${money(min)}`
            : `${money(min).replace(/\s*€$/, "")}–${money(max)}`;
        return `${mixedTransactions ? (kind === "sale" ? "Vente " : "Location ") : ""}${range}${kind === "rent" ? " / mois" : ""}${perPlace ? " / place" : mixedScopes ? " / lot" : ""}`;
      })
    : ["Prix à préciser"];
}
