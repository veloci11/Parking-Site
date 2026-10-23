"use client";
import { listingPrice, offerLabel, spaceOffer } from "@/lib/listing-price";
import { isPublicShowcase } from "@/lib/public-showcase";
import {
  pricingScope,
  SpaceOfferSummary,
  spacePrice,
  spaceOfferLabel,
  spaceOfferStatus,
} from "./ListingOffers";
import { loadPublicParkingGroup } from "@/lib/parking-client";
import type { PublicParkingSceneGroup } from "@/lib/parking-registry";
import { parkingListingGroupLabel } from "@/lib/parking-lots";
import {
  contactDraftKey,
  decodeContactDraft,
  contactSelectionContext,
  contactMessageBody,
} from "@/lib/contact-draft";
import Image from "./SafePhoto";
import PreparedPhotos from "./PreparedPhotos";
import Link from "next/link";
import dynamic from "next/dynamic";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Calendar,
  CheckCircle2,
  Heart,
  MapPin,
  MessageCircle,
  ShieldCheck,
  ChevronLeft,
  ChevronRight,
  X,
} from "lucide-react";
import { api, useSession } from "@/lib/client";
import { useFavorites } from "@/lib/favorites";
import { ConditionEvidenceSummary } from "./account/condition-evidence";
import { CommercialSummary, PhotoCaption } from "./CommercialSummary";
import {
  areaLabel,
  spaceLevelLabel,
  money,
  typeLabels,
  type Conversation,
  type Listing,
} from "@/lib/types";
const ParkingViewer = dynamic(() => import("./maps/ParkingViewer"), {
  ssr: false,
  loading: () => <div className="map-loading">Préparation du plan…</div>,
});
const qualityLabels = {
  floor: "État du sol",
  lighting: "Éclairage",
  humidity: "Humidité",
  access: "Accès",
  maneuver: "Manœuvre",
};
function EmbeddedPhotos({ listing }: { listing: Listing }) {
  const [index, setIndex] = useState(0);
  if (!listing.photos.length) return null;
  return (
    <div className="detail-embedded-gallery">
      <PreparedPhotos
        photos={listing.photos}
        index={index}
        alt={`${listing.title} · photo ${index + 1}`}
        width={800}
        height={600}
        sizes="(max-width:1279px) 350px, 440px"
      />
      {listing.photos.length > 1 ? (
        <div className="gallery-controls">
          <button
            type="button"
            className="gallery-arrow"
            aria-label="Photo précédente"
            onClick={() =>
              setIndex(
                (value) =>
                  (value + listing.photos.length - 1) % listing.photos.length,
              )
            }
          >
            <ChevronLeft size={18} />
          </button>
          <span>
            {index + 1} / {listing.photos.length}
          </span>
          <button
            type="button"
            className="gallery-arrow"
            aria-label="Photo suivante"
            onClick={() =>
              setIndex((value) => (value + 1) % listing.photos.length)
            }
          >
            <ChevronRight size={18} />
          </button>
        </div>
      ) : null}
    </div>
  );
}
export default function ListingDetail({
  listing: initialListing,
  embedded = false,
  onClose,
}: {
  listing: Listing;
  embedded?: boolean;
  onClose?: () => void;
}) {
  const Root = embedded ? "section" : "main";
  const [listing, setListing] = useState(initialListing);
  const showcase = isPublicShowcase(listing.id);
  const [unavailable, setUnavailable] = useState(false);
  const [freshnessError, setFreshnessError] = useState("");
  const [backHref, setBackHref] = useState("/");
  const [selectedSpaceId, setSelectedSpaceId] = useState<string | null>(null);
  const [focusedListingId, setFocusedListingId] = useState(initialListing.id);
  const [viewLevel, setViewLevel] = useState<number>();
  const offersHeading = useRef<HTMLHeadingElement>(null);
  function showOffers() {
    const heading = offersHeading.current;
    if (!heading) return;
    heading.focus({ preventScroll: true });
    heading.scrollIntoView({ block: "start", behavior: "auto" });
  }
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const space = initialListing.spaces.find(
      (item) => item.id === params.get("unit"),
    );
    setSelectedSpaceId(space?.id ?? null);
    setFocusedListingId(initialListing.id);
    setViewLevel(space?.levelKnown === false ? undefined : space?.level);
  }, [initialListing.id]);
  function chooseSpace(id: string) {
    const space = listing.spaces.find((item) => item.id === id);
    if (!space) return;
    setSelectedSpaceId(id);
    setFocusedListingId(listing.id);
    setViewLevel(space.levelKnown === false ? undefined : space.level);
  }
  const sendingLock = useRef(false);
  const requestIds = useRef({
    message: crypto.randomUUID(),
    visit: crypto.randomUUID(),
    context: "",
  });
  const { user, loading } = useSession();
  const favorites = useFavorites();
  const [parkingGroup, setParkingGroup] =
    useState<PublicParkingSceneGroup | null>(null);
  const focusedListing =
    focusedListingId === listing.id
      ? listing
      : (parkingGroup?.listings.find((item) => item.id === focusedListingId) ??
        listing);
  const relatedSelected = focusedListing.id !== listing.id;
  const selectedSpace = focusedListing.spaces.find(
    (space) => space.id === selectedSpaceId,
  );
  const contactContext = contactSelectionContext(focusedListing, selectedSpace);
  const contactTextLimit = 4000 - contactContext.length - 2;
  const contactReturnHref = `/annonces/${listing.id}/${listing.slug}?contact=1${selectedSpace && !relatedSelected ? `&unit=${encodeURIComponent(selectedSpace.id)}${selectedSpace.levelKnown === false ? "" : `&floor=${selectedSpace.level}`}` : ""}`;
  const focusedGroupLabel = parkingGroup
    ? parkingListingGroupLabel(
        parkingGroup,
        focusedListing.id,
        selectedSpace?.id,
      )
    : null;
  const selectedUnavailable =
    focusedListing.pricingMode === "per_space" &&
    selectedSpace !== undefined &&
    spaceOffer(focusedListing, selectedSpace).status !== "available";
  const isFavorite = favorites.ids.includes(focusedListing.id);
  const favoriteButton = !showcase ? (
    <button
      type="button"
      className="icon-button detail-favorite"
      disabled={favorites.loading}
      onClick={() => void favorites.toggle(focusedListing.id)}
      aria-label={isFavorite ? "Retirer des favoris" : "Ajouter aux favoris"}
      aria-pressed={isFavorite}
    >
      <Heart size={22} fill={isFavorite ? "currentColor" : "none"} />
    </button>
  ) : null;
  const displayedPrice = selectedSpace
    ? spacePrice(focusedListing, selectedSpace)
    : listingPrice(focusedListing);
  const selectedViewerSpaceId =
    parkingGroup?.levels
      .flatMap((level) => level.spaces)
      .find(
        (unit) =>
          unit.listingId === focusedListing.id &&
          unit.listingUnitId === selectedSpaceId,
      )?.id ?? selectedSpaceId;
  const focusedHref = `/annonces/${focusedListing.id}/${focusedListing.slug}${selectedSpace ? `?parking=${encodeURIComponent(focusedListing.id)}&unit=${encodeURIComponent(selectedSpace.id)}${selectedSpace.levelKnown === false ? "" : `&floor=${selectedSpace.level}`}` : ""}`;
  function chooseParkingSpace(id: string, unit: string) {
    const target =
      id === listing.id
        ? listing
        : parkingGroup?.listings.find((item) => item.id === id);
    const space = target?.spaces.find((item) => item.id === unit);
    if (!space) return;
    setFocusedListingId(id);
    setSelectedSpaceId(unit);
    setViewLevel(space.levelKnown === false ? undefined : space.level);
  }
  useEffect(() => {
    if (!parkingGroup) return;
    const rawUnit = new URLSearchParams(window.location.search).get("unit");
    const restored = parkingGroup.levels
      .flatMap((level) => level.spaces)
      .find((unit) => unit.id === rawUnit || unit.listingUnitId === rawUnit);
    if (restored)
      chooseParkingSpace(restored.listingId, restored.listingUnitId);
    // Restore once per parking; a freshness update must preserve the inspected offer.
  }, [parkingGroup?.parkingId]);
  const [parkingLoading, setParkingLoading] = useState(true);
  const [parkingError, setParkingError] = useState("");
  const [parkingAttempt, setParkingAttempt] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    setParkingLoading(true);
    setParkingError("");
    setParkingGroup(null);
    let pending = false;
    async function refreshParking() {
      if (pending || document.visibilityState !== "visible") return;
      pending = true;
      try {
        const group = await loadPublicParkingGroup(
          listing.id,
          controller.signal,
        );
        if (!controller.signal.aborted) {
          setParkingGroup(group);
          setParkingError("");
        }
      } catch (error) {
        if (!controller.signal.aborted)
          setParkingError((error as Error).message);
      } finally {
        pending = false;
        if (!controller.signal.aborted) setParkingLoading(false);
      }
    }
    void refreshParking();
    const timer = setInterval(() => void refreshParking(), 30000);
    const focus = () => void refreshParking();
    window.addEventListener("focus", focus);
    document.addEventListener("visibilitychange", focus);
    return () => {
      controller.abort();
      clearInterval(timer);
      window.removeEventListener("focus", focus);
      document.removeEventListener("visibilitychange", focus);
    };
  }, [listing.id, listing.version, parkingAttempt]);
  const hasParkingViewer =
    !parkingLoading &&
    !parkingError &&
    (parkingGroup
      ? parkingGroup.levels.some((level) => level.spaces.length > 0)
      : Boolean(listing.sceneAvailable));
  const [message, setMessage] = useState(
    "Bonjour, votre annonce m’intéresse. Est-il possible d’organiser une visite ?",
  );
  const [visit, setVisit] = useState(true);
  const [sending, setSending] = useState(false);
  const [draftNotice, setDraftNotice] = useState("");
  useEffect(() => {
    try {
      const saved = decodeContactDraft(
        sessionStorage.getItem(contactDraftKey(initialListing.id)),
      );
      if (saved) {
        setMessage(saved.message);
        setVisit(saved.visit);
        requestIds.current = {
          message: saved.messageRequestId,
          visit: saved.visitRequestId,
          context: saved.context || "",
        };
        setDraftNotice(
          "Votre texte préparé dans cet onglet a été restauré. Aucun message n’a encore été envoyé par cette reprise.",
        );
      }
    } catch {
      setDraftNotice(
        "Le stockage de cet onglet est indisponible : votre texte ne sera pas conservé pendant la connexion.",
      );
    }
  }, [initialListing.id]);
  function saveContactText(text: string, requestVisit: boolean) {
    if (requestIds.current.context !== contactContext) {
      requestIds.current.message = crypto.randomUUID();
      requestIds.current.context = contactContext;
    }
    try {
      sessionStorage.setItem(
        contactDraftKey(listing.id),
        JSON.stringify({
          message: text,
          visit: requestVisit,
          messageRequestId: requestIds.current.message,
          visitRequestId: requestIds.current.visit,
          context: requestIds.current.context,
        }),
      );
      setDraftNotice(
        "Texte conservé dans cet onglet uniquement, jusqu’à l’envoi ou sa fermeture.",
      );
    } catch {
      setDraftNotice(
        "Texte non sauvegardé dans cet onglet. Copiez-le avant de vous connecter.",
      );
    }
  }
  function editContactText(text: string) {
    if (text !== message) requestIds.current.message = crypto.randomUUID();
    setMessage(text);
    saveContactText(text, visit);
  }
  function editVisit(value: boolean) {
    setVisit(value);
    saveContactText(message, value);
  }

  const [error, setError] = useState("");
  const [report, setReport] = useState(false);
  const [reportReason, setReportReason] = useState("");
  const [reported, setReported] = useState(false);
  const contact = useRef<HTMLElement>(null);
  const router = useRouter();
  useEffect(() => {
    if (new URLSearchParams(window.location.search).get("contact") === "1")
      contact.current?.scrollIntoView({
        block: "center",
        behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches
          ? "instant"
          : "smooth",
      });
  }, []);
  useEffect(() => {
    const saved = sessionStorage.getItem("gp:explore:href");
    if (
      saved &&
      /^\/(?:explorer|favoris)?(?:\?|$)/.test(saved) &&
      !saved.startsWith("//")
    )
      setBackHref(saved);
    async function refresh() {
      if (document.visibilityState !== "visible") return;
      try {
        const response = await fetch(`/api/listings/${initialListing.id}`, {
          cache: "no-store",
        });
        if (response.status === 404) {
          setUnavailable(true);
          return;
        }
        const result = await response.json();
        if (!response.ok)
          throw new Error(
            "L’état actuel de l’annonce n’a pas pu être vérifié.",
          );
        setListing(result.data);
        setUnavailable(false);
        setFreshnessError("");
      } catch (e) {
        setFreshnessError((e as Error).message);
      }
    }
    const timer = setInterval(() => void refresh(), 30000);
    const focus = () => void refresh();
    window.addEventListener("focus", focus);
    document.addEventListener("visibilitychange", focus);
    return () => {
      clearInterval(timer);
      window.removeEventListener("focus", focus);
      document.removeEventListener("visibilitychange", focus);
    };
  }, [initialListing.id]);
  async function send(e: React.FormEvent) {
    e.preventDefault();
    if (
      sendingLock.current ||
      showcase ||
      unavailable ||
      selectedUnavailable ||
      relatedSelected
    )
      return;
    sendingLock.current = true;
    setSending(true);
    setError("");
    if (requestIds.current.context !== contactContext) {
      requestIds.current.message = crypto.randomUUID();
      requestIds.current.context = contactContext;
    }
    const snapshot = {
      body: contactMessageBody(contactContext, message),
      messageRequestId: requestIds.current.message,
      visitRequestId: requestIds.current.visit,
      visit,
    };
    saveContactText(message, visit);
    try {
      if (snapshot.body.length > 4000)
        throw new Error(
          `Raccourcissez votre message à ${contactTextLimit} caractères pour inclure la place concernée.`,
        );
      const c = await api<Conversation>("/api/conversations", {
        method: "POST",
        body: JSON.stringify({ listingId: listing.id }),
      });
      await api(`/api/conversations/${c.id}/messages`, {
        method: "POST",
        body: JSON.stringify({
          body: snapshot.body,
          clientRequestId: snapshot.messageRequestId,
        }),
      });
      if (snapshot.visit)
        await api(`/api/conversations/${c.id}/visit-requests`, {
          method: "POST",
          body: JSON.stringify({ clientRequestId: snapshot.visitRequestId }),
        });
      try {
        sessionStorage.removeItem(contactDraftKey(listing.id));
      } catch {
        /* The server acknowledgement remains valid if local cleanup is unavailable. */
      }
      setDraftNotice("");
      router.push(`/compte/messages/${c.id}`);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      sendingLock.current = false;
      setSending(false);
    }
  }
  async function sendReport(e: React.FormEvent) {
    e.preventDefault();
    try {
      await api("/api/reports", {
        method: "POST",
        body: JSON.stringify({ listingId: listing.id, reason: reportReason }),
      });
      setReported(true);
    } catch (e) {
      setError((e as Error).message);
    }
  }
  if (unavailable)
    return (
      <Root id={embedded ? undefined : "main"} className="page-shell">
        <h1>Ce bien n’est plus disponible.</h1>
        <p>
          Cette annonce a été retirée ou n’est plus publique. Vos conversations
          existantes restent accessibles dans votre compte.
        </p>
        {embedded ? (
          <button type="button" className="button" onClick={onClose}>
            Fermer
          </button>
        ) : (
          <Link className="button" href={backHref}>
            Retour
          </Link>
        )}
      </Root>
    );
  return (
    <Root
      id={embedded ? undefined : "main"}
      className={`page-shell detail-page${embedded ? " detail-embedded" : ""}`}
    >
      {embedded ? (
        <div className="detail-embedded-actions">
          <strong aria-live="polite">{displayedPrice}</strong>
          {favoriteButton}
          {!showcase ? (
            <a
              className="button button-primary"
              href="#contact"
              onClick={(event) => {
                event.preventDefault();
                contact.current?.scrollIntoView({
                  block: "start",
                  behavior: "smooth",
                });
              }}
            >
              Contacter
            </a>
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
      ) : null}
      {freshnessError ? (
        <p role="status" className="notice">
          {freshnessError} Les données affichées peuvent avoir changé.
        </p>
      ) : null}
      {!embedded ? (
        <Link href={backHref} className="button button-secondary">
          Retour
        </Link>
      ) : null}
      <div className="section-row" style={{ marginTop: 24 }}>
        <div>
          <p className="eyebrow">
            {listing.city} · {listing.district}
          </p>
          <h1>{listing.title}</h1>
        </div>
      </div>
      {listing.isDemo ? (
        <p className="notice">
          Bien fictif de démonstration. Les photos sont des illustrations et le
          plan 3D est schématique ; ils ne décrivent aucun parking réel à
          vendre.
        </p>
      ) : null}
      <div className="detail-layout">
        <div>
          {hasParkingViewer ? (
            <>
              <section
                aria-label="Le parking et ses places"
                className="detail-parking-section"
              >
                <div className="detail-viewer">
                  <ParkingViewer
                    listing={listing}
                    group={parkingGroup ?? undefined}
                    selectedSpaceId={selectedViewerSpaceId}
                    viewLevel={viewLevel}
                    onSpaceSelect={chooseSpace}
                    onViewLevelChange={(level) => {
                      setViewLevel(level);
                    }}
                    onListingSelect={chooseParkingSpace}
                  />
                </div>
                {selectedSpace ? (
                  <p className="notice" role="status" aria-live="polite">
                    {focusedGroupLabel ? (
                      <strong>{focusedGroupLabel} · </strong>
                    ) : null}
                    {relatedSelected ? (
                      <>
                        <strong>{focusedListing.title}</strong>
                        <br />
                      </>
                    ) : null}
                    Place {selectedSpace.number || "non numérotée"} · niveau{" "}
                    {spaceLevelLabel(selectedSpace)} :{" "}
                    <SpaceOfferSummary
                      listing={focusedListing}
                      space={selectedSpace}
                    />
                  </p>
                ) : listing.pricingMode === "per_space" ? (
                  <p className="muted small">
                    Sélectionnez une place pour consulter son prix et sa
                    disponibilité.
                  </p>
                ) : null}
              </section>
              <details className="detail-photo-fold">
                <summary>Photos de l’annonce ({listing.photos.length})</summary>
                <div className="detail-gallery">
                  {listing.photos.length ? (
                    listing.photos.map((photo, i) => (
                      <Image
                        key={photo}
                        src={photo}
                        alt={
                          listing.isDemo
                            ? `Illustration de démonstration ${i + 1}`
                            : `${listing.title} — photo ${i + 1}`
                        }
                        width={900}
                        height={600}
                        sizes="(max-width:767px) 100vw, 800px"
                        loading={i ? "lazy" : "eager"}
                      />
                    ))
                  ) : (
                    <div className="notice">
                      Le vendeur n’a pas ajouté de photo.
                    </div>
                  )}
                </div>
              </details>
            </>
          ) : (
            <>
              {embedded ? (
                <EmbeddedPhotos key={listing.id} listing={listing} />
              ) : (
                <div className="detail-gallery">
                  {listing.photos.length ? (
                    listing.photos.map((photo, i) => (
                      <Image
                        key={photo}
                        src={photo}
                        alt={
                          listing.isDemo
                            ? `Illustration de démonstration ${i + 1}`
                            : `${listing.title} — photo ${i + 1}`
                        }
                        width={900}
                        height={600}
                        sizes="(max-width:767px) 100vw, 800px"
                        loading={i ? "lazy" : "eager"}
                      />
                    ))
                  ) : (
                    <div className="notice">
                      Le vendeur n’a pas ajouté de photo.
                    </div>
                  )}
                </div>
              )}
              {parkingLoading ? (
                <p className="small muted" role="status">
                  Chargement du parking…
                </p>
              ) : parkingError ? (
                <p className="notice" role="status">
                  Le plan est momentanément indisponible.{" "}
                  <button
                    className="text-button"
                    onClick={() => setParkingAttempt((value) => value + 1)}
                  >
                    Réessayer
                  </button>
                </p>
              ) : (
                <p className="small muted">
                  Aucun plan 3D disponible pour le moment.
                </p>
              )}
            </>
          )}
          {embedded ? (
            <Link
              className="button button-primary full-width detail-open-announcement"
              href={focusedHref}
            >
              Consulter l’annonce
            </Link>
          ) : null}
          <div className="detail-facts">
            <div>
              <span>Type</span>
              <strong>{typeLabels[listing.type]}</strong>
            </div>
            <div>
              <span>Surface par place</span>
              <strong>{areaLabel(listing.spaces)}</strong>
            </div>
            <div>
              <span>Nombre de places</span>
              <strong>{listing.spaces.length}</strong>
            </div>
            <div>
              <span>Occupation</span>
              <strong>
                {listing.occupancy === "vacant"
                  ? "Libre"
                  : listing.occupancy === "occupied"
                    ? "Occupé"
                    : "À préciser"}
              </strong>
            </div>
            <div>
              <span>Charges annuelles</span>
              <strong>
                {listing.annualChargesCents != null
                  ? money(listing.annualChargesCents)
                  : "À préciser"}
              </strong>
            </div>
            <div>
              <span>Taxe foncière</span>
              <strong>
                {listing.propertyTaxCents != null
                  ? money(listing.propertyTaxCents)
                  : "À préciser"}
              </strong>
            </div>
          </div>
          <h2>Description</h2>
          <CommercialSummary listing={listing} />
          {listing.photos.map((url, index) =>
            listing.commercialDetails?.photoMetadata[
              url.split("/").at(-1) || ""
            ] ? (
              <div key={url}>
                <span className="muted small">Photo générale {index + 1}</span>
                <PhotoCaption listing={listing} url={url} />
              </div>
            ) : null,
          )}
          <p style={{ whiteSpace: "pre-line" }}>{listing.description}</p>
          <h2 style={{ marginTop: 32 }}>État du parking</h2>
          <p className="muted small">
            Informations du propriétaire
            {listing.observedAt
              ? ` · observations du ${new Date(listing.observedAt).toLocaleDateString("fr-FR", { timeZone: "UTC" })}`
              : ""}
            .
          </p>
          <div className="quality-grid">
            {Object.entries(qualityLabels).map(([key, label]) => (
              <div className="quality-item" key={key}>
                <span>{label}</span>
                <strong>
                  {listing.quality[key as keyof typeof listing.quality] ||
                    "Non renseigné"}
                </strong>
              </div>
            ))}
          </div>
          {listing.quality.observations ? (
            <p className="detail-condition-description">
              {listing.quality.observations}
            </p>
          ) : null}
          <ConditionEvidenceSummary values={listing.conditionObservations} />
          <h2 style={{ marginTop: 32 }}>Photos de chaque place</h2>
          <p className="muted small">
            Les photos de chaque place complètent les vues générales du parking.
          </p>
          {listing.spaces.map((space) => {
            const photos = listing.spacePhotos?.[space.id] || [];
            const quality = listing.unitQuality?.[space.id];
            return (
              <details className="unit-gallery card" key={space.id}>
                <summary>
                  Place {space.number} ·{" "}
                  {photos.length
                    ? `${photos.length} photo${photos.length > 1 ? "s" : ""} liée${photos.length > 1 ? "s" : ""} — couverture partielle déclarée`
                    : "aucune photo individuelle"}
                </summary>
                <ConditionEvidenceSummary
                  values={listing.conditionObservations}
                  spaceId={space.id}
                />
                <CommercialSummary listing={listing} spaceId={space.id} />
                {quality ? (
                  <div className="quality-grid">
                    <p className="muted small">
                      Origine déclarée :{" "}
                      {quality.basis === "seller_observation"
                        ? "observation du vendeur"
                        : quality.basis === "provided_document"
                          ? "document fourni"
                          : "à préciser"}
                      {quality.observedAt
                        ? ` · ${new Date(quality.observedAt).toLocaleDateString("fr-FR", { timeZone: "UTC" })}`
                        : " · date non renseignée"}
                      . Déclaration non certifiée par la plateforme.
                    </p>
                    {Object.entries(qualityLabels).map(([key, label]) => (
                      <div className="quality-item" key={key}>
                        <span>{label}</span>
                        <strong>
                          {quality[key as keyof typeof qualityLabels]}
                        </strong>
                      </div>
                    ))}
                    {quality.observations ? (
                      <p className="detail-condition-description">
                        {quality.observations}
                      </p>
                    ) : null}
                  </div>
                ) : (
                  <p className="muted small">
                    État individuel non renseigné ; les observations du lot ne
                    sont pas attribuées automatiquement à cette place.
                  </p>
                )}
                {photos.length ? (
                  <div className="unit-photo-grid">
                    {photos.map((photo, index) => (
                      <figure key={photo} style={{ margin: 0 }}>
                        <Image
                          src={photo}
                          alt={`${listing.isDemo ? "Illustration de démonstration" : "Photo déclarée"} — place ${space.number}, vue ${index + 1}`}
                          width={600}
                          height={400}
                          sizes="(max-width:767px) 100vw, 360px"
                        />
                        <figcaption>
                          <PhotoCaption listing={listing} url={photo} />
                        </figcaption>
                      </figure>
                    ))}
                  </div>
                ) : (
                  <p className="muted small">
                    Les particularités de cette place restent à vérifier. Les
                    vues générales ne documentent pas nécessairement ses
                    dimensions ou ses défauts.
                  </p>
                )}
              </details>
            );
          })}
          <h2
            ref={offersHeading}
            tabIndex={-1}
            style={{ marginTop: 32, scrollMarginTop: 24 }}
          >
            Places, prix et dimensions
          </h2>
          <p className="muted small">{pricingScope(listing)}</p>
          <div className="table-scroll">
            <table className="compare-table">
              <thead>
                <tr>
                  <th>Place / niveau</th>
                  <th>Offre</th>
                  <th>Prix</th>
                  <th>Statut</th>
                  <th>Surface</th>
                  <th>Longueur × largeur</th>
                  <th>Hauteur libre</th>
                </tr>
              </thead>
              <tbody>
                {listing.spaces.map((s) => (
                  <tr key={s.id}>
                    <td>
                      <button
                        type="button"
                        className="text-button"
                        aria-pressed={
                          !relatedSelected && selectedSpaceId === s.id
                        }
                        onClick={() => chooseSpace(s.id)}
                      >
                        {s.number || "Non numérotée"} · {spaceLevelLabel(s)}
                      </button>
                    </td>
                    <td>{spaceOfferLabel(listing, s)}</td>
                    <td>{spacePrice(listing, s)}</td>
                    <td>{spaceOfferStatus(listing, s)}</td>
                    <td>
                      {s.areaM2 == null ? "À préciser" : `${s.areaM2} m²`}
                    </td>
                    <td>
                      {s.lengthM == null || s.widthM == null
                        ? "À préciser"
                        : `${s.lengthM} × ${s.widthM} m`}
                    </td>
                    <td>
                      {s.clearanceM == null
                        ? "À préciser"
                        : `${s.clearanceM} m`}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="muted small" style={{ marginTop: 16 }}>
            <MapPin size={16} style={{ verticalAlign: "middle" }} />{" "}
            {listing.locationPrecision === "exact_opt_in" && listing.address
              ? listing.address
              : `${listing.city} · secteur ${listing.district}. L’adresse précise est communiquée par le vendeur.`}
          </p>
          <section
            ref={contact}
            id="contact"
            style={{ marginTop: 40, scrollMarginTop: 32 }}
          >
            {showcase ? (
              <>
                <h2>Annonce de démonstration</h2>
                <p className="notice">
                  Ces annonces, prix et plans sont fictifs. Vous pouvez explorer
                  les places et les niveaux ; les messages et demandes de visite
                  sont désactivés pour ces exemples.
                </p>
                <Link className="button button-secondary" href={backHref}>
                  Retour
                </Link>
              </>
            ) : (
              <>
                <h2>Contacter l’annonceur</h2>
                <p className="muted">
                  Posez vos questions à {focusedListing.sellerName} et convenez
                  d’une visite. Une demande n’est confirmée qu’après accord sur
                  un horaire.
                </p>
                {relatedSelected ? (
                  <div className="notice" role="status">
                    La place sélectionnée appartient à « {focusedListing.title}{" "}
                    », proposée par {focusedListing.sellerName}.
                    <p>
                      <Link
                        className="button button-secondary"
                        href={focusedHref}
                      >
                        Consulter cette annonce et ses offres
                      </Link>
                    </p>
                  </div>
                ) : selectedUnavailable && selectedSpace ? (
                  <div className="notice" role="status">
                    La place {selectedSpace.number} est{" "}
                    {spaceOfferStatus(listing, selectedSpace).toLocaleLowerCase(
                      "fr-FR",
                    )}{" "}
                    et ne peut pas faire l’objet d’une demande de visite.
                    <p>
                      Choisissez une autre place disponible dans cette annonce
                      pour contacter l’annonceur.
                    </p>
                    <button
                      type="button"
                      className="button button-secondary"
                      onClick={showOffers}
                    >
                      Voir toutes les offres
                    </button>
                  </div>
                ) : loading ? (
                  <p>Vérification de votre compte…</p>
                ) : !user ? (
                  <div className="card">
                    <MessageCircle size={24} />
                    <h3 style={{ marginTop: 16 }}>
                      Une conversation, pour commencer.
                    </h3>
                    <p className="muted">
                      Connectez-vous pour contacter le vendeur en privé.
                    </p>
                    <label htmlFor="visitor-message">
                      Préparer votre message avant connexion
                    </label>
                    <textarea
                      id="visitor-message"
                      className="input"
                      rows={4}
                      maxLength={contactTextLimit}
                      value={message}
                      onChange={(e) => editContactText(e.target.value)}
                    />
                    <label className="checkbox-field">
                      <input
                        type="checkbox"
                        checked={visit}
                        onChange={(e) => editVisit(e.target.checked)}
                      />
                      Demander aussi une visite après connexion
                    </label>
                    <p className="small muted">
                      Votre texte reste local à cet onglet. Il sera présenté
                      après connexion et envoyé uniquement lorsque vous
                      validerez le formulaire.
                    </p>
                    {draftNotice ? (
                      <p className="small muted" role="status">
                        {draftNotice}
                      </p>
                    ) : null}
                    <Link
                      className="button button-primary"
                      href={`/connexion?next=${encodeURIComponent(contactReturnHref)}`}
                    >
                      Se connecter
                    </Link>
                  </div>
                ) : !user.emailVerified ? (
                  <div className="notice">
                    Confirmez votre email pour envoyer un message.{" "}
                    <Link
                      href="/verifier-email"
                      style={{ textDecoration: "underline" }}
                    >
                      Vérifier mon email
                    </Link>
                  </div>
                ) : (
                  <form className="detail-contact" onSubmit={send}>
                    {draftNotice ? (
                      <p className="small muted" role="status">
                        {draftNotice}
                      </p>
                    ) : null}
                    <label htmlFor="message">Votre message</label>
                    <textarea
                      id="message"
                      minLength={5}
                      maxLength={contactTextLimit}
                      required
                      disabled={sending}
                      value={message}
                      onChange={(e) => editContactText(e.target.value)}
                    />
                    <label className="checkbox-field">
                      <input
                        type="checkbox"
                        checked={visit}
                        disabled={sending}
                        onChange={(e) => editVisit(e.target.checked)}
                      />
                      <Calendar size={18} />
                      Demander aussi une visite
                    </label>
                    {error ? (
                      <p className="error" role="alert">
                        {error}
                      </p>
                    ) : null}
                    <button
                      className="button button-primary"
                      disabled={sending}
                    >
                      {sending ? "Envoi en cours…" : "Envoyer au vendeur"}
                    </button>
                  </form>
                )}
              </>
            )}
          </section>
          {!showcase ? (
            <button
              style={{ marginTop: 24 }}
              className="text-button"
              onClick={() => setReport(!report)}
            >
              Signaler cette annonce
            </button>
          ) : null}
          {report ? (
            !user || !user.emailVerified ? (
              <div className="notice">
                Un compte avec email confirmé est nécessaire pour transmettre un
                signalement.{" "}
                <Link
                  href={`/connexion?next=${encodeURIComponent(`/annonces/${listing.id}/${listing.slug}`)}`}
                  style={{ textDecoration: "underline" }}
                >
                  Se connecter
                </Link>
              </div>
            ) : (
              <form className="detail-contact" onSubmit={sendReport}>
                {reported ? (
                  <p className="notice">
                    <CheckCircle2 size={18} />
                    Votre signalement a été transmis à la modération.
                  </p>
                ) : (
                  <>
                    <label className="field">
                      Motif du signalement
                      <textarea
                        required
                        minLength={10}
                        maxLength={2000}
                        value={reportReason}
                        onChange={(e) => setReportReason(e.target.value)}
                      />
                    </label>
                    {error ? (
                      <p className="error" role="alert">
                        {error}
                      </p>
                    ) : null}
                    <button className="button button-secondary">
                      Envoyer le signalement
                    </button>
                  </>
                )}
              </form>
            )
          ) : null}
        </div>
        {!embedded ? (
          <aside className="detail-side card">
            {relatedSelected ? (
              <h2 style={{ fontSize: 20 }}>{focusedListing.title}</h2>
            ) : null}
            <span className="badge">
              {focusedGroupLabel ? `${focusedGroupLabel} · ` : ""}
              {selectedSpace
                ? `Place ${selectedSpace.number} · ${spaceOfferLabel(focusedListing, selectedSpace)}`
                : offerLabel(focusedListing)}
            </span>
            <div className="detail-price-row">
              <p className="price" aria-live="polite">
                {displayedPrice}
              </p>
              {favoriteButton}
            </div>
            {favorites.error ? (
              <p className="error detail-favorite-error" role="alert">
                {favorites.error}
              </p>
            ) : null}
            <p className="small muted">
              {selectedSpace
                ? spaceOfferStatus(focusedListing, selectedSpace)
                : pricingScope(focusedListing)}
            </p>
            {!relatedSelected &&
            selectedSpace &&
            focusedListing.pricingMode === "per_space" ? (
              <button
                type="button"
                className="text-button"
                onClick={showOffers}
              >
                Voir toutes les offres
              </button>
            ) : null}
            <p className="muted">
              {typeLabels[focusedListing.type]}
              <br />
              {areaLabel(focusedListing.spaces)} ·{" "}
              {focusedListing.spaces.length} place
              {focusedListing.spaces.length > 1 ? "s" : ""}
            </p>
            {showcase ? (
              <p className="notice">
                Démonstration · Prix illustratif
                <br />
                Aucune vente ni visite pour cet exemple.
              </p>
            ) : selectedUnavailable ? (
              <button
                type="button"
                disabled
                className="button button-primary full-width"
              >
                Place indisponible
              </button>
            ) : relatedSelected ? (
              <Link
                className="button button-primary full-width"
                href={focusedHref}
              >
                Voir cette annonce et contacter
              </Link>
            ) : (
              <a className="button button-primary full-width" href="#contact">
                Demander une visite
              </a>
            )}
            <div
              style={{
                borderTop: "1px solid var(--border)",
                marginTop: 24,
                paddingTop: 24,
              }}
            >
              <ShieldCheck size={24} />
              <p style={{ marginTop: 12, marginBottom: 4, fontWeight: 600 }}>
                {focusedListing.sellerName}
              </p>
              <p className="small muted">
                {showcase
                  ? "Exemple de présentation, sans annonceur ni offre réelle à cette adresse."
                  : focusedListing.pricingMode === "per_space"
                    ? "Les prix et disponibilités sont propres à chaque place. Les paiements ne sont pas encaissés sur la plateforme ; les conditions sont à convenir avec l’annonceur."
                    : focusedListing.transactionType === "rent"
                      ? "Le loyer n’est pas encaissé sur la plateforme. Les conditions de location sont à convenir avec le bailleur."
                      : "Le prix d’achat du parking n’est pas encaissé sur la plateforme. La vente est formalisée avec les professionnels compétents."}
              </p>
            </div>
          </aside>
        ) : null}
      </div>
      {!embedded ? (
        <div className="detail-mobile-actions" aria-label="Prix et contact">
          <p className="detail-mobile-price" aria-live="polite">
            {displayedPrice}
          </p>
          {favoriteButton}
          {showcase ? null : selectedUnavailable ? (
            <button type="button" className="button button-primary" disabled>
              Indisponible
            </button>
          ) : relatedSelected ? (
            <Link className="button button-primary" href={focusedHref}>
              Voir l’annonce
            </Link>
          ) : (
            <a className="button button-primary" href="#contact">
              Contacter
            </a>
          )}
          {favorites.error ? (
            <p className="error detail-mobile-favorite-error" role="alert">
              {favorites.error}
            </p>
          ) : null}
        </div>
      ) : null}
    </Root>
  );
}
