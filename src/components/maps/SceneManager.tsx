"use client";
import FilterSelect from "@/components/FilterSelect";
import { useEffect, useState } from "react";
import Link from "next/link";
import {
  Box,
  FileUp,
  FileText,
  ShieldCheck,
  RefreshCw,
  Check,
  ExternalLink,
} from "lucide-react";
import {
  exampleSceneManifest,
  sceneManifestSchema,
  type SceneManifest,
} from "@/lib/scene-contract";
import type { Listing, User } from "@/lib/types";
interface SceneEntry {
  id: string;
  listing_id: string;
  creator_id: string;
  owner_id: string;
  state: string;
  row_version: number;
  manifest: SceneManifest;
  evidence_ids: string[];
  review_reason?: string | null;
}
interface SourceEntry {
  id: string;
  listing_id: string;
  mime: string;
  byte_size: number;
  processing_state?: "processing" | "ready" | "rejected";
  previewUrls?: string[];
  url: string;
}
async function api<T>(path: string, options?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    ...options,
    headers:
      options?.body instanceof FormData
        ? options.headers
        : { "Content-Type": "application/json", ...options?.headers },
  });
  const result = await response.json();
  if (!response.ok)
    throw new Error(result.error || "Le service des plans est indisponible.");
  return result.data;
}
const states: Record<string, string> = {
  pending_review: "À contrôler",
  approved: "Approuvé",
  rejected: "Refusé",
  changes_requested: "Correction demandée",
  retired: "Version remplacée",
};
export default function SceneManager({ review = false }: { review?: boolean }) {
  const [user, setUser] = useState<User | null>(null),
    [checked, setChecked] = useState(false),
    [listings, setListings] = useState<Listing[]>([]),
    [selected, setSelected] = useState<Listing | null>(null),
    [lookup, setLookup] = useState(""),
    [entries, setEntries] = useState<SceneEntry[]>([]),
    [sources, setSources] = useState<SourceEntry[]>([]),
    [evidence, setEvidence] = useState<string[]>([]),
    [json, setJSON] = useState(""),
    [rights, setRights] = useState(false),
    [checks, setChecks] = useState<Record<string, boolean>>({}),
    [observationChecks, setObservationChecks] = useState<
      Record<string, boolean>
    >({}),
    [reason, setReason] = useState<Record<string, string>>({}),
    [busy, setBusy] = useState(false),
    [notice, setNotice] = useState(""),
    [error, setError] = useState("");
  async function reload() {
    try {
      setEntries(
        await api<SceneEntry[]>(
          `/api/scenes?scope=${review ? "review" : "mine"}`,
        ),
      );
      if (review)
        setSources(
          await api<SourceEntry[]>("/api/scenes/sources?scope=review"),
        );
    } catch (e) {
      setError((e as Error).message);
    }
  }
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const session = await api<User | null>("/api/session");
        if (cancelled) return;
        setUser(session);
        if (session) {
          const own = await api<Listing[]>("/api/me/listings");
          if (cancelled) return;
          setListings(own);
          setEntries(
            await api<SceneEntry[]>(
              `/api/scenes?scope=${review ? "review" : "mine"}`,
            ),
          );
          if (review)
            setSources(
              await api<SourceEntry[]>("/api/scenes/sources?scope=review"),
            );
        }
      } catch (e) {
        if (!cancelled) setError((e as Error).message);
      } finally {
        if (!cancelled) setChecked(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [review]);
  async function choose(listing: Listing) {
    setSelected(listing);
    setLookup(listing.id);
    setJSON(JSON.stringify(exampleSceneManifest(listing), null, 2));
    setEvidence([]);
    setError("");
    try {
      setSources(
        await api<SourceEntry[]>(`/api/scenes/sources?listingId=${listing.id}`),
      );
    } catch (e) {
      setError((e as Error).message);
    }
  }
  async function find(id = lookup) {
    try {
      await choose(
        await api<Listing>(
          `/api/scenes?scope=listing&listingId=${encodeURIComponent(id)}`,
        ),
      );
    } catch (e) {
      setError((e as Error).message);
    }
  }
  async function upload(file: File) {
    if (!selected) return;
    setBusy(true);
    setError("");
    try {
      const body = new FormData();
      body.set("listingId", selected.id);
      body.set("file", file);
      const source = await api<{
        id: string;
        mime: string;
        byteSize: number;
        processing_state: "processing" | "ready" | "rejected";
        url: string;
      }>("/api/scenes/sources", { method: "POST", body });
      setSources((current) => [
        ...current,
        {
          id: source.id,
          listing_id: selected.id,
          mime: source.mime,
          byte_size: source.byteSize,
          processing_state: source.processing_state,
          url: source.url,
        },
      ]);
      if (source.processing_state === "ready")
        setEvidence((current) => [...current, source.id]);
      setNotice(
        "Source conservée en privé. Elle ne sera pas affichée sur l’annonce.",
      );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function submit() {
    if (!selected) return;
    setBusy(true);
    setError("");
    try {
      let value: unknown;
      try {
        value = JSON.parse(json);
      } catch {
        throw new Error("Le modèle doit être un fichier JSON valide.");
      }
      const parsed = sceneManifestSchema.safeParse(value);
      if (!parsed.success)
        throw new Error(
          parsed.error.issues
            .map((i) => `${i.path.join(".")}: ${i.message}`)
            .join(" · "),
        );
      await api("/api/scenes", {
        method: "POST",
        body: JSON.stringify({
          listingId: selected.id,
          manifest: parsed.data,
          evidenceIds: evidence,
          rightsAttested: rights,
        }),
      });
      setNotice(
        "Plan soumis au contrôle. Aucune géométrie n’est publiée avant approbation.",
      );
      await reload();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function decide(entry: SceneEntry, decision: string) {
    setBusy(true);
    setError("");
    try {
      await api(`/api/scenes/${entry.id}/review`, {
        method: "POST",
        body: JSON.stringify({
          version: entry.row_version,
          decision,
          reason: reason[entry.id] || undefined,
          checks:
            decision === "approve" && checks[entry.id]
              ? {
                  geometryMatchesSources: true,
                  numbersAndLevelChecked: true,
                  conditionMatchesPhotos: true,
                  locationConsentChecked: true,
                  observationEvidenceChecked: !!observationChecks[entry.id],
                }
              : undefined,
        }),
      });
      setNotice(
        "Décision enregistrée. La scène publique respecte le consentement et le mapping courant de l’annonce.",
      );
      setChecks((current) => ({ ...current, [entry.id]: false }));
      setReason((current) => ({ ...current, [entry.id]: "" }));
      await reload();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  if (!checked)
    return (
      <main id="main" className="page-shell">
        <p role="status">Chargement de l’espace plans…</p>
      </main>
    );
  if (!user)
    return (
      <main id="main" className="page-shell">
        <h1>Les plans de mes parkings</h1>
        <p>
          Connectez-vous pour transmettre vos plans privés et suivre leur
          contrôle.
        </p>
        <Link
          className="button button-primary"
          href="/connexion?next=/compte/scenes"
        >
          Se connecter
        </Link>
      </main>
    );
  return (
    <main id="main" className="page-shell scene-manager">
      <div className="scene-manager-heading">
        <div>
          <span className="badge">
            <Box size={16} /> Plans intérieurs
          </span>
          <h1>
            {review ? "Contrôler les modèles 3D" : "Les plans de mes parkings"}
          </h1>
          <p className="muted">
            {review
              ? "Vérifiez les sources, l’échelle, les numéros et le consentement avant de publier une vue métrique."
              : "Transmettez votre plan et les mesures disponibles. Les documents restent privés ; la modélisation et le contrôle précèdent la publication."}
          </p>
        </div>
        <Link
          className="button button-secondary"
          href={review ? "/admin" : "/compte"}
        >
          Retour à {review ? "la modération" : "mon compte"}
        </Link>
      </div>
      {notice ? (
        <p className="notice" role="status">
          {notice}
        </p>
      ) : null}
      {error ? (
        <p className="error" role="alert">
          {error}
        </p>
      ) : null}
      {review && !["moderator", "admin"].includes(user.role) ? (
        <p>Accès réservé à la modération.</p>
      ) : (
        <>
          <section className="card scene-manager-card">
            <h2>
              <FileUp size={20} /> Transmettre un plan
            </h2>
            {review ? (
              <div className="scene-manager-inline">
                <label className="field">
                  Identifiant de l’annonce
                  <input
                    className="input"
                    value={lookup}
                    onChange={(e) => setLookup(e.target.value)}
                    placeholder="Identifiant de l’annonce publiée"
                  />
                </label>
                <button
                  className="button button-secondary"
                  type="button"
                  onClick={() => void find()}
                >
                  Charger l’annonce
                </button>
              </div>
            ) : (
              <label className="field">
                Annonce concernée
                <FilterSelect
                  variant="field"
                  label="Annonce concernée"
                  value={selected?.id || ""}
                  onChange={(value) => {
                    const item = listings.find((l) => l.id === value);
                    if (item) void choose(item);
                  }}
                  options={[
                    { value: "", label: "Choisir une annonce" },
                    ...listings.map((l) => ({
                      value: l.id,
                      label: `${l.city} · ${l.district} — ${l.title || "Brouillon"}`,
                    })),
                  ]}
                />
              </label>
            )}
            {selected ? (
              <>
                <p>
                  <strong>{selected.title || "Brouillon"}</strong> ·{" "}
                  {selected.spaces.length} place(s)
                </p>
                <label className="field">
                  Plan PDF simple ou photo du plan
                  <input
                    className="input"
                    type="file"
                    accept="application/pdf,image/jpeg,image/png,image/webp"
                    disabled={busy}
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) void upload(file);
                      e.currentTarget.value = "";
                    }}
                  />
                </label>
                <p className="muted">
                  25 Mio maximum. Images nettoyées des métadonnées ; PDF simple
                  téléchargé comme pièce privée. Incluez l’autorisation de
                  publication et deux mesures indépendantes.
                </p>
              </>
            ) : null}
          </section>
          {sources.length ? (
            <section className="card scene-manager-card">
              <h2>
                <FileText size={20} /> Sources privées
              </h2>
              <p className="muted">
                Ces documents sont accessibles uniquement au propriétaire et à
                la modération autorisée.
              </p>
              {sources.map((source) => (
                <div className="scene-manager-source" key={source.id}>
                  {selected && source.listing_id === selected.id ? (
                    <label>
                      <input
                        type="checkbox"
                        disabled={source.processing_state !== "ready"}
                        checked={evidence.includes(source.id)}
                        onChange={(e) =>
                          setEvidence((current) =>
                            e.target.checked
                              ? [...current, source.id]
                              : current.filter((id) => id !== source.id),
                          )
                        }
                      />{" "}
                      Joindre au modèle
                    </label>
                  ) : null}
                  <p>
                    {source.processing_state === "ready"
                      ? "Aperçus disponibles"
                      : source.processing_state === "rejected"
                        ? "Document refusé — exportez un plan simple"
                        : "En traitement — document privé en quarantaine"}
                  </p>
                  {(source.previewUrls || []).map((preview, index) => (
                    <a
                      key={preview}
                      href={preview}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="button button-secondary"
                    >
                      Aperçu {index + 1}
                    </a>
                  ))}
                  {source.processing_state === "ready" ? (
                    <a
                      href={`${source.url}&download=acknowledged`}
                      onClick={(event) => {
                        if (
                          !window.confirm(
                            "Télécharger le document original privé ? Le contrôle technique ne constitue pas un antivirus. Préférez les aperçus PNG.",
                          )
                        )
                          event.preventDefault();
                      }}
                      download
                      className="button button-secondary"
                    >
                      <FileText size={16} />
                      {source.mime === "application/pdf"
                        ? "Plan PDF"
                        : "Plan en image"}{" "}
                      · {Math.ceil(source.byte_size / 1024)} Ko{" "}
                      <ExternalLink size={14} />
                    </a>
                  ) : null}
                  {review && !selected ? (
                    <button
                      type="button"
                      className="button button-secondary"
                      onClick={() => void find(source.listing_id)}
                    >
                      Préparer cette annonce
                    </button>
                  ) : null}
                </div>
              ))}
            </section>
          ) : null}
          {selected ? (
            <details className="card scene-manager-card" open={review}>
              <summary>Modèle préparé par le spécialiste 3D</summary>
              <p className="muted">
                Le gabarit ci-dessous est fictif : remplacez toute la géométrie
                par les relevés du parking. Les coordonnées sont en mètres sur
                X/Z. Seuls la géométrie, le résumé public de provenance et les
                observations contrôlées seront visibles ; les pièces sources
                restent privées. Le contrôle exige un calibrage, deux distances
                distinctes et la correspondance de toutes les places du niveau.
              </p>
              <label className="field">
                Importer le modèle JSON
                <input
                  className="input"
                  type="file"
                  accept="application/json,.json"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file && file.size <= 1024 * 1024)
                      void file.text().then(setJSON);
                    else if (file) setError("Modèle JSON limité à 1 Mo.");
                    e.currentTarget.value = "";
                  }}
                />
              </label>
              <label className="field">
                Coordonnées et provenance du modèle
                <textarea
                  className="input scene-manager-json"
                  rows={18}
                  value={json}
                  onChange={(e) => setJSON(e.target.value)}
                  spellCheck={false}
                />
              </label>
              <label className="scene-manager-check">
                <input
                  type="checkbox"
                  checked={rights}
                  onChange={(e) => setRights(e.target.checked)}
                />{" "}
                Je dispose des droits nécessaires sur ces documents et ces
                relevés.
              </label>
              <button
                type="button"
                className="button button-primary"
                disabled={busy || !rights || !evidence.length}
                onClick={() => void submit()}
              >
                <ShieldCheck size={18} /> Soumettre le modèle au contrôle
              </button>
            </details>
          ) : null}
          <section className="card scene-manager-card">
            <div className="scene-manager-inline">
              <h2>{review ? "Modèles à contrôler" : "Suivi des modèles"}</h2>
              <button
                className="button button-secondary"
                type="button"
                disabled={busy}
                onClick={() => void reload()}
              >
                <RefreshCw size={16} /> Actualiser
              </button>
            </div>
            {entries.length ? (
              entries.map((entry) => (
                <article key={entry.id} className="scene-manager-entry">
                  <div>
                    <span className="badge">
                      {states[entry.state] || entry.state}
                    </span>
                    <h3>
                      Niveau {entry.manifest.level} ·{" "}
                      {entry.manifest.spaces.length} place(s)
                    </h3>
                    <p className="muted">
                      Version {entry.row_version} ·{" "}
                      {entry.manifest.provenance.calibrated
                        ? "Calibrage déclaré"
                        : "Calibrage à compléter"}{" "}
                      · {entry.manifest.provenance.controlDistances.length}{" "}
                      distances
                    </p>
                  </div>
                  <p>{entry.manifest.provenance.publicSummary}</p>
                  {entry.review_reason ? (
                    <p className="notice">{entry.review_reason}</p>
                  ) : null}
                  <div className="scene-manager-inline">
                    {entry.evidence_ids.map((id, i) => (
                      <a
                        key={id}
                        className="button button-secondary"
                        href={`/api/scenes/sources?id=${id}`}
                        download
                      >
                        Source privée {i + 1}
                      </a>
                    ))}
                    <button
                      type="button"
                      className="button button-secondary"
                      onClick={() => {
                        void find(entry.listing_id).then(() => {
                          setJSON(JSON.stringify(entry.manifest, null, 2));
                          setEvidence(entry.evidence_ids);
                        });
                      }}
                    >
                      Préparer une nouvelle version
                    </button>
                  </div>
                  <details>
                    <summary>Inspecter les coordonnées et mesures</summary>
                    <pre className="scene-manager-code">
                      {JSON.stringify(entry.manifest, null, 2)}
                    </pre>
                  </details>
                  {review ? (
                    <div className="scene-manager-review">
                      {entry.creator_id === user.id ||
                      entry.owner_id === user.id ? (
                        <p className="notice">
                          Un autre modérateur doit contrôler un modèle que vous
                          avez préparé ou dont vous possédez l’annonce.
                        </p>
                      ) : null}
                      <label className="scene-manager-check">
                        <input
                          type="checkbox"
                          checked={!!checks[entry.id]}
                          onChange={(e) =>
                            setChecks((current) => ({
                              ...current,
                              [entry.id]: e.target.checked,
                            }))
                          }
                        />{" "}
                        J’ai contrôlé la géométrie sur les sources, les
                        numéros/niveaux, l’état sur les photos et le
                        consentement exact de l’annonce publiée.
                      </label>
                      <label className="scene-manager-check">
                        <input
                          type="checkbox"
                          checked={!!observationChecks[entry.id]}
                          onChange={(event) =>
                            setObservationChecks((current) => ({
                              ...current,
                              [entry.id]: event.target.checked,
                            }))
                          }
                        />{" "}
                        J’ai comparé les observations datées à leurs preuves
                        privées liées. Ce contrôle porte uniquement sur les
                        observations documentées, pas sur tout l’état du
                        parking.
                      </label>
                      <label className="field">
                        Motif de décision
                        <textarea
                          className="input"
                          rows={3}
                          value={reason[entry.id] || ""}
                          onChange={(e) =>
                            setReason((current) => ({
                              ...current,
                              [entry.id]: e.target.value,
                            }))
                          }
                        />
                      </label>
                      <div className="scene-manager-inline">
                        <button
                          type="button"
                          disabled={
                            busy ||
                            !checks[entry.id] ||
                            entry.creator_id === user.id ||
                            entry.owner_id === user.id
                          }
                          className="button button-primary"
                          onClick={() => void decide(entry, "approve")}
                        >
                          <Check size={16} /> Approuver
                        </button>
                        <button
                          type="button"
                          disabled={busy || !reason[entry.id]}
                          className="button button-secondary"
                          onClick={() =>
                            void decide(entry, "changes_requested")
                          }
                        >
                          Demander une correction
                        </button>
                        <button
                          type="button"
                          disabled={busy || !reason[entry.id]}
                          className="button button-secondary"
                          onClick={() => void decide(entry, "reject")}
                        >
                          Refuser
                        </button>
                      </div>
                    </div>
                  ) : null}
                </article>
              ))
            ) : (
              <p className="empty-state">
                Aucun modèle{" "}
                {review ? "en attente de contrôle" : "soumis pour le moment"}.
              </p>
            )}
          </section>
        </>
      )}
      <style jsx>{`
        .scene-manager {
          max-width: 1100px;
        }
        .scene-manager-heading {
          display: flex;
          gap: 24px;
          align-items: flex-start;
          justify-content: space-between;
          margin-bottom: 24px;
        }
        .scene-manager-heading h1 {
          margin: 16px 0;
        }
        .scene-manager-card {
          padding: 24px;
          margin: 24px 0;
        }
        .scene-manager-card h2 {
          display: flex;
          gap: 8px;
          align-items: center;
          margin: 0 0 20px;
          font-size: 24px;
        }
        .scene-manager-card summary {
          font-size: 20px;
          font-weight: 600;
          cursor: pointer;
          padding: 8px 0;
        }
        .scene-manager-inline {
          display: flex;
          gap: 12px;
          align-items: end;
          flex-wrap: wrap;
        }
        .scene-manager-inline .field {
          flex: 1;
          min-width: 220px;
        }
        .scene-manager-source {
          display: flex;
          gap: 16px;
          align-items: center;
          flex-wrap: wrap;
          margin: 16px 0;
        }
        .scene-manager-source label,
        .scene-manager-check {
          display: flex;
          gap: 12px;
          align-items: flex-start;
          font-size: 14px;
          line-height: 1.5;
        }
        .scene-manager-check {
          margin: 20px 0;
        }
        .scene-manager-check input {
          margin-top: 4px;
          accent-color: #6d28ff;
        }
        .scene-manager-json,
        .scene-manager-code {
          font-family: inherit;
          font-size: 12px;
          line-height: 1.5;
          max-width: 100%;
          overflow: auto;
          white-space: pre;
        }
        .scene-manager-entry {
          padding: 24px 0;
          border-top: 1px solid #e5e7ef;
        }
        .scene-manager-entry h3 {
          font-size: 20px;
          margin: 12px 0;
        }
        .scene-manager-review {
          background: #f8f9fc;
          border-radius: 12px;
          padding: 20px;
          margin-top: 20px;
        }
        @media (max-width: 767px) {
          .scene-manager-heading {
            flex-direction: column;
          }
          .scene-manager-card {
            padding: 16px;
          }
          .scene-manager-card h2 {
            font-size: 20px;
          }
        }
      `}</style>
    </main>
  );
}
