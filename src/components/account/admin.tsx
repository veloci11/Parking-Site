"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  CheckCircle2,
  ClipboardCheck,
  RefreshCw,
  ShieldCheck,
  X,
} from "lucide-react";
import { AccountGate, AccountShell, api } from "./shared";
import Publications from "./publications";
import { QualitySummary } from "./unit-quality";
import { ConditionEvidenceSummary } from "./condition-evidence";
import { CommercialSummary } from "../CommercialSummary";
import { spaceLevelLabel, type Listing, type User } from "@/lib/types";
import { listingPrice, offerLabel } from "@/lib/listing-price";
import { pricingScope, ListingOffersTable } from "../ListingOffers";
import { AdminModelingRequests } from "./modeling-request";
import { filterAdminReviewItems } from "@/lib/admin-review-search";
import {
  isRevisionReviewed,
  moderationOutcome,
  type ReviewedRevision,
} from "@/lib/moderation-review";
function Content({ user }: { user: User }) {
  const [items, setItems] = useState<Listing[]>([]),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(""),
    [loadError, setLoadError] = useState(""),
    [notice, setNotice] = useState(""),
    [selected, setSelected] = useState<string | null>(null),
    [reason, setReason] = useState(""),
    [busy, setBusy] = useState(false),
    [query, setQuery] = useState(""),
    [decisionNeedsRefresh, setDecisionNeedsRefresh] = useState(false),
    [publicationsRefresh, setPublicationsRefresh] = useState(0),
    [reviewedRevision, setReviewedRevision] = useState<ReviewedRevision | null>(
      null,
    );
  const loadGeneration = useRef(0);
  const mutationPending = useRef(false);
  const detail = useRef<HTMLElement>(null);
  const feedback = useRef<HTMLParagraphElement>(null);
  useEffect(() => {
    if (!selected) return;
    detail.current?.focus({ preventScroll: true });
    detail.current?.scrollIntoView({
      block: "start",
      behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches
        ? "instant"
        : "smooth",
    });
  }, [selected]);
  useEffect(() => {
    if (!error && !notice) return;
    feedback.current?.focus({ preventScroll: true });
    feedback.current?.scrollIntoView({ block: "center", behavior: "instant" });
  }, [error, notice]);
  function load() {
    const generation = ++loadGeneration.current;
    setLoading(true);
    setLoadError("");
    return api<{ data: Listing[] }>("/api/admin/revisions")
      .then((r) => {
        if (generation !== loadGeneration.current) return;
        setItems(r.data);
        setDecisionNeedsRefresh(false);
        setSelected((current) =>
          r.data.some((entry) => entry.id === current) ? current : null,
        );
      })
      .catch((e) => {
        if (generation === loadGeneration.current) setLoadError(e.message);
      })
      .finally(() => {
        if (generation === loadGeneration.current) setLoading(false);
      });
  }
  useEffect(() => {
    void load();
    return () => {
      loadGeneration.current++;
    };
  }, []);
  const item = items.find((l) => l.id === selected);
  const visibleItems = filterAdminReviewItems(items, query);
  const reviewed =
    !loading &&
    !loadError &&
    !decisionNeedsRefresh &&
    isRevisionReviewed(item, reviewedRevision);
  async function decide(decision: "approve" | "changes_requested" | "reject") {
    if (
      !item ||
      loading ||
      loadError ||
      decisionNeedsRefresh ||
      mutationPending.current
    )
      return;
    if (decision !== "approve" && !reason.trim()) {
      setError("Indiquez un motif utile pour le vendeur.");
      return;
    }
    if (decision === "approve" && !reviewed) {
      setError("Confirmez la relecture des informations et des photos.");
      return;
    }
    mutationPending.current = true;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const response = await api<{ data: Listing }>(
        `/api/admin/revisions/${item.id}/decision`,
        {
          method: "POST",
          body: JSON.stringify({
            decision,
            reason: reason.trim(),
            version: item.version,
          }),
        },
      );
      const outcome = moderationOutcome(decision, response.data);
      if (outcome.confirmed) setNotice(outcome.message);
      else setError(outcome.message);
      setSelected(null);
      setReason("");
      setReviewedRevision(null);
      setPublicationsRefresh((value) => value + 1);
      await load();
    } catch (e) {
      setError((e as Error).message);
      setDecisionNeedsRefresh(true);
      setReviewedRevision(null);
    } finally {
      mutationPending.current = false;
      setBusy(false);
    }
  }
  return (
    <AccountShell
      user={user}
      title="Modération des annonces"
      eyebrow="MODÉRATION"
      action={
        <button
          className="button button-secondary"
          disabled={loading || busy}
          onClick={() => {
            void load();
          }}
        >
          <RefreshCw size={18} />
          Actualiser
        </button>
      }
    >
      {user.role === "admin" ? (
        <div className="account-admin-links">
          <a href="#demandes-3d" className="button button-secondary">
            Demandes 3D
          </a>
        </div>
      ) : null}
      <p className="muted account-lead">
        Relisez chaque annonce et ses preuves avant de la rendre publique.
      </p>
      <div className="notice">
        <ShieldCheck size={20} />
        <p>
          Une approbation vérifie la cohérence du dossier. Elle ne certifie ni
          la propriété du bien ni l’absence de défaut.
        </p>
      </div>
      {error ? (
        <p className="error" role="alert" ref={feedback} tabIndex={-1}>
          {error}
        </p>
      ) : null}
      {!error && notice ? (
        <p className="notice" role="status" ref={feedback} tabIndex={-1}>
          {notice}
        </p>
      ) : null}
      {loadError ? (
        <p className="error" role="alert">
          La file n’a pas pu être actualisée. {loadError} Utilisez « Actualiser
          » pour réessayer.
        </p>
      ) : null}
      {decisionNeedsRefresh ? (
        <p className="notice" role="status">
          Actualisez la file pour vérifier l’état du dossier avant une nouvelle
          décision. Votre motif est conservé.
        </p>
      ) : null}
      <div className="account-section-title">
        <h2>Versions en attente</h2>
        <span className="badge">
          {loadError ? (
            "À actualiser"
          ) : (
            <>
              {items.length} dossier{items.length > 1 ? "s" : ""}
            </>
          )}
        </span>
      </div>
      <div className="admin-review-toolbar">
        <label className="field admin-review-search">
          Rechercher dans les dossiers
          <input
            type="search"
            className="input"
            placeholder="Annonce, ville, vendeur ou référence"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </label>
        {query.trim() ? (
          <span className="small muted" role="status">
            {visibleItems.length} résultat{visibleItems.length > 1 ? "s" : ""}
          </span>
        ) : null}
      </div>
      {loading ? (
        <p role="status">Chargement de la file…</p>
      ) : !loadError && items.length ? (
        <div className="account-list">
          {visibleItems.map((l) => (
            <button
              key={l.id}
              className={`account-review-row ${selected === l.id ? "active" : ""}`}
              disabled={busy}
              aria-expanded={selected === l.id}
              aria-controls="moderation-dossier"
              onClick={() => {
                if (selected === l.id) {
                  detail.current?.focus({ preventScroll: true });
                  detail.current?.scrollIntoView({ block: "start" });
                  return;
                }
                setSelected(l.id);
                setReason("");
                setReviewedRevision(null);
                setError("");
                setNotice("");
              }}
            >
              <div>
                <strong>{l.title}</strong>
                <span>
                  {l.city} · {l.sellerName} · version {l.version}
                </span>
              </div>
              <span>
                {offerLabel(l)} · {listingPrice(l)}
              </span>
              <ClipboardCheck size={20} />
            </button>
          ))}
          {!visibleItems.length ? (
            <p className="notice">
              Aucun dossier ne correspond à cette recherche.
            </p>
          ) : null}
        </div>
      ) : !loadError ? (
        <div className="empty-state account-empty">
          <CheckCircle2 size={36} />
          <h2>La file est à jour.</h2>
          <p>Les prochaines soumissions seront affichées ici.</p>
        </div>
      ) : null}
      {item ? (
        <section
          id="moderation-dossier"
          className="account-review-detail card"
          ref={detail}
          tabIndex={-1}
          aria-label={`Dossier ${item.title}`}
        >
          <div className="account-section-title">
            <div>
              <span className="account-eyebrow">
                VERSION {item.version} · NON PUBLIÉE
              </span>
              <h2>{item.title}</h2>
            </div>
            <button
              aria-label="Fermer le dossier"
              className="button button-secondary"
              disabled={busy}
              onClick={() => setSelected(null)}
            >
              <X size={18} />
            </button>
          </div>
          <p>
            {item.city} · {item.district} · {offerLabel(item)} ·{" "}
            {listingPrice(item)} · {item.spaces.length} place
            {item.spaces.length > 1 ? "s" : ""}
          </p>
          <p className="small muted">{pricingScope(item)}</p>
          <ListingOffersTable listing={item} />
          <p className="account-preview-description">{item.description}</p>
          <p className="notice">
            Le rattachement des places à un parking identifié doit être contrôlé
            avant la publication.{" "}
            {user.role === "admin" ? (
              <Link href={`/admin/parkings?listingId=${item.id}`}>
                Consulter le rattachement administratif
              </Link>
            ) : (
              "Un administrateur habilité réalise cette étape."
            )}
          </p>
          <div className="account-photo-grid">
            {item.photos.map((photo, i) => (
              <a
                href={photo}
                key={`${photo}-${i}`}
                target="_blank"
                rel="noreferrer"
              >
                <img src={photo} alt={`Pièce photo ${i + 1} à relire`} />
                <span>Photo {i + 1}</span>
              </a>
            ))}
          </div>
          <section className="account-admin-unit-photos">
            <h3>Photos et couverture par place</h3>
            <p className="muted">
              Contrôlez le rattachement et les contraintes propres à chaque
              unité. Des vues générales ne suffisent pas à établir son état
              individuel.
            </p>
            {item.spaces.map((space, index) => {
              const photos = item.spacePhotos?.[space.id] || [];
              return (
                <div key={space.id}>
                  <strong>
                    Place {space.number || "non numérotée"} · niveau{" "}
                    {spaceLevelLabel(space)}
                  </strong>
                  <p className="muted">
                    {photos.length
                      ? `${photos.length} photo(s) déclarée(s) · couverture à vérifier`
                      : "Aucune photo propre · couverture individuelle non établie"}
                  </p>
                  <QualitySummary quality={item.unitQuality?.[space.id]} />
                  <ConditionEvidenceSummary
                    values={item.conditionObservations}
                    spaceId={space.id}
                  />
                  {photos.length ? (
                    <div className="account-photo-grid">
                      {photos.map((photo, n) => (
                        <a
                          key={`${photo}-${n}`}
                          href={photo}
                          target="_blank"
                          rel="noreferrer"
                        >
                          <img
                            src={photo}
                            loading="lazy"
                            alt={`Photo déclarée de la place ${space.number || index + 1} à relire`}
                          />
                          <span>Place {space.number || index + 1}</span>
                        </a>
                      ))}
                    </div>
                  ) : null}
                </div>
              );
            })}
          </section>
          <h3>État commun · déclaration vendeur</h3>
          <QualitySummary quality={item.quality} common />
          <ConditionEvidenceSummary values={item.conditionObservations} />
          <CommercialSummary listing={item} />
          {item.spaces.map((space) => (
            <CommercialSummary
              key={space.id}
              listing={item}
              spaceId={space.id}
            />
          ))}
          <p>
            Précision publique :{" "}
            <strong>
              {item.locationPrecision === "area"
                ? "Quartier, sans scène publique"
                : "Position exacte autorisée"}
            </strong>
            .
          </p>
          <p className="notice">
            Pour un lot, vérifiez la couverture de chaque unité. Ne concluez pas
            que toutes les places sont documentées à partir d’une seule vue
            commune.
          </p>
          <label className="account-checkbox">
            <input
              type="checkbox"
              checked={reviewed}
              disabled={
                busy || loading || Boolean(loadError) || decisionNeedsRefresh
              }
              onChange={(e) =>
                setReviewedRevision(
                  e.target.checked
                    ? { id: item.id, version: item.version }
                    : null,
                )
              }
            />
            <span>
              J’ai relu{" "}
              {item.pricingMode === "per_space"
                ? "les offres, les prix et les statuts de chaque place"
                : item.transactionType === "rent"
                  ? "le loyer mensuel total"
                  : "le prix total de vente"}
              , les unités, la localisation publique, les photos et les défauts
              déclarés. Je n’ai pas repéré de données sensibles à publier.
            </span>
          </label>
          <label className="field">
            Motif ou retour au vendeur
            <textarea
              className="input"
              rows={3}
              value={reason}
              maxLength={2000}
              disabled={busy}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Précisez les éléments à corriger ou le motif de refus."
            />
          </label>
          <div className="account-review-actions">
            <button
              className="button button-primary"
              disabled={busy || !reviewed}
              onClick={() => decide("approve")}
            >
              Approuver et publier
            </button>
            <button
              className="button button-secondary"
              disabled={
                busy || loading || Boolean(loadError) || decisionNeedsRefresh
              }
              onClick={() => decide("changes_requested")}
            >
              Demander une correction
            </button>
            <button
              className="button button-secondary"
              disabled={
                busy || loading || Boolean(loadError) || decisionNeedsRefresh
              }
              onClick={() => decide("reject")}
            >
              Refuser
            </button>
          </div>
        </section>
      ) : null}
      <Publications
        refreshKey={publicationsRefresh}
        onSuspended={() => void load()}
      />
      {user.role === "admin" ? <AdminModelingRequests /> : null}
    </AccountShell>
  );
}
export default function Admin() {
  return <AccountGate admin>{(u) => <Content user={u} />}</AccountGate>;
}
