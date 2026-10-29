import type { FinancialSource, Listing } from "@/lib/types";
import { money, typeLabels } from "@/lib/types";

function sourceLabel(value: FinancialSource) {
  return `${value.year || "année inconnue"} · ${value.scope || "périmètre non précisé"} · ${value.sourceKind === "provided_document" ? "document déclaré par le vendeur" : value.sourceKind === "seller_declared" ? "déclaration du vendeur" : "source non renseignée"}`;
}
export function CommercialSummary({
  listing,
  spaceId,
}: {
  listing: Listing;
  spaceId?: string;
}) {
  const details = listing.commercialDetails;
  if (!details) return null;
  if (spaceId) {
    const unit = details.units[spaceId];
    if (!unit) return null;
    return (
      <section>
        <h3>Dimensions et contraintes déclarées</h3>
        <dl className="account-quality-list">
          {listing.type === "mixed" ? (
            <div>
              <dt>Type de cette place</dt>
              <dd>{unit.type ? typeLabels[unit.type] : "Non renseigné"}</dd>
            </div>
          ) : null}
          <div>
            <dt>Niveau</dt>
            <dd>{unit.levelLabel || "Libellé non renseigné"}</dd>
          </div>
          <div>
            <dt>Origine des dimensions</dt>
            <dd>
              {
                {
                  unknown: "Non renseignée",
                  seller_declared: "Déclaration du vendeur",
                  measured: "Mesures relevées par le vendeur",
                  plan_derived: "Lecture d’un plan fourni",
                }[unit.dimensionSource]
              }{" "}
              ·{" "}
              {unit.dimensionObservedAt
                ? new Date(unit.dimensionObservedAt).toLocaleDateString(
                    "fr-FR",
                    { timeZone: "UTC" },
                  )
                : "date inconnue"}
            </dd>
          </div>
          <div>
            <dt>Point limitant et contraintes</dt>
            <dd>{unit.limitingPoint || "Non renseigné"}</dd>
          </div>
        </dl>
        <p className="muted small">
          Ces indications ne constituent pas une certification des dimensions ni
          de l’accessibilité du bien.
        </p>
      </section>
    );
  }
  const labels = {
    gate: "Portail",
    door: "Porte",
    badge: "Badge",
    key: "Clé",
    lift: "Ascenseur",
  };
  return (
    <section>
      <h3>Accès et informations financières</h3>
      <dl className="account-quality-list">
        <div>
          <dt>Code postal</dt>
          <dd>{details.postalCode || "Non renseigné"}</dd>
        </div>
        {Object.entries(labels).map(([key, label]) => (
          <div key={key}>
            <dt>{label}</dt>
            <dd>
              {
                {
                  unknown: "Non renseigné",
                  present: "Présent · déclaré",
                  absent: "Absent · déclaré",
                }[details.access[key as keyof typeof labels]]
              }
            </dd>
          </div>
        ))}
        <div>
          <dt>Charges annuelles</dt>
          <dd>
            {listing.annualChargesCents === null ||
            listing.annualChargesCents === undefined
              ? "Montant inconnu"
              : money(listing.annualChargesCents)}{" "}
            · {sourceLabel(details.chargesSource)}
          </dd>
        </div>
        <div>
          <dt>Taxe foncière annuelle</dt>
          <dd>
            {listing.propertyTaxCents === null ||
            listing.propertyTaxCents === undefined
              ? "Montant inconnu"
              : money(listing.propertyTaxCents)}{" "}
            · {sourceLabel(details.taxSource)}
          </dd>
        </div>
        {details.rentalIncome ? (
          <div>
            <dt>Revenu locatif déclaré</dt>
            <dd>
              {details.rentalIncome.amountCents === null
                ? "Montant inconnu"
                : `${money(details.rentalIncome.amountCents)}/${details.rentalIncome.period === "month" ? "mois" : "an"}`}{" "}
              ·{" "}
              {details.rentalIncome.observedAt
                ? new Date(details.rentalIncome.observedAt).toLocaleDateString(
                    "fr-FR",
                    { timeZone: "UTC" },
                  )
                : "date inconnue"}{" "}
              ·{" "}
              {details.rentalIncome.sourceKind === "provided_document"
                ? "document déclaré"
                : details.rentalIncome.sourceKind === "seller_declared"
                  ? "déclaration du vendeur"
                  : "source non renseignée"}
              . Aucun revenu futur garanti.
            </dd>
          </div>
        ) : null}
      </dl>
    </section>
  );
}
export function PhotoCaption({
  listing,
  url,
}: {
  listing: Listing;
  url: string;
}) {
  const id = /^\/api\/media\/([a-f0-9-]{36})$/.exec(url)?.[1],
    metadata = id ? listing.commercialDetails?.photoMetadata[id] : undefined;
  if (!metadata) return null;
  return (
    <p className="muted small">
      {metadata.caption || "Légende non renseignée"} · Prise de vue :{" "}
      {metadata.takenAt
        ? new Date(metadata.takenAt).toLocaleDateString("fr-FR", {
            timeZone: "UTC",
          })
        : "date inconnue"}{" "}
      · informations déclarées.
    </p>
  );
}
