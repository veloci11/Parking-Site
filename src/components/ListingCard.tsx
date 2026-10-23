"use client";
import Link from "next/link";
import type { ReactNode } from "react";
import { listingPrice, availableOffers } from "@/lib/listing-price";
import { searchOfferSpaces } from "@/lib/search-offers";
import { isPublicShowcase } from "@/lib/public-showcase";
import { pricingScope } from "./ListingOffers";
import Image from "./SafePhoto";
import { Check, Heart, Layers3, Square } from "lucide-react";
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
  href,
  favoriteDisabled = false,
  onNavigate,
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
  href?: string;
  favoriteDisabled?: boolean;
  onNavigate?: () => void;
}) {
  const matched =
    listing.pricingMode === "per_space" &&
    listing.catalogMatch?.transactionType === transactionType
      ? listing.catalogMatch
      : undefined;
  const offerCount =
    matched?.spaceIds.length ??
    availableOffers(listing, transactionType).length;
  const offerTypes = new Set(
    availableOffers(listing, transactionType).map(
      ({ offer }) => offer.transactionType,
    ),
  );
  const offerLabel =
    offerTypes.size > 1
      ? "Vente et location"
      : (transactionType ?? [...offerTypes][0] ?? listing.transactionType) ===
          "rent"
        ? "Location"
        : "Vente";
  return (
    <article
      className={`listing-card ${selected ? "is-selected" : ""}${listing.pricingMode === "per_space" ? " has-unit-offers" : ""}`}
    >
      <div className="listing-photo">
        <CardTarget
          href={href}
          onSelect={onSelect}
          className="photo-select"
          label={`Consulter ${listing.title}`}
          onNavigate={onNavigate}
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
            sizes={
              href
                ? "(max-width:600px) 100vw, (max-width:1023px) 50vw, (max-width:1440px) 33vw, 420px"
                : "(max-width:767px) 50vw, 360px"
            }
            loading={eager ? "eager" : "lazy"}
          />
        </CardTarget>
        {!isPublicShowcase(listing.id) ? (
          <button
            className={`favorite-button ${favorite ? "is-favorite" : ""}`}
            onClick={onFavorite}
            disabled={favoriteDisabled}
            aria-label={
              favorite ? "Retirer des favoris" : "Ajouter aux favoris"
            }
            aria-pressed={favorite}
          >
            <Heart size={23} fill={favorite ? "currentColor" : "none"} />
          </button>
        ) : null}
        {listing.sceneAvailable ? (
          <span className="photo-tag">
            <Layers3 size={14} />
            Plan 3D
          </span>
        ) : null}
      </div>
      <CardTarget
        href={href}
        onSelect={onSelect}
        onNavigate={onNavigate}
        className="listing-summary"
      >
        <span className="listing-offer-label">
          {offerLabel}
          {listing.isDemo ? " · Démonstration" : ""}
        </span>
        <span className="listing-title">
          {listing.city} · {listing.district}
        </span>
        <strong className="listing-price">
          {listingPrice(listing, transactionType)}
        </strong>
        <span className="listing-meta">
          {typeLabels[listing.type]} ·{" "}
          {areaLabel(searchOfferSpaces(listing, transactionType))}
        </span>
      </CardTarget>
      <div className="listing-card-footer">
        <span className="subtle-label">
          {listing.pricingMode === "per_space"
            ? `${offerCount} place${offerCount > 1 ? "s" : ""} ${matched ? "correspondante" : "disponible"}${offerCount > 1 ? "s" : ""} · prix par place`
            : `${listing.spaces.length} place${listing.spaces.length > 1 ? "s" : ""} · ${pricingScope(listing)}`}
        </span>
        {onCompare ? (
          <button
            type="button"
            className={`listing-compare-button ${compare ? "is-checked" : ""}`}
            onClick={onCompare}
            aria-pressed={compare}
            aria-label={`${compare ? "Retirer de la comparaison" : "Comparer"} : ${listing.title}`}
          >
            {compare ? <Check size={16} /> : <Square size={16} />}
            {compare ? "Sélectionné" : "Comparer"}
          </button>
        ) : null}
      </div>
    </article>
  );
}

function CardTarget({
  href,
  onSelect,
  className,
  label,
  children,
  onNavigate,
}: {
  href?: string;
  onSelect: () => void;
  className: string;
  label?: string;
  children: ReactNode;
  onNavigate?: () => void;
}) {
  return href ? (
    <Link
      href={href}
      prefetch={false}
      className={className}
      aria-label={label}
      onNavigate={onNavigate}
    >
      {children}
    </Link>
  ) : (
    <button
      type="button"
      onClick={onSelect}
      className={className}
      aria-label={label}
    >
      {children}
    </button>
  );
}
