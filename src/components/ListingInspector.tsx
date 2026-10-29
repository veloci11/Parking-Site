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
  spaceLevelLabel,
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
  variant = "panel",
  expanded = false,
  onExpandedChange,
}: {
  listing: Listing;
  onClose: () => void;
  transactionType?: TransactionType;
  favorite?: boolean;
  favoriteDisabled?: boolean;
  favoriteError?: string;
  onFavorite?: () => void;
  variant?: "panel" | "sheet";
  expanded?: boolean;
  onExpandedChange?: (expanded: boolean) => void;
}) {
  const panel = variant === "panel";
  const [index, setIndex] = useState(0);
  const content = useRef<HTMLDivElement>(null);
  const dragStart = useRef<number | null>(null);
  const dragged = useRef(false);
  const contentId = useId();
  const favoriteNoteId = useId();
  useEffect(() => {
    setIndex(0);
    if (content.current) content.current.scrollTop = 0;
  }, [listing.id]);
  const visibleSpaces = searchOfferSpaces(listing, transactionType);
  const photos = listing.photos.length ? listing.photos : ["/demo/covered.png"];
  const description = listing.description
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^bonjour[,.!\s]+/i, "");
  const excerpt =
    description.length > 340
      ? `${description.slice(0, 337).replace(/\s+\S*$/, "")}…`
      : description;
  // Quote an explicit dated availability statement, without inferring a date.
  const availability = listing.description
    .split(/[.!?\n]+/)
    .map((text) => text.trim())
    .find(
      (text) =>
        text.length <= 180 &&
        /\bdisponib(?:les?|ilit[eé])(?:\s|$)/iu.test(text) &&
        /\b20\d{2}\b/.test(text),
    );
  const levels = visibleSpaces.every((space) => space.levelKnown !== false)
    ? [...new Set(visibleSpaces.map(spaceLevelLabel))]
    : [];
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
      aria-describedby={showcase ? favoriteNoteId : undefined}
      disabled={showcase || favoriteDisabled || !onFavorite}
      onClick={() => onFavorite?.()}
    >
      <Heart size={22} fill={favorite ? "currentColor" : "none"} />
    </button>
  );
  return (
    <aside
      className={`listing-inspector ${panel ? "inspector-panel" : "inspector-sheet"}`}
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
        <div className="inspector-sheet-header">
          <button
            type="button"
            className="inspector-sheet-handle"
            aria-label={expanded ? "Réduire l’aperçu" : "Agrandir l’aperçu"}
            aria-expanded={expanded}
            aria-controls={contentId}
            onPointerDown={(event) => {
              dragStart.current = event.clientY;
              dragged.current = false;
              event.currentTarget.setPointerCapture(event.pointerId);
            }}
            onPointerUp={(event) => {
              const distance =
                event.clientY - (dragStart.current ?? event.clientY);
              dragStart.current = null;
              if (Math.abs(distance) > 30) {
                dragged.current = true;
                onExpandedChange?.(distance < 0);
              }
            }}
            onPointerCancel={() => {
              dragStart.current = null;
              dragged.current = false;
            }}
            onClick={() => {
              if (!dragged.current) onExpandedChange?.(!expanded);
              dragged.current = false;
            }}
          >
            <span aria-hidden="true" />
          </button>
          <button
            type="button"
            className="icon-button"
            aria-label="Fermer l’annonce"
            onClick={onClose}
          >
            <X size={20} />
          </button>
        </div>
      )}
      <div className="inspector-content" ref={content} id={contentId}>
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
          <h2>{listing.title}</h2>
          {visibleSpaces.length > 1 &&
          visibleSpaces.some((space) => space.number.trim()) ? (
            <p className="inspector-spaces">
              {visibleSpaces.slice(0, 3).map((space) => (
                <span key={space.id}>{parkingSpaceLocation(space)}</span>
              ))}
              {visibleSpaces.length > 3 ? (
                <span>+ {visibleSpaces.length - 3} autres places</span>
              ) : null}
            </p>
          ) : null}
          {listing.spaces.length > 1 ? (
            <span className="muted small">{pricingScope(listing)}</span>
          ) : null}
          {panel ? (
            <Link
              className="button button-primary full-width"
              href={announcementHref}
            >
              Consulter l’annonce
            </Link>
          ) : null}
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
            {!["À préciser", "Non renseigné"].includes(accessLabel(listing)) ? (
              <span>
                <LockKeyhole size={19} />
                {accessLabel(listing)}
              </span>
            ) : null}
          </div>
          <div className="inspector-key-points">
            <p>
              <span>Places proposées</span>
              <strong>{visibleSpaces.length}</strong>
            </p>
            {levels.length ? (
              <p>
                <span>{levels.length > 1 ? "Niveaux" : "Niveau"}</span>
                <strong>{levels.join(" · ")}</strong>
              </p>
            ) : null}
            {listing.occupancy === "vacant" ||
            listing.occupancy === "occupied" ? (
              <p>
                <span>Occupation</span>
                <strong>
                  {listing.occupancy === "vacant" ? "Libre" : "Occupée"}
                </strong>
              </p>
            ) : null}
            {listing.sellerName ? (
              <p>
                <span>Annonceur</span>
                <strong>{listing.sellerName}</strong>
                {listing.sellerTypeSnapshot ? (
                  <span>
                    {listing.sellerTypeSnapshot === "professional"
                      ? "Professionnel"
                      : "Particulier"}
                  </span>
                ) : null}
              </p>
            ) : null}
            {listing.sceneAvailable ? (
              <p>
                <span>Plan du parking</span>
                <strong>Vue 3D disponible</strong>
              </p>
            ) : null}
            {availability ? (
              <p className="inspector-key-wide">
                <span>Disponibilité annoncée</span>
                <strong>{availability}</strong>
              </p>
            ) : null}
          </div>
          {excerpt ? (
            <div className="inspector-excerpt">
              <h3>Description</h3>
              <p>{excerpt}</p>
            </div>
          ) : null}
          {listing.annualChargesCents != null ||
          listing.propertyTaxCents != null ? (
            <div
              className="inspector-key-points inspector-costs"
              aria-label="Charges et taxe foncière"
            >
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
      </div>
      {!panel ? (
        <div className="inspector-sheet-actions">
          <strong>{listingPrice(listing, transactionType)}</strong>
          {panelFavorite}
          <Link className="button button-primary" href={announcementHref}>
            Consulter l’annonce
          </Link>
        </div>
      ) : null}
    </aside>
  );
}
