"use client";
import { listingPrice } from "@/lib/listing-price";
import { searchOfferSpaces } from "@/lib/search-offers";
import { pricingScope } from "./ListingOffers";
import Image from "./SafePhoto";
import { ParkingKindIcon } from "./ParkingKindIcon";
import { accessLabel } from "@/lib/access-label";
import Link from "next/link";
import { useState } from "react";
import { isPublicShowcase } from "@/lib/public-showcase";
import {
  ChevronLeft,
  ChevronRight,
  LockKeyhole,
  Maximize,
  X,
} from "lucide-react";
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
  const photos = listing.photos.length ? listing.photos : ["/demo/covered.png"];
  return (
    <aside
      className="listing-inspector"
      aria-label="Le bien sélectionné"
      key={listing.id}
    >
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
        <button
          className="icon-button close-inspector"
          onClick={onClose}
          aria-label="Fermer la fiche"
        >
          <X size={20} />
        </button>
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
          {listing.city} · {listing.district}
        </p>
        <h2>
          {listing.spaces.length > 1
            ? `${listing.spaces.length} places${listing.pricingMode === "per_space" ? " à l’unité" : " en lot"}`
            : listing.spaces[0]?.number
              ? `Place ${listing.spaces[0].number}`
              : "Place de parking"}
        </h2>
        <p className="inspector-price">
          {listingPrice(listing, transactionType)}
        </p>
        {listing.spaces.length > 1 ? (
          <span className="muted small">{pricingScope(listing)}</span>
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
          <span>
            <LockKeyhole size={19} />
            {accessLabel(listing)}
          </span>
        </div>
        <p className="inspector-description">
          {isPublicShowcase(listing.id)
            ? "Exemple fictif : prix, photos et plan 3D illustratifs. Aucun bien réel n’est proposé à cette adresse."
            : "Découvrez la place, son état et ses accès. Échangez avec l’annonceur pour organiser une visite."}
        </p>
        <Link
          className="button button-primary full-width"
          href={`/annonces/${listing.id}/${listing.slug}${transactionType ? `?transactionType=${transactionType}` : ""}`}
        >
          Consulter l’annonce
        </Link>
        {listing.isDemo ? (
          <p className="demo-caption">Bien et visuel de démonstration</p>
        ) : null}
      </div>
    </aside>
  );
}
