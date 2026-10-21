"use client";
import { listingPrice, offerLabel } from "@/lib/listing-price";
import { loadPublicParkingGroup } from "@/lib/parking-client";
import type { PublicParkingSceneGroup } from "@/lib/parking-registry";
import { contactDraftKey, decodeContactDraft } from "@/lib/contact-draft";
import Image from "./SafePhoto";
import Link from "next/link";
import dynamic from "next/dynamic";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  ArrowUpRight,
  Calendar,
  CheckCircle2,
  Heart,
  MapPin,
  MessageCircle,
  ShieldCheck,
} from "lucide-react";
import { api, useSession } from "@/lib/client";
import { useFavorites } from "@/lib/favorites";
import { ConditionEvidenceSummary } from "./account/condition-evidence";
import { CommercialSummary, PhotoCaption } from "./CommercialSummary";
import {
  areaLabel,
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
export default function ListingDetail({
  listing: initialListing,
}: {
  listing: Listing;
}) {
  const [listing, setListing] = useState(initialListing);
  const [unavailable, setUnavailable] = useState(false);
  const [freshnessError, setFreshnessError] = useState("");
  const [backHref, setBackHref] = useState("/");
  const sendingLock = useRef(false);
  const requestIds = useRef({
    message: crypto.randomUUID(),
    visit: crypto.randomUUID(),
  });
  const { user, loading } = useSession();
  const favorites = useFavorites();
  const [parkingGroup, setParkingGroup] =
    useState<PublicParkingSceneGroup | null>(null);
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
    try {
      sessionStorage.setItem(
        contactDraftKey(listing.id),
        JSON.stringify({
          message: text,
          visit: requestVisit,
          messageRequestId: requestIds.current.message,
          visitRequestId: requestIds.current.visit,
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
    if (sendingLock.current || unavailable) return;
    sendingLock.current = true;
    setSending(true);
    setError("");
    try {
      const c = await api<Conversation>("/api/conversations", {
        method: "POST",
        body: JSON.stringify({ listingId: listing.id }),
      });
      await api(`/api/conversations/${c.id}/messages`, {
        method: "POST",
        body: JSON.stringify({
          body: message,
          clientRequestId: requestIds.current.message,
        }),
      });
      if (visit)
        await api(`/api/conversations/${c.id}/visit-requests`, {
          method: "POST",
          body: JSON.stringify({ clientRequestId: requestIds.current.visit }),
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
      <main id="main" className="page-shell">
        <h1>Ce bien n’est plus disponible.</h1>
        <p>
          Cette annonce a été retirée ou n’est plus publique. Vos conversations
          existantes restent accessibles dans votre compte.
        </p>
        <Link className="button" href={backHref}>
          Retour à l’exploration
        </Link>
      </main>
    );
  return (
    <main id="main" className="page-shell">
      {freshnessError ? (
        <p role="status" className="notice">
          {freshnessError} Les données affichées peuvent avoir changé.
        </p>
      ) : null}
      <Link href={backHref} className="text-button">
        <ArrowLeft size={18} />
        Retour à l’exploration
      </Link>
      <div className="section-row" style={{ marginTop: 24 }}>
        <div>
          <p className="eyebrow">
            {listing.city} · {listing.district}
          </p>
          <h1>{listing.title}</h1>
        </div>
        <button
          className="icon-button"
          onClick={() => void favorites.toggle(listing.id)}
          aria-label={
            favorites.ids.includes(listing.id)
              ? "Retirer des favoris"
              : "Ajouter aux favoris"
          }
          aria-pressed={favorites.ids.includes(listing.id)}
        >
          <Heart
            size={24}
            fill={favorites.ids.includes(listing.id) ? "currentColor" : "none"}
            color={
              favorites.ids.includes(listing.id) ? "#6D28FF" : "currentColor"
            }
          />
        </button>
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
                    onListingSelect={(id, unit) => {
                      if (id === listing.id) return;
                      const target = parkingGroup?.listings.find(
                        (item) => item.id === id,
                      );
                      if (!target) return;
                      const floor = parkingGroup?.levels.find((level) =>
                        level.spaces.some(
                          (space) =>
                            space.listingId === id &&
                            space.listingUnitId === unit,
                        ),
                      )?.level;
                      const params = new URLSearchParams({ parking: id, unit });
                      if (floor !== undefined)
                        params.set("floor", String(floor));
                      router.push(
                        `/annonces/${target.id}/${target.slug}?${params}`,
                      );
                    }}
                  />
                </div>
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
          <h2>La place, dans les détails.</h2>
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
          <h2 style={{ marginTop: 32 }}>Un état clair, pour décider.</h2>
          <p className="muted small">
            Informations déclarées par le vendeur
            {listing.observedAt
              ? ` · observations du ${new Date(listing.observedAt).toLocaleDateString("fr-FR", { timeZone: "UTC" })}`
              : ""}
            . Une information manquante reste à vérifier lors de la visite.
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
            <p className="notice" style={{ marginTop: 16 }}>
              {listing.quality.observations}
            </p>
          ) : null}
          <ConditionEvidenceSummary values={listing.conditionObservations} />
          <h2 style={{ marginTop: 32 }}>Photos de chaque place</h2>
          <p className="muted small">
            Les vues générales et les photos liées à une place ont des
            périmètres distincts. Une photo ne constitue pas une vérification de
            toutes ses caractéristiques.
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
                      <p className="notice">{quality.observations}</p>
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
          <h2 style={{ marginTop: 32 }}>Dimensions et emplacement</h2>
          <div className="table-scroll">
            <table className="compare-table">
              <thead>
                <tr>
                  <th>Place / niveau</th>
                  <th>Surface</th>
                  <th>Longueur × largeur</th>
                  <th>Hauteur libre</th>
                </tr>
              </thead>
              <tbody>
                {listing.spaces.map((s) => (
                  <tr key={s.id}>
                    <td>
                      {s.number} · {s.level === 0 ? "RDC" : s.level}
                    </td>
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
            <h2>Rencontrez votre prochaine place.</h2>
            <p className="muted">
              Posez vos questions à {listing.sellerName} et convenez d’une
              visite. Une demande n’est confirmée qu’après accord sur un
              horaire.
            </p>
            {loading ? (
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
                  maxLength={4000}
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
                  Votre texte reste local à cet onglet. Il sera présenté après
                  connexion et envoyé uniquement lorsque vous validerez le
                  formulaire.
                </p>
                {draftNotice ? (
                  <p className="small muted" role="status">
                    {draftNotice}
                  </p>
                ) : null}
                <Link
                  className="button button-primary"
                  href={`/connexion?next=${encodeURIComponent(`/annonces/${listing.id}/${listing.slug}?contact=1`)}`}
                >
                  Se connecter
                  <ArrowUpRight size={17} />
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
                  maxLength={4000}
                  required
                  value={message}
                  onChange={(e) => editContactText(e.target.value)}
                />
                <label className="checkbox-field">
                  <input
                    type="checkbox"
                    checked={visit}
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
                <button className="button button-primary" disabled={sending}>
                  {sending ? "Envoi en cours…" : "Envoyer au vendeur"}
                  <ArrowUpRight size={18} />
                </button>
              </form>
            )}
          </section>
          <button
            style={{ marginTop: 24 }}
            className="text-button"
            onClick={() => setReport(!report)}
          >
            Signaler cette annonce
          </button>
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
        <aside className="detail-side card">
          <span className="badge">
            {offerLabel(listing)}
            {listing.spaces.length > 1
              ? listing.transactionType === "rent"
                ? " · loyer mensuel du lot"
                : " · prix total du lot"
              : ""}
          </span>
          <p className="price" style={{ margin: "16px 0" }}>
            {listingPrice(listing)}
          </p>
          <p className="muted">
            {typeLabels[listing.type]}
            <br />
            {areaLabel(listing.spaces)} · {listing.spaces.length} place
            {listing.spaces.length > 1 ? "s" : ""}
          </p>
          <a className="button button-primary full-width" href="#contact">
            Demander une visite
            <ArrowUpRight size={18} />
          </a>
          <div
            style={{
              borderTop: "1px solid var(--border)",
              marginTop: 24,
              paddingTop: 24,
            }}
          >
            <ShieldCheck size={24} />
            <p style={{ marginTop: 12, marginBottom: 4, fontWeight: 600 }}>
              {listing.sellerName}
            </p>
            <p className="small muted">
              {listing.transactionType === "rent"
                ? "Le loyer n’est pas encaissé sur la plateforme. Les conditions de location sont à convenir avec le bailleur."
                : "Le prix d’achat du parking n’est pas encaissé sur la plateforme. La vente est formalisée avec les professionnels compétents."}
            </p>
          </div>
        </aside>
      </div>
    </main>
  );
}
