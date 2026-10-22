"use client";
import { useEffect, useState } from "react";
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
import { type Listing, type User } from "@/lib/types";
import { listingPrice, offerLabel } from "@/lib/listing-price";
import { pricingScope, ListingOffersTable } from "../ListingOffers";
import { AdminModelingRequests } from "./modeling-request";
import {
  isRevisionReviewed,
  type ReviewedRevision,
} from "@/lib/moderation-review";
function Content({ user }: { user: User }) {
  const [items, setItems] = useState<Listing[]>([]),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [selected, setSelected] = useState<string | null>(null),
    [reason, setReason] = useState(""),
    [busy, setBusy] = useState(false),
    [reviewedRevision, setReviewedRevision] = useState<ReviewedRevision | null>(
      null,
    );
  function load() {
    setLoading(true);
    return api<{ data: Listing[] }>("/api/admin/revisions")
      .then((r) => setItems(r.data))
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }
  useEffect(() => {
    void load();
  }, []);
  const item = items.find((l) => l.id === selected);
  const reviewed = isRevisionReviewed(item, reviewedRevision);
  async function decide(decision: "approve" | "changes_requested" | "reject") {
    if (!item) return;
    if (decision !== "approve" && !reason.trim()) {
      setError("Indiquez un motif utile pour le vendeur.");
      return;
    }
    if (decision === "approve" && !reviewed) {
      setError("Confirmez la relecture des informations et des photos.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      await api(`/api/admin/revisions/${item.id}/decision`, {
        method: "POST",
        body: JSON.stringify({
          decision,
          reason: reason.trim(),
          version: item.version,
        }),
      });
      setNotice(
        decision === "approve"
          ? "La version relue a été publiée."
          : "La décision et son motif ont été enregistrés.",
      );
      setSelected(null);
      setReason("");
      setReviewedRevision(null);
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <AccountShell
      user={user}
      title="La qualité commence ici."
      eyebrow="MODÉRATION"
      action={
        <button
          className="button button-secondary"
          onClick={() => {
            void load();
          }}
        >
          <RefreshCw size={18} />
          Actualiser
        </button>
      }
    >
      <div className="account-admin-links">
        {user.role === "admin" ? (
          <>
            <a href="#demandes-3d" className="button button-secondary">
              Demandes 3D
            </a>
            <Link href="/admin/comptes" className="button button-secondary">
              Comptes et accès
            </Link>
            <Link href="/admin/journal" className="button button-secondary">
              Journal administratif
            </Link>
          </>
        ) : null}
        <Link href="/admin/signalements" className="button button-secondary">
          Examiner les signalements
        </Link>
        <Link href="/admin/scenes" className="button button-secondary">
          Relire les vues 3D
        </Link>
      </div>
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
        <p className="error" role="alert">
          {error}
        </p>
      ) : null}
      {notice ? (
        <p className="notice" role="status">
          {notice}
        </p>
      ) : null}
      <div className="account-section-title">
        <h2>Versions en attente</h2>
        <span className="badge">
          {items.length} dossier{items.length > 1 ? "s" : ""}
        </span>
      </div>
      {loading ? (
        <p role="status">Chargement de la file…</p>
      ) : items.length ? (
        <div className="account-list">
          {items.map((l) => (
            <button
              key={l.id}
              className={`account-review-row ${selected === l.id ? "active" : ""}`}
              onClick={() => {
                setSelected(l.id);
                setReason("");
                setReviewedRevision(null);
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
        </div>
      ) : (
        <div className="empty-state account-empty">
          <CheckCircle2 size={36} />
          <h2>La file est à jour.</h2>
          <p>Les prochaines soumissions seront affichées ici.</p>
        </div>
      )}
      {item ? (
        <section className="account-review-detail card">
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
                    Place {space.number || index + 1} · niveau {space.level}
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
              disabled={busy}
              onClick={() => decide("changes_requested")}
            >
              Demander une correction
            </button>
            <button
              className="button button-secondary"
              disabled={busy}
              onClick={() => decide("reject")}
            >
              Refuser
            </button>
          </div>
        </section>
      ) : null}
      <Publications />
      {user.role === "admin" ? <AdminModelingRequests /> : null}
    </AccountShell>
  );
}
export default function Admin() {
  return <AccountGate admin>{(u) => <Content user={u} />}</AccountGate>;
}
