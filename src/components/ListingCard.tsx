"use client";
import { listingPrice, availableOffers } from "@/lib/listing-price";
import { pricingScope } from "./ListingOffers";
import Image from "./SafePhoto";
import { Heart, Layers3, ScanEye } from "lucide-react";
import {
  areaLabel,
  typeLabels,
  type Listing,
  type TransactionType,
} from "@/lib/types";
export default function ListingCard({
  listing,
  selected,
  onSelect,
  favorite,
  onFavorite,
  compare,
  onCompare,
  eager = false,
  transactionType,
}: {
  listing: Listing;
  selected?: boolean;
  onSelect: () => void;
  favorite: boolean;
  onFavorite: () => void;
  compare?: boolean;
  onCompare?: () => void;
  eager?: boolean;
  transactionType?: TransactionType;
}) {
  const matched =
    listing.pricingMode === "per_space" &&
    listing.catalogMatch?.transactionType === transactionType
      ? listing.catalogMatch
      : undefined;
  const offerCount =
    matched?.spaceIds.length ??
    availableOffers(listing, transactionType).length;
  return (
    <article
      className={`listing-card ${selected ? "is-selected" : ""}${listing.pricingMode === "per_space" ? " has-unit-offers" : ""}`}
    >
      <div className="listing-photo">
        <button
          onClick={onSelect}
          className="photo-select"
          aria-label={`Voir ${listing.title}`}
        >
          <Image
            src={listing.photos[0] || "/demo/covered.png"}
            alt={
              listing.isDemo
                ? `Illustration de démonstration · ${typeLabels[listing.type]}`
                : listing.title
            }
            width={600}
            height={360}
            sizes="(max-width:767px) 50vw, 360px"
            loading={eager ? "eager" : "lazy"}
          />
        </button>
        <button
          className={`favorite-button ${favorite ? "is-favorite" : ""}`}
          onClick={onFavorite}
          aria-label={favorite ? "Retirer des favoris" : "Ajouter aux favoris"}
          aria-pressed={favorite}
        >
          <Heart size={23} fill={favorite ? "currentColor" : "none"} />
        </button>
        {listing.sceneAvailable ? (
          <span className="photo-tag">
            <Layers3 size={14} />
            Plan 3D
          </span>
        ) : null}
      </div>
      <button onClick={onSelect} className="listing-summary">
        <span className="listing-title">
          {listing.city} · {listing.district}
        </span>
        <strong className="listing-price">
          {listingPrice(listing, transactionType)}
        </strong>
        <span className="listing-meta">
          {typeLabels[listing.type]} · {areaLabel(listing.spaces)}
        </span>
      </button>
      <div className="listing-card-footer">
        <span className="subtle-label">
          {listing.pricingMode === "per_space"
            ? `${offerCount} place${offerCount > 1 ? "s" : ""} ${matched ? "correspondante" : "disponible"}${offerCount > 1 ? "s" : ""} · prix par place`
            : `${listing.spaces.length} place${listing.spaces.length > 1 ? "s" : ""} · ${pricingScope(listing)}`}
        </span>
        {onCompare ? (
          <button
            className={`text-button ${compare ? "is-checked" : ""}`}
            onClick={onCompare}
            aria-pressed={compare}
          >
            <ScanEye size={14} />
            {compare ? "Ajouté" : "Comparer"}
          </button>
        ) : null}
      </div>
    </article>
  );
}
