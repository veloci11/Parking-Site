import type { Quality } from "@/lib/types";
export const qualityLabels: Record<
  Exclude<keyof Quality, "observedAt" | "basis">,
  string
> = {
  floor: "Sol",
  lighting: "Éclairage",
  humidity: "Humidité",
  access: "Accès",
  maneuver: "Manœuvres",
  observations: "Observations",
};
export function emptyQuality(): Quality {
  return {
    floor: "",
    lighting: "",
    humidity: "",
    access: "",
    maneuver: "",
    observations: "",
  };
}
export function QualitySummary({
  quality,
  common = false,
}: {
  quality?: Quality;
  common?: boolean;
}) {
  return (
    <>
      <p className="muted">
        {common
          ? "Déclaration vendeur sur l’état commun du parking."
          : "Déclaration vendeur propre à cette place · sans héritage de l’état commun."}
      </p>
      <p className="muted">
        Origine déclarée :{" "}
        {quality?.basis === "seller_observation"
          ? "Observation du vendeur"
          : quality?.basis === "provided_document"
            ? "Document fourni"
            : "À préciser"}
        {quality?.observedAt
          ? ` · observations du ${new Date(quality.observedAt).toLocaleDateString("fr-FR", { timeZone: "UTC" })}`
          : " · date non renseignée"}
        . Aucun contrôle de la plateforme n’est déduit de cette déclaration.
      </p>
      <dl className="account-quality-list">
        {Object.entries(qualityLabels).map(([key, label]) => (
          <div key={key}>
            <dt>{label}</dt>
            <dd>{quality?.[key as keyof Quality] || "Non renseigné"}</dd>
          </div>
        ))}
      </dl>
    </>
  );
}
