"use client";
import FilterSelect from "../FilterSelect";
import { useEffect, useState } from "react";
import type {
  ConditionCategory,
  ConditionObservation,
  Listing,
} from "@/lib/types";
import {
  conditionLabels,
  conditionSourceLabels,
} from "@/lib/condition-observations";
import { api } from "./shared";

export function ConditionEvidenceEditor({
  listing,
  spaceId,
  onChange,
}: {
  listing: Listing;
  spaceId: string | null;
  onChange: (values: ConditionObservation[]) => void;
}) {
  const [documents, setDocuments] = useState<{ id: string; mime: string }[]>(
      [],
    ),
    [error, setError] = useState("");
  async function loadDocuments() {
    try {
      const response = await api<{ data: { id: string; mime: string }[] }>(
        `/api/scenes/sources?listingId=${listing.id}`,
      );
      setDocuments(response.data);
      setError("");
    } catch {
      setError(
        "Les plans privés ne sont pas disponibles. Réessayez après leur ajout à l’étape Photos et plans.",
      );
    }
  }
  useEffect(() => {
    void loadDocuments();
  }, [listing.id]); // Private source listing is authorized by the API.
  const photos = [
    ...new Set(spaceId ? listing.spacePhotos?.[spaceId] || [] : listing.photos),
  ];
  const media = photos
    .map((url, index) => ({
      id: /^\/api\/media\/([a-f0-9-]{36})$/.exec(url)?.[1],
      index,
    }))
    .filter((v): v is { id: string; index: number } => !!v.id);
  const values = listing.conditionObservations || [];
  function update(
    category: ConditionCategory,
    patch: Partial<ConditionObservation>,
  ) {
    const previous = values.find(
      (v) => v.spaceId === spaceId && v.category === category,
    );
    const next: ConditionObservation = {
      id: previous?.id || crypto.randomUUID(),
      spaceId,
      category,
      value: "",
      comment: "",
      sourceKind: "seller_declared",
      observedAt: null,
      evidenceMediaIds: [],
      sourceDocumentIds: [],
      confidenceScope: spaceId ? "unit_declared" : "common_declared",
      ...previous,
      ...patch,
    };
    onChange([...values.filter((v) => v.id !== previous?.id), next]);
  }
  return (
    <section aria-label="Observations et preuves par rubrique">
      <h2>État et sources, rubrique par rubrique</h2>
      <p className="muted">
        Les sources restent des déclarations du vendeur. Une photo ou un plan
        joint ne certifie ni l’état du bien ni ses dimensions. Laissez vide ce
        qui est inconnu.
      </p>
      {Object.entries(conditionLabels).map(([key, label]) => {
        const category = key as ConditionCategory,
          value = values.find(
            (v) => v.spaceId === spaceId && v.category === category,
          );
        return (
          <details
            className="card"
            key={key}
            style={{ padding: 16, marginBottom: 12 }}
          >
            <summary>
              {label} · {value?.value ? "Renseigné" : "Non renseigné"}
            </summary>
            <label className="field">
              Constat factuel
              <textarea
                className="input"
                rows={2}
                maxLength={1000}
                value={value?.value || ""}
                onChange={(e) => update(category, { value: e.target.value })}
                placeholder="Non renseigné"
              />
            </label>
            <div className="form-grid">
              <div className="field">
                <span>{"Source déclarée"}</span>
                <FilterSelect
                  label={"Source déclarée"}
                  variant="field"
                  value={value?.sourceKind || "seller_declared"}
                  onChange={(selectedValue) =>
                    update(category, {
                      sourceKind:
                        selectedValue as ConditionObservation["sourceKind"],
                    })
                  }
                  options={[
                    ...Object.entries(conditionSourceLabels).map(
                      ([id, text]) => ({
                        value: id,
                        label: text,
                      }),
                    ),
                  ]}
                />
              </div>
              <label className="field">
                Date du constat · facultative
                <input
                  className="input"
                  type="date"
                  max={new Date().toISOString().slice(0, 10)}
                  value={value?.observedAt?.slice(0, 10) || ""}
                  onChange={(e) =>
                    update(category, {
                      observedAt: e.target.value
                        ? `${e.target.value}T00:00:00.000Z`
                        : null,
                    })
                  }
                />
              </label>
            </div>
            <fieldset>
              <legend>Photos de ce périmètre</legend>
              {media.length ? (
                media.map((photo) => (
                  <label className="checkline" key={photo.id}>
                    <input
                      type="checkbox"
                      checked={
                        value?.evidenceMediaIds.includes(photo.id) || false
                      }
                      onChange={(e) =>
                        update(category, {
                          evidenceMediaIds: e.target.checked
                            ? [...(value?.evidenceMediaIds || []), photo.id]
                            : (value?.evidenceMediaIds || []).filter(
                                (id) => id !== photo.id,
                              ),
                        })
                      }
                    />
                    Photo {photo.index + 1}{" "}
                    {spaceId ? "de cette place" : "du parking"}
                  </label>
                ))
              ) : (
                <p className="muted">
                  Ajoutez puis reliez les photos à ce périmètre à l’étape Photos
                  et plans.
                </p>
              )}
            </fieldset>
            {value?.sourceKind === "plan_derived" ? (
              <fieldset>
                <legend>Plans privés utilisés</legend>
                {documents.map((doc, index) => (
                  <label className="checkline" key={doc.id}>
                    <input
                      type="checkbox"
                      checked={
                        value.sourceDocumentIds?.includes(doc.id) || false
                      }
                      onChange={(e) =>
                        update(category, {
                          sourceDocumentIds: e.target.checked
                            ? [...(value.sourceDocumentIds || []), doc.id]
                            : (value.sourceDocumentIds || []).filter(
                                (id) => id !== doc.id,
                              ),
                        })
                      }
                    />
                    Document {index + 1} · {doc.mime}
                  </label>
                ))}
                <button
                  className="button secondary"
                  type="button"
                  onClick={() => void loadDocuments()}
                >
                  Actualiser les documents
                </button>
                <p className="muted">
                  Les pièces et leurs identifiants restent privés. Le public
                  voit uniquement l’origine déclarée.
                </p>
                {error ? <p role="status">{error}</p> : null}
              </fieldset>
            ) : null}
            <label className="field">
              Précisions ou limites du constat
              <textarea
                className="input"
                rows={2}
                maxLength={2000}
                value={value?.comment || ""}
                onChange={(e) => update(category, { comment: e.target.value })}
              />
            </label>
          </details>
        );
      })}
    </section>
  );
}

