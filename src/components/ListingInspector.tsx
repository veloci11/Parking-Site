"use client";
import { listingPrice } from "@/lib/listing-price";
import { searchOfferSpaces } from "@/lib/search-offers";
import { pricingScope } from "./ListingOffers";
import PreparedPhotos from "./PreparedPhotos";
import { ParkingKindIcon } from "./ParkingKindIcon";
import { accessLabel } from "@/lib/access-label";
import { parkingSpaceLocation } from "@/lib/parking-lots";
import Link from "next/link";
import { useEffect, useId, useRef, useState } from "react";
import { isPublicShowcase } from "@/lib/public-showcase";
import {
  ChevronLeft,
  ChevronRight,
  Heart,
  LockKeyhole,
  Maximize,
  X,
} from "lucide-react";
import {
  areaLabel,
  money,
  type Listing,
  type TransactionType,
} from "@/lib/types";
export default function ListingInspector({
  listing,
  onClose,
  transactionType,
  favorite = false,
  favoriteDisabled = false,
  favoriteError,
  onFavorite,
  panel = false,
}: {
  listing: Listing;
  onClose: () => void;
  transactionType?: TransactionType;
  favorite?: boolean;
  favoriteDisabled?: boolean;
  favoriteError?: string;
  onFavorite?: () => void;
  panel?: boolean;
}) {
  const [index, setIndex] = useState(0);
  const backButton = useRef<HTMLButtonElement>(null);
  const favoriteNoteId = useId();
  useEffect(() => {
    setIndex(0);
    backButton.current?.parentElement?.focus({ preventScroll: true });
  }, [listing.id]);
  const visibleSpaces = searchOfferSpaces(listing, transactionType);
  const photos = listing.photos.length ? listing.photos : ["/demo/covered.png"];
  const showcase = isPublicShowcase(listing.id);
  const favoriteLabel = favorite
    ? "Retirer des favoris"
    : "Ajouter aux favoris";
  const announcementHref = `/annonces/${listing.id}/${listing.slug}${transactionType ? `?transactionType=${transactionType}` : ""}`;
  const panelFavorite = (
    <button
      type="button"
      className="icon-button detail-favorite"
      aria-label={favoriteLabel}
      aria-pressed={favorite}
      disabled={showcase || favoriteDisabled || !onFavorite}
      onClick={() => onFavorite?.()}
    >
      <Heart size={22} fill={favorite ? "currentColor" : "none"} />
    </button>
  );
  return (
    <aside
      className={`listing-inspector${panel ? " inspector-panel" : ""}`}
      aria-label="Le bien sélectionné"
      key={listing.id}
    >
      {panel ? (
        <div className="inspector-panel-header">
          <strong>{listingPrice(listing, transactionType)}</strong>
          {panelFavorite}
          {!showcase ? (
            <Link
              className="button button-primary"
              href={`${announcementHref}${announcementHref.includes("?") ? "&" : "?"}contact=1`}
            >
              Contacter
            </Link>
          ) : null}
          <button
            type="button"
            className="icon-button"
            onClick={onClose}
            aria-label="Fermer l’annonce"
          >
            <X size={20} />
          </button>
        </div>
      ) : (
        <div
          className="inspector-header"
          tabIndex={-1}
          aria-label="Aperçu de l’annonce"
        >
          <button
            ref={backButton}
            type="button"
            className="button button-secondary inspector-back-button"
            onClick={onClose}
          >
            Retour
          </button>
        </div>
      )}
      <div className="inspector-image">
        <div className="inspector-photo">
          <PreparedPhotos
            key={listing.id}
            photos={photos}
            index={index}
            alt={
              listing.isDemo
                ? "Illustration de démonstration du parking"
                : listing.title
            }
            width={640}
            height={420}
            sizes="(max-width:767px) calc(100vw - 32px), 360px"
          />
          {!panel ? (
            <button
              type="button"
              className="inspector-favorite-button"
              aria-label={favoriteLabel}
              aria-pressed={favorite}
              aria-describedby={showcase ? favoriteNoteId : undefined}
              title={
                showcase
                  ? "Favoris disponibles sur les annonces réelles"
                  : favoriteLabel
              }
              disabled={showcase || favoriteDisabled || !onFavorite}
              onClick={() => {
                if (!showcase) onFavorite?.();
              }}
            >
              <Heart
                size={22}
                fill={favorite ? "currentColor" : "none"}
                aria-hidden="true"
              />
            </button>
          ) : null}
          {photos.length > 1 ? (
            <div className="gallery-controls">
              <button
                className="gallery-arrow"
                onClick={() =>
                  setIndex((index - 1 + photos.length) % photos.length)
                }
                aria-label="Photo précédente"
              >
                <ChevronLeft size={18} />
              </button>
              <span>
                {index + 1} / {photos.length}
              </span>
              <button
                className="gallery-arrow"
                onClick={() => setIndex((index + 1) % photos.length)}
                aria-label="Photo suivante"
              >
                <ChevronRight size={18} />
              </button>
            </div>
          ) : (
            <span className="photo-counter">1 / 1</span>
          )}
        </div>
        {showcase ? (
          <p id={favoriteNoteId} className="inspector-favorite-note">
            Favoris disponibles sur les annonces réelles.
          </p>
        ) : null}
      </div>
      <div className="inspector-body">
        <p className="inspector-location">
          {listing.city} · {listing.district.split(" · ")[0]}
        </p>
        <h2>
          {panel
            ? listing.title
            : visibleSpaces.length > 1
              ? `${visibleSpaces.length} places${listing.pricingMode === "per_space" ? " à l’unité" : " en lot"}`
              : visibleSpaces[0]?.number
                ? `Place ${visibleSpaces[0].number}`
                : "Place de parking"}
        </h2>
        {visibleSpaces.length > 1 &&
        (!panel || visibleSpaces.some((space) => space.number.trim())) ? (
          <p className="inspector-spaces">
            {visibleSpaces.slice(0, 3).map((space) => (
              <span key={space.id}>{parkingSpaceLocation(space)}</span>
            ))}
            {visibleSpaces.length > 3 ? (
              <span>+ {visibleSpaces.length - 3} autres places</span>
            ) : null}
          </p>
        ) : null}
        {!panel ? (
          <p className="inspector-price">
            {listingPrice(listing, transactionType)}
          </p>
        ) : null}
        {listing.spaces.length > 1 ? (
          <span className="muted small">{pricingScope(listing)}</span>
        ) : null}
        <Link
          className="button button-primary full-width"
          href={announcementHref}
        >
          Consulter l’annonce
        </Link>
        {favoriteError && !showcase ? (
          <p className="inspector-favorite-error" role="alert">
            {favoriteError}
          </p>
        ) : null}
        <div className="feature-row">
          <span>
            <Maximize size={19} />
            {areaLabel(searchOfferSpaces(listing, transactionType))}
          </span>
          <span>
            <ParkingKindIcon type={listing.type} size={20} />
            {listing.type === "mixed"
              ? "Lot mixte"
              : listing.type === "box"
                ? "Box"
                : listing.type === "covered"
                  ? "Couvert"
                  : "Extérieur"}
          </span>
          {!panel ||
          !["À préciser", "Non renseigné"].includes(accessLabel(listing)) ? (
            <span>
              <LockKeyhole size={19} />
              {accessLabel(listing)}
            </span>
          ) : null}
        </div>
        {panel ? (
          <div className="inspector-key-points">
            <p>
              <span>Places proposées</span>
              <strong>{visibleSpaces.length}</strong>
            </p>
            {listing.annualChargesCents != null ? (
              <p>
                <span>Charges annuelles</span>
                <strong>{money(listing.annualChargesCents)}</strong>
              </p>
            ) : null}
            {listing.propertyTaxCents != null ? (
              <p>
                <span>Taxe foncière annuelle</span>
                <strong>{money(listing.propertyTaxCents)}</strong>
              </p>
            ) : null}
          </div>
        ) : null}
        {listing.locationPrecision === "exact_opt_in" && listing.address ? (
          <p className="inspector-description">{listing.address}</p>
        ) : null}
        {listing.isDemo ? (
          <p className="demo-caption">
            {isPublicShowcase(listing.id)
              ? "Démonstration : prix, photos et plan fictifs. Aucun bien proposé à cette adresse."
              : "Annonce de démonstration"}
          </p>
        ) : null}
      </div>
    </aside>
  );
}
