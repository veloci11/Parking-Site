import {
  money,
  typeLabels,
  type FinancialSource,
  type Listing,
  type Quality,
} from "./types";

export interface PublicDetailRow {
  label: string;
  value: string;
}
export function hasPublicDetail(value: string | null | undefined) {
  const text = value?.trim();
  return Boolean(
    text &&
    !/^(?:non renseign[ée]e?s?|inconnu(?:e|s|es)?|à préciser|unknown)$/iu.test(
      text,
    ),
  );
}
const qualityLabels = {
  floor: "État du sol",
  lighting: "Éclairage",
  humidity: "Humidité",
  access: "Accès",
  maneuver: "Manœuvre",
};
export function publicQualityRows(quality?: Quality): PublicDetailRow[] {
  return quality
    ? Object.entries(qualityLabels).flatMap(([key, label]) => {
        const value = quality[key as keyof typeof qualityLabels];
        return hasPublicDetail(value) ? [{ label, value }] : [];
      })
    : [];
}
const dateLabel = (date: string | null | undefined) =>
  date ? new Date(date).toLocaleDateString("fr-FR", { timeZone: "UTC" }) : "";
function sourceParts(source: FinancialSource) {
  return [
    source.year != null ? `Année ${source.year}` : "",
    hasPublicDetail(source.scope) ? source.scope : "",
    source.sourceKind === "provided_document"
      ? "document déclaré par le vendeur"
      : source.sourceKind === "seller_declared"
        ? "déclaration du vendeur"
        : "",
  ].filter(Boolean);
}
export function publicCommercialRows(
  listing: Listing,
  spaceId?: string,
): PublicDetailRow[] {
  const details = listing.commercialDetails;
  if (!details) return [];
  const rows: PublicDetailRow[] = [];
  const add = (label: string, value: string) => {
    if (hasPublicDetail(value)) rows.push({ label, value });
  };
  if (spaceId) {
    const unit = details.units[spaceId];
    if (!unit) return [];
    if (listing.type === "mixed" && unit.type)
      add("Type de cette place", typeLabels[unit.type]);
    add("Niveau", unit.levelLabel);
    add(
      "Origine des dimensions",
      [
        {
          unknown: "",
          seller_declared: "Déclaration du vendeur",
          measured: "Mesures relevées par le vendeur",
          plan_derived: "Lecture d’un plan fourni",
        }[unit.dimensionSource],
        dateLabel(unit.dimensionObservedAt),
      ]
        .filter(Boolean)
        .join(" · "),
    );
    add("Point limitant et contraintes", unit.limitingPoint);
    return rows;
  }
  add("Code postal", details.postalCode);
  for (const [key, label] of Object.entries({
    gate: "Portail",
    door: "Porte",
    badge: "Badge",
    key: "Clé",
    lift: "Ascenseur",
  })) {
    const state = details.access[key as keyof typeof details.access];
    if (state === "present" || state === "absent")
      add(
        label,
        state === "present" ? "Présent · déclaré" : "Absent · déclaré",
      );
  }
  for (const [label, amount, source] of [
    ["Charges annuelles", listing.annualChargesCents, details.chargesSource],
    ["Taxe foncière annuelle", listing.propertyTaxCents, details.taxSource],
  ] as const)
    add(
      label,
      [amount != null ? money(amount) : "", ...sourceParts(source)]
        .filter(Boolean)
        .join(" · "),
    );
  const income = details.rentalIncome;
  if (income) {
    const parts = [
      income.amountCents != null
        ? `${money(income.amountCents)}/${income.period === "month" ? "mois" : "an"}`
        : "",
      dateLabel(income.observedAt),
      income.sourceKind === "provided_document"
        ? "document déclaré"
        : income.sourceKind === "seller_declared"
          ? "déclaration du vendeur"
          : "",
    ].filter(Boolean);
    if (parts.length)
      add(
        "Revenu locatif déclaré",
        `${parts.join(" · ")}. Aucun revenu futur garanti.`,
      );
  }
  return rows;
}
export function publicPhotoCaption(listing: Listing, url: string) {
  const id = /^\/api\/media\/([a-f0-9-]{36})$/.exec(url)?.[1];
  const metadata = id
    ? listing.commercialDetails?.photoMetadata[id]
    : undefined;
  return metadata
    ? [
        hasPublicDetail(metadata.caption) ? metadata.caption : "",
        metadata.takenAt ? `Prise de vue : ${dateLabel(metadata.takenAt)}` : "",
      ]
        .filter(Boolean)
        .join(" · ")
    : "";
}
export function publicConditionObservations(
  listing: Listing,
  spaceId: string | null = null,
) {
  return (listing.conditionObservations || []).filter(
    (value) =>
      value.spaceId === spaceId &&
      (hasPublicDetail(value.value) ||
        hasPublicDetail(value.comment) ||
        value.evidenceMediaIds.length > 0),
  );
}
export function hasPublicUnitDetails(listing: Listing, spaceId: string) {
  return Boolean(
    listing.spacePhotos?.[spaceId]?.length ||
    publicQualityRows(listing.unitQuality?.[spaceId]).length ||
    hasPublicDetail(listing.unitQuality?.[spaceId]?.observations) ||
    publicCommercialRows(listing, spaceId).length ||
    publicConditionObservations(listing, spaceId).length,
  );
}