export function ConditionEvidenceSummary({
  values,
  spaceId = null,
}: {
  values?: ConditionObservation[];
  spaceId?: string | null;
}) {
  const selected = (values || []).filter((v) => v.spaceId === spaceId);
  if (!selected.length) return null;
  return (
    <section aria-label="Sources des observations">
      <h3>
        {spaceId
          ? "Constats propres à cette place"
          : "Constats sur les parties communes"}
      </h3>
      <dl className="account-quality-list">
        {Object.entries(conditionLabels).map(([key, label]) => {
          const observation = selected.find((v) => v.category === key);
          return (
            <div key={key}>
              <dt>{label}</dt>
              <dd>
                {observation?.value || "Non renseigné"}
                {observation?.value ? (
                  <>
                    <p className="muted small">
                      {conditionSourceLabels[observation.sourceKind]} ·{" "}
                      {observation.observedAt
                        ? new Date(observation.observedAt).toLocaleDateString(
                            "fr-FR",
                            { timeZone: "UTC" },
                          )
                        : "date inconnue"}
                      . Périmètre :{" "}
                      {spaceId ? "cette place" : "parties communes"}.
                      Déclaration non certifiée.
                    </p>
                    {observation.comment ? <p>{observation.comment}</p> : null}
                    {observation.evidenceMediaIds.length ? (
                      <p>
                        {observation.evidenceMediaIds.map((id, index) => (
                          <a
                            key={id}
                            href={`/api/media/${id}`}
                            target="_blank"
                            rel="noreferrer"
                          >
                            Photo liée {index + 1}
                            {index < observation.evidenceMediaIds.length - 1
                              ? " · "
                              : ""}
                          </a>
                        ))}
                      </p>
                    ) : null}
                  </>
                ) : null}
              </dd>
            </div>
          );
        })}
      </dl>
    </section>
  );
}
