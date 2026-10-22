import {
  offerLabel,
  spaceOffer,
  spaceOfferPrice,
  offerStatusLabel,
} from "@/lib/listing-price";
import { type Listing, type Space } from "@/lib/types";

/** The scope belongs next to every displayed price, including legacy lot prices. */
export function pricingScope(listing: Listing): string {
  if (listing.pricingMode === "per_space")
    return "Prix par place · offres indépendantes";
  return listing.spaces.length > 1
    ? listing.transactionType === "rent"
      ? "Loyer mensuel total du lot"
      : "Prix total du lot"
    : listing.transactionType === "rent"
      ? "Loyer mensuel de la place"
      : "Prix de la place";
}

export function spacePrice(listing: Listing, space: Space): string {
  return spaceOfferPrice(listing, space);
}

export function spaceOfferLabel(listing: Listing, space: Space): string {
  return listing.pricingMode === "per_space" && !space.offer
    ? "Offre à renseigner"
    : listing.pricingMode === "per_space"
      ? spaceOffer(listing, space).transactionType === "rent"
        ? "À louer"
        : "À vendre"
      : offerLabel(listing);
}

export function spaceOfferStatus(listing: Listing, space: Space): string {
  return listing.pricingMode === "per_space" && !space.offer
    ? "Statut à renseigner"
    : offerStatusLabel(spaceOffer(listing, space).status);
}

export function SpaceOfferSummary({
  listing,
  space,
}: {
  listing: Listing;
  space: Space;
}) {
  return (
    <span>
      {spaceOfferLabel(listing, space)} ·{" "}
      <strong>{spacePrice(listing, space)}</strong>
      {` · ${spaceOfferStatus(listing, space)}`}
    </span>
  );
}

export function ListingOffersTable({ listing }: { listing: Listing }) {
  if (listing.pricingMode !== "per_space") return null;
  return (
    <div className="table-scroll">
      <table className="compare-table">
        <caption
          className="muted small"
          style={{ textAlign: "left", paddingBottom: 12 }}
        >
          Prix et disponibilité par place
        </caption>
        <thead>
          <tr>
            <th scope="col">Place / niveau</th>
            <th scope="col">Offre</th>
            <th scope="col">Prix de la place</th>
            <th scope="col">Statut</th>
          </tr>
        </thead>
        <tbody>
          {listing.spaces.map((space) => (
            <tr key={space.id}>
              <th scope="row">
                {space.number || "Non numérotée"} ·{" "}
                {space.level === 0 ? "RDC" : space.level}
              </th>
              <td>{spaceOfferLabel(listing, space)}</td>
              <td>{spacePrice(listing, space)}</td>
              <td>{spaceOfferStatus(listing, space)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
