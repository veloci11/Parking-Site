"use client";
import Image from "./SafePhoto";
import Link from "next/link";
import { useState } from "react";
import {
  ArrowUpRight,
  Box,
  ChevronLeft,
  ChevronRight,
  Layers3,
  LockKeyhole,
  Maximize,
  X,
} from "lucide-react";
import { areaLabel, money, typeLabels, type Listing } from "@/lib/types";
export default function ListingInspector({
  listing,
  onClose,
  onInterior,
}: {
  listing: Listing;
  onClose: () => void;
  onInterior: () => void;
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
            ? `Lot de ${listing.spaces.length} places`
            : `Place ${listing.spaces[0]?.number || ""}`}
        </h2>
        <p className="inspector-price">{money(listing.priceCents)}</p>
        {listing.spaces.length > 1 ? (
          <span className="muted small">Prix total du lot</span>
        ) : null}
        <div className="feature-row">
          <span>
            <Maximize size={19} />
            {areaLabel(listing.spaces)}
          </span>
          <span>
            <Box size={19} />
            {listing.type === "box"
              ? "Box"
              : listing.type === "covered"
                ? "Couvert"
                : "Extérieur"}
          </span>
          <span>
            <LockKeyhole size={19} />
            {listing.quality.access === "unknown"
              ? "À préciser"
              : "Accès décrit"}
          </span>
        </div>
        <p className="inspector-description">
          Découvrez la place, son état et ses accès. Échangez avec le vendeur
          pour organiser une visite.
        </p>
        {listing.sceneAvailable ? (
          <button
            className="button button-soft full-width"
            onClick={onInterior}
          >
            <Layers3 size={18} />
            Explorer le parking en 3D
            <ArrowUpRight size={16} />
          </button>
        ) : null}
        <Link
          className="button button-primary full-width"
          href={`/annonces/${listing.id}/${listing.slug}?contact=1`}
        >
          Demander une visite
          <ArrowUpRight size={18} />
        </Link>
        <Link
          className="full-detail-link"
          href={`/annonces/${listing.id}/${listing.slug}`}
        >
          Voir la fiche complète
        </Link>
        {listing.isDemo ? (
          <p className="demo-caption">Bien et visuel de démonstration</p>
        ) : null}
      </div>
    </aside>
  );
}
