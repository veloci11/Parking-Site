"use client";
import { listingPrice } from "@/lib/listing-price";
import { searchOfferSpaces } from "@/lib/search-offers";
import { pricingScope } from "./ListingOffers";
import Image from "./SafePhoto";
import { ParkingKindIcon } from "./ParkingKindIcon";
import { accessLabel } from "@/lib/access-label";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { isPublicShowcase } from "@/lib/public-showcase";
import { ChevronLeft, ChevronRight, LockKeyhole, Maximize } from "lucide-react";
import { areaLabel, type Listing, type TransactionType } from "@/lib/types";
export default function ListingInspector({
  listing,
  onClose,
  transactionType,
}: {
  listing: Listing;
  onClose: () => void;
  transactionType?: TransactionType;
}) {
  const [index, setIndex] = useState(0);
  const backButton = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    setIndex(0);
    backButton.current?.parentElement?.focus({ preventScroll: true });
  }, [listing.id]);
  const visibleSpaces = searchOfferSpaces(listing, transactionType);
  const photos = listing.photos.length ? listing.photos : ["/demo/covered.png"];
  return (
    <aside
      className="listing-inspector"
      aria-label="Le bien sélectionné"
      key={listing.id}
    >
      <div
        className="inspector-header"
        tabIndex={-1}
        aria-label="Aperçu de l’annonce"
      >
        <button ref={backButton} className="text-button" onClick={onClose}>
          Retour
        </button>
      </div>
      <div className="inspector-image">
        <Image
          src={photos[index % photos.length]}
          alt={
            listing.isDemo
              ? "Illustration de démonstration du parking"
              : listing.title
          }
          width={640}
          height={420}
          sizes="360px"
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
      <div className="inspector-body">
        <p className="inspector-location">
          {listing.city} · {listing.district.split(" · ")[0]}
        </p>
        <h2>
          {visibleSpaces.length > 1
            ? `${visibleSpaces.length} places${listing.pricingMode === "per_space" ? " à l’unité" : " en lot"}`
            : visibleSpaces[0]?.number
              ? `Place ${visibleSpaces[0].number}`
              : "Place de parking"}
        </h2>
        <p className="inspector-price">
          {listingPrice(listing, transactionType)}
        </p>
        {listing.spaces.length > 1 ? (
          <span className="muted small">{pricingScope(listing)}</span>
        ) : null}
        <Link
          className="button button-primary full-width"
          href={`/annonces/${listing.id}/${listing.slug}${transactionType ? `?transactionType=${transactionType}` : ""}`}
        >
          Consulter l’annonce
        </Link>
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
          <span>
            <LockKeyhole size={19} />
            {accessLabel(listing)}
          </span>
        </div>
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
