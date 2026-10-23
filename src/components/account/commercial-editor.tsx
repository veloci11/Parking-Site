"use client";
import FilterSelect from "../FilterSelect";
import { useEffect, useState } from "react";
import type { CommercialDetails, FinancialSource, Listing } from "@/lib/types";
import {
  emptyCommercialDetails,
  emptyFinancialSource,
  emptyUnitDetails,
} from "@/lib/commercial-details";
import { api } from "./shared";

const accessLabels = {
  gate: "Portail",
  door: "Porte",
  badge: "Badge",
  key: "Clé",
  lift: "Ascenseur",
};
function SourcePicker({
  value,
  onChange,
  documents,
}: {
  value: string[];
  onChange: (ids: string[]) => void;
  documents: { id: string; mime: string }[];
}) {
  return (
    <fieldset>
      <legend>Documents privés liés</legend>
      {documents.length ? (
        documents.map((doc, i) => (
          <label className="account-checkbox" key={doc.id}>
            <input
              type="checkbox"
              checked={value.includes(doc.id)}
              onChange={(e) =>
                onChange(
                  e.target.checked
                    ? [...value, doc.id]
                    : value.filter((id) => id !== doc.id),
                )
              }
            />
            <span>
              Document {i + 1} · {doc.mime}
            </span>
          </label>
        ))
      ) : (
        <p className="muted">
          Ajoutez un plan dans « Plans et vues 3D » depuis Mes annonces, puis
          actualisez.
        </p>
      )}
    </fieldset>
  );
}
function FinancialMetadata({
  label,
  value,
  onChange,
  documents,
  includeYearScope = true,
}: {
  label: string;
  value: FinancialSource;
  onChange: (value: FinancialSource) => void;
  documents: { id: string; mime: string }[];
  includeYearScope?: boolean;
}) {
  return (
    <fieldset className="account-fieldset">
      <legend>{label}</legend>
      {includeYearScope ? (
        <div className="form-grid">
          <label className="field">
            Année de référence
            <input
              className="input"
              type="number"
              min={1900}
              max={new Date().getFullYear() + 1}
              value={value.year ?? ""}
              onChange={(e) =>
                onChange({
                  ...value,
                  year: e.target.value ? Number(e.target.value) : null,
                })
              }
            />
          </label>
          <label className="field">
            Périmètre ou quote-part
            <input
              className="input"
              maxLength={300}
              value={value.scope}
              placeholder="Ex. total des 3 places"
              onChange={(e) => onChange({ ...value, scope: e.target.value })}
            />
          </label>
        </div>
      ) : null}
      <div className="field">
        <span>{"Origine déclarée"}</span>
        <FilterSelect
          label={"Origine déclarée"}
          variant="field"
          value={value.sourceKind}
          onChange={(selectedValue) =>
            onChange({
              ...value,
              sourceKind: selectedValue as FinancialSource["sourceKind"],
            })
          }
          options={[
            { value: "unknown", label: "Non renseignée" },
            { value: "seller_declared", label: "Déclaration du vendeur" },
            { value: "provided_document", label: "Document fourni" },
          ]}
        />
      </div>
      {value.sourceKind === "provided_document" ? (
        <SourcePicker
          documents={documents}
          value={value.sourceDocumentIds}
          onChange={(sourceDocumentIds) =>
            onChange({ ...value, sourceDocumentIds })
          }
        />
      ) : null}
    </fieldset>
  );
}
export function CommercialEditor({
  listing,
  section,
  onChange,
}: {
  listing: Listing;
  section: "units" | "financial" | "photos";
  onChange: (value: CommercialDetails) => void;
}) {
  const value = listing.commercialDetails || emptyCommercialDetails();
  const [documents, setDocuments] = useState<{ id: string; mime: string }[]>(
      [],
    ),
    [error, setError] = useState("");
  async function refresh() {
    try {
      const response = await api<{ data: { id: string; mime: string }[] }>(
        `/api/scenes/sources?listingId=${listing.id}`,
      );
      setDocuments(response.data);
      setError("");
    } catch {
      setError("La liste des documents n’a pas pu être chargée.");
    }
  }
  useEffect(() => {
    if (section !== "photos") void refresh();
  }, [listing.id, section]);
  const patch = (part: Partial<CommercialDetails>) =>
    onChange({ ...value, ...part });
  const allPhotos = [
    ...new Set([
      ...listing.photos,
      ...Object.values(listing.spacePhotos || {}).flat(),
    ]),
  ];
  return (
    <section aria-label="Sources et précisions commerciales">
      {section === "units" ? (
        <>
          <h2>Références, sources et accès</h2>
          <p className="muted">
            Références et documents privés. Indiquez les dimensions en mètres au
            point le plus étroit.
          </p>
          <fieldset className="account-fieldset">
            <legend>Dispositifs d’accès déclarés</legend>
            <div className="form-grid">
              {Object.entries(accessLabels).map(([key, label]) => (
                <div className="field" key={key}>
                  <span>{label}</span>
                  <FilterSelect
                    label={label}
                    variant="field"
                    value={value.access[key as keyof typeof accessLabels]}
                    onChange={(selectedValue) =>
                      patch({
                        access: { ...value.access, [key]: selectedValue },
                      })
                    }
                    options={[
                      { value: "unknown", label: "Non renseigné" },
                      { value: "present", label: "Présent" },
                      { value: "absent", label: "Absent" },
                    ]}
                  />
                </div>
              ))}
            </div>
          </fieldset>
          {listing.spaces.map((space, index) => {
            const unit = value.units[space.id] || emptyUnitDetails(),
              update = (part: Partial<typeof unit>) =>
                patch({
                  units: { ...value.units, [space.id]: { ...unit, ...part } },
                });
            return (
              <details
                className="card"
                key={space.id}
                style={{ padding: 16, marginBottom: 12 }}
              >
                <summary>Précisions place {space.number || index + 1}</summary>
                <div className="form-grid">
                  <label className="field">
                    Référence de lot · privée
                    <input
                      className="input"
                      value={unit.privateLotReference || ""}
                      maxLength={40}
                      onChange={(e) =>
                        update({ privateLotReference: e.target.value })
                      }
                    />
                  </label>
                  <label className="field">
                    Libellé du niveau
                    <input
                      className="input"
                      value={unit.levelLabel}
                      maxLength={40}
                      placeholder="Ex. RDC, extérieur, sous-sol −1"
                      onChange={(e) => update({ levelLabel: e.target.value })}
                    />
                  </label>
                  {listing.type === "mixed" ? (
                    <div className="field">
                      <span>{"Type de cette place"}</span>
                      <FilterSelect
                        label={"Type de cette place"}
                        variant="field"
                        value={unit.type || ""}
                        onChange={(selectedValue) =>
                          update({ type: selectedValue as typeof unit.type })
                        }
                        options={[
                          { value: "", label: "Choisir", disabled: true },
                          { value: "covered", label: "Parking couvert" },
                          { value: "box", label: "Box fermé" },
                          { value: "outdoor", label: "Parking extérieur" },
                        ]}
                      />
                    </div>
                  ) : null}
                  <div className="field">
                    <span>{"Origine des dimensions"}</span>
                    <FilterSelect
                      label={"Origine des dimensions"}
                      variant="field"
                      value={unit.dimensionSource}
                      onChange={(selectedValue) =>
                        update({
                          dimensionSource:
                            selectedValue as typeof unit.dimensionSource,
                        })
                      }
                      options={[
                        { value: "unknown", label: "Non renseignée" },
                        {
                          value: "seller_declared",
                          label: "Déclaration du vendeur",
                        },
                        {
                          value: "measured",
                          label: "Mesures relevées par le vendeur",
                        },
                        {
                          value: "plan_derived",
                          label: "Lecture d’un plan fourni",
                        },
                      ]}
                    />
                  </div>
                  <label className="field">
                    Date du relevé
                    <input
                      className="input"
                      type="date"
                      max={new Date().toISOString().slice(0, 10)}
                      value={unit.dimensionObservedAt?.slice(0, 10) || ""}
                      onChange={(e) =>
                        update({
                          dimensionObservedAt: e.target.value
                            ? `${e.target.value}T00:00:00.000Z`
                            : null,
                        })
                      }
                    />
                  </label>
                </div>
                <label className="field">
                  Point limitant et contraintes connues
                  <input
                    className="input"
                    maxLength={500}
                    value={unit.limitingPoint}
                    placeholder="Ex. hauteur sous la poutre, largeur entre mur et poteau"
                    onChange={(e) => update({ limitingPoint: e.target.value })}
                  />
                </label>
                {unit.dimensionSource === "plan_derived" ? (
                  <SourcePicker
                    documents={documents}
                    value={unit.sourceDocumentIds || []}
                    onChange={(sourceDocumentIds) =>
                      update({ sourceDocumentIds })
                    }
                  />
                ) : null}
              </details>
            );
          })}
        </>
      ) : null}
      {section === "financial" ? (
        <>
          <h2>Origine des montants</h2>
          <FinancialMetadata
            label="Charges annuelles"
            value={value.chargesSource}
            documents={documents}
            onChange={(chargesSource) => patch({ chargesSource })}
          />
          <FinancialMetadata
            label="Taxe foncière"
            value={value.taxSource}
            documents={documents}
            onChange={(taxSource) => patch({ taxSource })}
          />
          <label className="account-checkbox">
            <input
              type="checkbox"
              checked={value.rentalIncome !== null}
              onChange={(e) =>
                patch({
                  rentalIncome: e.target.checked
                    ? {
                        amountCents: null,
                        period: "month",
                        observedAt: null,
                        sourceKind: "unknown",
                        sourceDocumentIds: [],
                      }
                    : null,
                })
              }
            />
            <span>Afficher un revenu locatif connu · facultatif</span>
          </label>
          {value.rentalIncome
            ? (() => {
                const income = value.rentalIncome!,
                  update = (part: Partial<typeof income>) =>
                    patch({ rentalIncome: { ...income, ...part } });
                return (
                  <fieldset className="account-fieldset">
                    <legend>Revenu locatif déclaré</legend>
                    <p className="muted">
                      Aucune rentabilité n’est calculée et ce montant ne
                      garantit pas un revenu futur.
                    </p>
                    <div className="form-grid">
                      <label className="field">
                        Montant en euros
                        <input
                          className="input"
                          type="number"
                          min={0}
                          max={1000000}
                          step="0.01"
                          value={
                            income.amountCents === null
                              ? ""
                              : income.amountCents / 100
                          }
                          onChange={(e) =>
                            update({
                              amountCents:
                                e.target.value === ""
                                  ? null
                                  : Math.round(Number(e.target.value) * 100),
                            })
                          }
                        />
                      </label>
                      <div className="field">
                        <span>{"Période"}</span>
                        <FilterSelect
                          label={"Période"}
                          variant="field"
                          value={income.period}
                          onChange={(selectedValue) =>
                            update({
                              period: selectedValue as "month" | "year",
                            })
                          }
                          options={[
                            { value: "month", label: "Par mois" },
                            { value: "year", label: "Par an" },
                          ]}
                        />
                      </div>
                      <label className="field">
                        Date de référence
                        <input
                          className="input"
                          type="date"
                          max={new Date().toISOString().slice(0, 10)}
                          value={income.observedAt?.slice(0, 10) || ""}
                          onChange={(e) =>
                            update({
                              observedAt: e.target.value
                                ? `${e.target.value}T00:00:00.000Z`
                                : null,
                            })
                          }
                        />
                      </label>
                    </div>
                    <FinancialMetadata
                      label="Source du revenu"
                      includeYearScope={false}
                      value={{
                        ...emptyFinancialSource(),
                        sourceKind: income.sourceKind,
                        sourceDocumentIds: income.sourceDocumentIds,
                      }}
                      documents={documents}
                      onChange={(metadata) =>
                        update({
                          sourceKind: metadata.sourceKind,
                          sourceDocumentIds: metadata.sourceDocumentIds,
                        })
                      }
                    />
                  </fieldset>
                );
              })()
            : null}
        </>
      ) : null}
      {section === "photos" ? (
        <>
          <h2>Légendes et dates connues</h2>
          <p className="muted">
            Ajoutez une légende et la date de prise de vue si vous la
            connaissez.
          </p>
          {allPhotos.map((url, index) => {
            const id = /^\/api\/media\/([a-f0-9-]{36})$/.exec(url)?.[1];
            if (!id) return null;
            const metadata = value.photoMetadata[id] || {
              caption: "",
              takenAt: null,
            };
            return (
              <details key={id}>
                <summary>
                  Photo {index + 1} · {metadata.caption || "légende à préciser"}
                </summary>
                <label className="field">
                  Légende factuelle
                  <input
                    className="input"
                    maxLength={300}
                    value={metadata.caption}
                    onChange={(e) =>
                      patch({
                        photoMetadata: {
                          ...value.photoMetadata,
                          [id]: { ...metadata, caption: e.target.value },
                        },
                      })
                    }
                  />
                </label>
                <label className="field">
                  Date de prise de vue connue
                  <input
                    className="input"
                    type="date"
                    max={new Date().toISOString().slice(0, 10)}
                    value={metadata.takenAt?.slice(0, 10) || ""}
                    onChange={(e) =>
                      patch({
                        photoMetadata: {
                          ...value.photoMetadata,
                          [id]: {
                            ...metadata,
                            takenAt: e.target.value
                              ? `${e.target.value}T00:00:00.000Z`
                              : null,
                          },
                        },
                      })
                    }
                  />
                </label>
              </details>
            );
          })}
        </>
      ) : (
        <>
          <button
            type="button"
            className="button button-secondary"
            onClick={() => void refresh()}
          >
            Actualiser les documents privés
          </button>
          {error ? <p role="status">{error}</p> : null}
        </>
      )}
    </section>
  );
}
