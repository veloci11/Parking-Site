"use client";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type FormEvent,
} from "react";
import Link from "next/link";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  CheckCircle2,
  CloudUpload,
  Eye,
  ImagePlus,
  Info,
  LoaderCircle,
  Plus,
  Save,
  Trash2,
} from "lucide-react";
import { AccountGate, api } from "./shared";
import { QualitySummary, emptyQuality } from "./unit-quality";
import { useSession } from "@/lib/client";
import PreparationForm from "./preparation";
import {
  decodePreparation,
  preparationKey,
  preparationPayload,
} from "./preparatory-draft";
import {
  areaLabel,
  money,
  typeLabels,
  type Listing,
  type Quality,
  type Space,
  type User,
} from "@/lib/types";
const steps = [
  "Votre bien",
  "Localisation",
  "Places et accès",
  "État réel",
  "Photos",
  "Prix de vente",
  "Description",
  "Prévisualisation",
];
function newSpace(number: string): Space {
  return {
    id: crypto.randomUUID(),
    number,
    level: -1,
    areaM2: null,
    lengthM: null,
    widthM: null,
    clearanceM: null,
  };
}
function NumField({
  label,
  value,
  onChange,
  unit = "m",
  max,
}: {
  label: string;
  value: number | null;
  onChange: (v: number | null) => void;
  unit?: string;
  max?: number;
}) {
  return (
    <label className="field">
      {label}
      <span className="account-unit-field">
        <input
          className="input"
          type="number"
          min={unit === "€/an" ? 0 : 0.01}
          max={max ?? (unit === "m²" ? 500 : unit === "€/an" ? 1000000 : 50)}
          step="0.01"
          value={value ?? ""}
          onChange={(e) =>
            onChange(e.target.value === "" ? null : Number(e.target.value))
          }
          placeholder="Non renseigné"
        />
        <span>{unit}</span>
      </span>
    </label>
  );
}
function WizardContent({ user, id }: { user: User; id?: string }) {
  const [listing, setListing] = useState<Listing | null>(null),
    [step, setStep] = useState(0),
    [loading, setLoading] = useState(!!id),
    [creating, setCreating] = useState(false),
    [hasPreparation, setHasPreparation] = useState(false),
    [partialSale, setPartialSale] = useState(false),
    [saveState, setSaveState] = useState<
      "saved" | "dirty" | "saving" | "error"
    >("saved"),
    [error, setError] = useState(""),
    [uploading, setUploading] = useState(false),
    [photoTarget, setPhotoTarget] = useState("general"),
    [qualityTarget, setQualityTarget] = useState("general"),
    [shareExisting, setShareExisting] = useState(false),
    [submitted, setSubmitted] = useState(false),
    [attest, setAttest] = useState(false),
    [locationConfirmed, setLocationConfirmed] = useState(false),
    [busy, setBusy] = useState(false);
  const latest = useRef<Listing | null>(null),
    dirty = useRef(false),
    saving = useRef(false),
    queued = useRef(false),
    seq = useRef(0),
    mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  useEffect(() => {
    if (id) {
      if (new URLSearchParams(window.location.search).get("partial") === "1") {
        setPartialSale(true);
        setStep(2);
      }
      return;
    }
    try {
      setHasPreparation(
        !!decodePreparation(sessionStorage.getItem(preparationKey)),
      );
    } catch {
      setError(
        "Votre préparation locale est inaccessible. Vous pouvez créer un nouveau brouillon.",
      );
    }
  }, [id]);
  useEffect(() => {
    if (!id) return;
    setLoading(true);
    api<{ data: Listing }>(`/api/listings/${id}?draft=1`)
      .then((r) => {
        setListing(r.data);
        latest.current = r.data;
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [id]);
  async function create() {
    setCreating(true);
    setError("");
    try {
      let preparation = null;
      try {
        preparation = decodePreparation(sessionStorage.getItem(preparationKey));
      } catch {
        /* An inaccessible local preparation does not authenticate or alter an existing draft. */
      }
      const r = await api<{ data: Listing }>("/api/listings", {
        method: "POST",
        body: JSON.stringify(
          preparation
            ? preparationPayload(preparation, () => crypto.randomUUID())
            : {},
        ),
      });
      if (preparation) {
        try {
          sessionStorage.removeItem(preparationKey);
          setHasPreparation(false);
        } catch {
          setError(
            "Brouillon créé sur le serveur. La copie locale n’a pas pu être supprimée de cet onglet.",
          );
        }
      }
      setListing(r.data);
      latest.current = r.data;
      window.history.replaceState(
        null,
        "",
        `/compte/annonces/${r.data.id}/modifier`,
      );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setCreating(false);
    }
  }
  const save = useCallback(async (): Promise<Listing | null> => {
    if (!latest.current || !dirty.current) return latest.current;
    if (saving.current) {
      queued.current = true;
      return null;
    }
    saving.current = true;
    setSaveState("saving");
    const current = latest.current,
      changeSeq = seq.current;
    try {
      const r = await api<{ data: Listing }>(`/api/listings/${current.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          title: current.title,
          description: current.description,
          city: current.city,
          district: current.district,
          priceCents: current.priceCents,
          type: current.type,
          spaces: current.spaces,
          photos: current.photos,
          spacePhotos: current.spacePhotos,
          quality: current.quality,
          unitQuality: current.unitQuality,
          locationPrecision: current.locationPrecision,
          coordinates: current.coordinates,
          address: current.address,
          occupancy: current.occupancy,
          annualChargesCents: current.annualChargesCents,
          propertyTaxCents: current.propertyTaxCents,
          observedAt: current.observedAt,
          version: current.version,
        }),
      });
      if (!mounted.current) return r.data;
      const changed = seq.current !== changeSeq;
      const next = changed
        ? {
            ...latest.current!,
            version: r.data.version,
            updatedAt: r.data.updatedAt,
          }
        : r.data;
      latest.current = next;
      setListing(next);
      dirty.current = changed;
      setSaveState(changed ? "dirty" : "saved");
      setError("");
      return next;
    } catch (e) {
      if (mounted.current) {
        setSaveState("error");
        setError((e as Error).message);
      }
      return null;
    } finally {
      saving.current = false;
      if (queued.current) {
        queued.current = false;
        if (mounted.current)
          setTimeout(() => {
            void save();
          }, 50);
      }
    }
  }, []);
  useEffect(() => {
    if (saveState !== "dirty") return;
    const timer = setTimeout(() => {
      void save();
    }, 900);
    return () => clearTimeout(timer);
  }, [saveState, listing, save]);
  useEffect(() => {
    const guard = (e: BeforeUnloadEvent) => {
      if (dirty.current) {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", guard);
    return () => window.removeEventListener("beforeunload", guard);
  }, []);
  function change(patch: Partial<Listing>) {
    if (!latest.current) return;
    if (
      "city" in patch ||
      "district" in patch ||
      "coordinates" in patch ||
      "locationPrecision" in patch
    )
      setLocationConfirmed(false);
    const next = { ...latest.current, ...patch };
    if (patch.spaces) {
      const allowed = new Set(patch.spaces.map((s) => s.id));
      next.spacePhotos = Object.fromEntries(
        Object.entries(next.spacePhotos || {}).filter(([id]) =>
          allowed.has(id),
        ),
      );
      next.unitQuality = Object.fromEntries(
        Object.entries(next.unitQuality || {}).filter(([id]) =>
          allowed.has(id),
        ),
      );
      if (qualityTarget !== "general" && !allowed.has(qualityTarget))
        setQualityTarget("general");
      if (photoTarget !== "general" && !allowed.has(photoTarget))
        setPhotoTarget("general");
    }
    seq.current++;
    latest.current = next;
    dirty.current = true;
    setListing(next);
    setSaveState("dirty");
  }
  function spaceChange(
    i: number,
    key: keyof Space,
    value: string | number | null,
  ) {
    if (!listing) return;
    change({
      spaces: listing.spaces.map((s, n) =>
        n === i ? { ...s, [key]: value } : s,
      ),
    });
  }
  function quality<K extends keyof Quality>(key: K, value: Quality[K]) {
    if (!listing) return;
    if (qualityTarget === "general")
      change({
        quality: { ...listing.quality, [key]: value },
        ...(key === "observedAt" ? { observedAt: value as string | null } : {}),
      });
    else
      change({
        unitQuality: {
          ...listing.unitQuality,
          [qualityTarget]: {
            ...emptyQuality(),
            ...listing.unitQuality?.[qualityTarget],
            [key]: value,
          },
        },
      });
  }
  async function upload(files: FileList | null) {
    if (!files || !listing) return;
    setUploading(true);
    setError("");
    const target = photoTarget;
    const urls = [
      ...(target === "general"
        ? listing.photos
        : listing.spacePhotos?.[target] || []),
    ];
    const maximum = target === "general" ? 20 : 6;
    const union = new Set([
      ...listing.photos,
      ...Object.values(listing.spacePhotos || {}).flat(),
    ]);
    try {
      for (const file of Array.from(files)) {
        if (urls.length >= maximum)
          throw new Error(
            target === "general"
              ? "La galerie générale est limitée à 20 photos."
              : "Chaque place peut recevoir jusqu’à 6 photos propres.",
          );
        if (union.size >= 120)
          throw new Error(
            "Le total est limité à 120 images distinctes pour cette annonce.",
          );
        if (
          !["image/jpeg", "image/png", "image/webp"].includes(file.type) ||
          file.size > 10 * 1024 * 1024
        )
          throw new Error(
            "Ajoutez une image JPEG, PNG ou WebP de moins de 10 Mo.",
          );
        const form = new FormData();
        form.set("listingId", listing.id);
        form.set("file", file);
        const r = await api<{ data: { url: string; id: string } }>(
          "/api/uploads",
          { method: "POST", body: form },
        );
        urls.push(r.data.url);
        union.add(r.data.url);
        if (target === "general") change({ photos: [...urls] });
        else
          change({
            spacePhotos: {
              ...latest.current?.spacePhotos,
              [target]: [...urls],
            },
          });
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setUploading(false);
    }
  }
  function removePhoto(index: number) {
    if (!listing) return;
    if (photoTarget === "general")
      change({ photos: listing.photos.filter((_, n) => n !== index) });
    else
      change({
        spacePhotos: {
          ...listing.spacePhotos,
          [photoTarget]: (listing.spacePhotos?.[photoTarget] || []).filter(
            (_, n) => n !== index,
          ),
        },
      });
  }

  function validateStep() {
    if (!listing) return false;
    let message = "";
    if (step === 1 && (!listing.city.trim() || !listing.district.trim()))
      message = "Indiquez la ville et le quartier du parking.";
    if (step === 1 && !locationConfirmed)
      message =
        "Vérifiez le point de localisation puis confirmez qu’il correspond au secteur ou à l’adresse que vous autorisez.";
    if (
      step === 2 &&
      (!listing.spaces.length || listing.spaces.some((s) => !s.number.trim()))
    )
      message = "Renseignez un numéro ou une référence pour chaque place.";
    if (step === 4 && listing.photos.length < 3)
      message =
        "Ajoutez au moins 3 photos pour présenter le bien et ses contraintes.";
    if (
      step === 5 &&
      (!Number.isSafeInteger(listing.priceCents) || listing.priceCents <= 0)
    )
      message = "Indiquez un prix total de vente positif.";
    if (
      step === 6 &&
      (listing.title.length < 15 ||
        listing.title.length > 90 ||
        listing.description.length < 100 ||
        listing.description.length > 5000)
    )
      message =
        "Le titre doit comporter 15 à 90 caractères et la description 100 à 5 000 caractères.";
    setError(message);
    return !message;
  }
  async function next() {
    if (!validateStep()) return;
    await save();
    setStep((s) => Math.min(7, s + 1));
    window.scrollTo({ top: 0, behavior: "instant" });
  }
  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!latest.current || !attest) return;
    if (!locationConfirmed) {
      setError(
        "Confirmez le point de localisation avant de soumettre votre annonce.",
      );
      setStep(1);
      return;
    }
    setBusy(true);
    setError("");
    try {
      const saved = await save();
      if (!saved)
        throw new Error("Attendez la fin de l’enregistrement puis réessayez.");
      await api(`/api/listings/${saved.id}/submit`, {
        method: "POST",
        body: JSON.stringify({
          version: saved.version,
          ownershipAttested: true,
        }),
      });
      dirty.current = false;
      setSubmitted(true);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  if (loading)
    return (
      <main id="main" className="page-shell account-loading" role="status">
        Reprise de votre brouillon…
      </main>
    );
  if (submitted)
    return (
      <main id="main" className="page-shell account-submitted">
        <CheckCircle2 size={48} />
        <p className="account-eyebrow">BIEN REÇU</p>
        <h1>
          Votre annonce est
          <br />
          entre de bonnes mains.
        </h1>
        <p>
          Elle a été transmise à la modération. Vous retrouverez son statut et
          les éventuelles demandes de correction dans votre espace.
        </p>
        <Link href="/compte/annonces" className="button button-primary">
          Suivre mon annonce
          <ArrowRight size={18} />
        </Link>
      </main>
    );
  if (!listing)
    return (
      <main id="main" className="page-shell account-wizard-start">
        <span className="badge">DÉPÔT GRATUIT · V1</span>
        <h1>
          Votre parking mérite
          <br />
          la bonne présentation.
        </h1>
        <p>
          Quelques étapes pour montrer ce qui compte : l’emplacement, les
          dimensions, les photos et l’état réel.
        </p>
        <div className="account-start-steps">
          <div>
            <Check size={20} />
            <span>Un brouillon sauvegardé à chaque étape</span>
          </div>
          <div>
            <Check size={20} />
            <span>Une annonce relue avant sa publication</span>
          </div>
          <div>
            <Check size={20} />
            <span>Vos plans et documents sources restent privés</span>
          </div>
        </div>
        {error ? (
          <p className="error" role="alert">
            {error}
          </p>
        ) : null}
        <button
          className="button button-primary"
          disabled={creating}
          onClick={create}
        >
          {creating
            ? "Création du brouillon…"
            : hasPreparation
              ? "Reprendre ma préparation dans un brouillon privé"
              : "Commencer mon annonce"}
          <ArrowRight size={18} />
        </button>
      </main>
    );
  const selectedPhotos =
    photoTarget === "general"
      ? listing.photos
      : listing.spacePhotos?.[photoTarget] || [];
  const imageUnion = new Set([
    ...listing.photos,
    ...Object.values(listing.spacePhotos || {}).flat(),
  ]);
  const shareable = new Map<string, string[]>();
  for (const [spaceId, photos] of Object.entries(listing.spacePhotos || {})) {
    if (spaceId === photoTarget) continue;
    const label =
      listing.spaces.find((s) => s.id === spaceId)?.number || "sans numéro";
    for (const photo of photos) {
      if (selectedPhotos.includes(photo) || listing.photos.includes(photo))
        continue;
      shareable.set(photo, [...(shareable.get(photo) || []), label]);
    }
  }
  return (
    <main id="main" className="page-shell account-wizard">
      <div className="account-wizard-top">
        <Link href="/compte/annonces">
          <ArrowLeft size={18} />
          Mes annonces
        </Link>
        <div className="account-save-state" role="status">
          {saveState === "saving" ? (
            <LoaderCircle size={16} className="account-spin" />
          ) : saveState === "saved" ? (
            <Check size={16} />
          ) : (
            <Save size={16} />
          )}
          {
            {
              saved: "Brouillon enregistré",
              dirty: "Modifications à enregistrer",
              saving: "Enregistrement…",
              error: "Enregistrement à réessayer",
            }[saveState]
          }
          <button
            className="button button-secondary"
            onClick={() => {
              void save();
            }}
            disabled={saveState === "saving"}
          >
            Sauvegarder
          </button>
        </div>
      </div>
      <div className="account-wizard-layout">
        <aside className="account-wizard-steps">
          <p className="account-eyebrow">VOTRE ANNONCE</p>
          <h2>
            Chaque détail
            <br />
            fait la différence.
          </h2>
          <ol>
            {steps.map((label, index) => (
              <li
                key={label}
                className={
                  step === index ? "active" : index < step ? "complete" : ""
                }
              >
                <button
                  onClick={() => {
                    setStep(index);
                    setError("");
                  }}
                  aria-current={step === index ? "step" : undefined}
                >
                  <span>{index < step ? <Check size={14} /> : index + 1}</span>
                  {label}
                </button>
              </li>
            ))}
          </ol>
          <p className="muted">
            Vous pouvez revenir sur chaque étape. Les informations inconnues
            restent indiquées comme telles.
          </p>
        </aside>
        <section className="account-wizard-content">
          <span className="account-eyebrow">ÉTAPE {step + 1} SUR 8</span>
          <h1>{steps[step]}</h1>
          {error ? (
            <p className="error" role="alert">
              {error}
            </p>
          ) : null}
          {saveState === "error" ? (
            <button
              className="button button-secondary"
              onClick={async () => {
                if (
                  !window.confirm(
                    "Recharger le brouillon enregistré ? Vos modifications locales non sauvegardées seront remplacées.",
                  )
                )
                  return;
                try {
                  const r = await api<{ data: Listing }>(
                    `/api/listings/${listing.id}?draft=1`,
                  );
                  latest.current = r.data;
                  setListing(r.data);
                  dirty.current = false;
                  setSaveState("saved");
                  setError("");
                } catch (e) {
                  setError((e as Error).message);
                }
              }}
            >
              Recharger la version enregistrée
            </button>
          ) : null}
          {partialSale ? (
            <p className="notice">
              Vente partielle du lot : retirez uniquement les places déjà
              vendues, contrôlez chaque place restante et indiquez un nouveau
              prix total à l’étape Prix de vente. Aucun prorata n’est calculé.
              La nouvelle version devra être approuvée ; si l’ancienne offre
              n’est plus valable pendant la correction, mettez-la en pause
              depuis Mes annonces.
            </p>
          ) : null}
          {listing.status === "suspended" ? (
            <p className="notice">
              Annonce suspendue : corrigez les informations puis soumettez une
              nouvelle version. La modération doit l’approuver avant toute
              remise en ligne.
            </p>
          ) : null}
          {listing.status === "pending" ? (
            <div className="notice">
              Cette version est en cours de relecture. Une modification peut
              nécessiter une nouvelle soumission.
            </div>
          ) : null}
          {listing.status === "published" ? (
            <div className="notice">
              Vos modifications préparent une nouvelle révision. La version déjà
              approuvée reste visible jusqu’à la prochaine décision.
            </div>
          ) : null}
          {step === 0 ? (
            <>
              <p className="muted">
                Une place, un box ou plusieurs unités d’un même parking :
                décrivez ce que vous proposez.
              </p>
              <div className="account-type-options">
                {(["covered", "box", "outdoor"] as const).map((t) => (
                  <button
                    key={t}
                    className={listing.type === t ? "active" : ""}
                    aria-pressed={listing.type === t}
                    onClick={() => change({ type: t })}
                  >
                    <span>{typeLabels[t]}</span>
                    {listing.type === t ? <CheckCircle2 size={20} /> : null}
                  </button>
                ))}
              </div>
              <label className="field">
                Combien de places vendez-vous ensemble ?
                <input
                  className="input"
                  type="number"
                  min="1"
                  max="500"
                  value={listing.spaces.length}
                  onChange={(e) => {
                    const qty = Math.min(
                      500,
                      Math.max(1, Number(e.target.value) || 1),
                    );
                    change({
                      spaces: Array.from(
                        { length: qty },
                        (_, i) => listing.spaces[i] || newSpace(String(i + 1)),
                      ),
                    });
                  }}
                />
              </label>
              <div className="notice">
                <Info size={18} />
                <p>
                  {listing.spaces.length > 1
                    ? `Ce lot de ${listing.spaces.length} places sera proposé avec un seul prix total. Pour une vente à l’unité, créez des annonces distinctes.`
                    : "Votre annonce proposera une place unique."}{" "}
                  Une annonce concerne un seul parking/site.
                </p>
              </div>
            </>
          ) : null}
          {step === 1 ? (
            <>
              <p className="muted">
                Situez votre parking. Par défaut, seule une localisation de
                quartier sera publique.
              </p>
              <div className="form-grid">
                <label className="field">
                  Ville
                  <input
                    className="input"
                    value={listing.city}
                    maxLength={80}
                    onChange={(e) => change({ city: e.target.value })}
                    placeholder="Lyon"
                    required
                  />
                </label>
                <label className="field">
                  Quartier
                  <input
                    className="input"
                    value={listing.district}
                    maxLength={100}
                    onChange={(e) => change({ district: e.target.value })}
                    placeholder="Part-Dieu"
                    required
                  />
                </label>
              </div>
              <label className="field">
                Adresse du parking · privée par défaut
                <input
                  className="input"
                  value={listing.address || ""}
                  maxLength={200}
                  onChange={(e) => change({ address: e.target.value })}
                  autoComplete="street-address"
                  placeholder="Numéro et nom de rue"
                />
              </label>
              <fieldset className="account-fieldset">
                <legend>Précision affichée aux acheteurs</legend>
                <label className="account-radio">
                  <input
                    type="radio"
                    checked={listing.locationPrecision === "area"}
                    onChange={() =>
                      change({
                        locationPrecision: "area",
                        sceneAvailable: false,
                      })
                    }
                  />
                  <span>
                    <strong>Le quartier uniquement</strong>
                    <small>
                      La scène intérieure et les références du parking ne sont
                      pas rendues publiques.
                    </small>
                  </span>
                </label>
                <label className="account-radio">
                  <input
                    type="radio"
                    checked={listing.locationPrecision === "exact_opt_in"}
                    onChange={() =>
                      change({ locationPrecision: "exact_opt_in" })
                    }
                  />
                  <span>
                    <strong>La position exacte</strong>
                    <small>
                      J’accepte que la localisation précise soit publiée. Une 3D
                      pourra être ajoutée après revue des sources.
                    </small>
                  </span>
                </label>
              </fieldset>
              <div className="notice">
                <p>
                  Indiquez le point à afficher sur la carte. Pour une
                  localisation de quartier, choisissez un point de secteur sans
                  révéler l’adresse exacte.
                </p>
              </div>
              <div className="form-grid">
                <label className="field">
                  Longitude
                  <input
                    className="input"
                    type="number"
                    min="-180"
                    max="180"
                    step="0.000001"
                    value={listing.coordinates[0]}
                    onChange={(e) =>
                      change({
                        coordinates: [
                          Number(e.target.value),
                          listing.coordinates[1],
                        ],
                      })
                    }
                  />
                </label>
                <label className="field">
                  Latitude
                  <input
                    className="input"
                    type="number"
                    min="-90"
                    max="90"
                    step="0.000001"
                    value={listing.coordinates[1]}
                    onChange={(e) =>
                      change({
                        coordinates: [
                          listing.coordinates[0],
                          Number(e.target.value),
                        ],
                      })
                    }
                  />
                </label>
              </div>
              <p className="muted">
                Ces coordonnées sont proposées à titre de point de départ.
                Vérifiez-les et corrigez-les pour votre bien ; elles ne
                constituent pas un relevé mesuré.
              </p>
              <label className="account-checkbox">
                <input
                  type="checkbox"
                  checked={locationConfirmed}
                  onChange={(e) => setLocationConfirmed(e.target.checked)}
                />
                <span>
                  Je confirme que ce point correspond au quartier ou à la
                  position exacte que j’autorise à afficher.
                </span>
              </label>
            </>
          ) : null}
          {step === 2 ? (
            <>
              <p className="muted">
                Renseignez chaque unité. Laissez une dimension vide si vous ne
                la connaissez pas : nous afficherons « Non renseigné ».
              </p>
              {listing.spaces.map((space, index) => (
                <fieldset key={space.id} className="account-space-fieldset">
                  <legend>Place {index + 1}</legend>
                  <div className="form-grid">
                    <label className="field">
                      Numéro / référence publique
                      <input
                        className="input"
                        maxLength={30}
                        value={space.number}
                        onChange={(e) =>
                          spaceChange(index, "number", e.target.value)
                        }
                      />
                    </label>
                    <label className="field">
                      Niveau
                      <input
                        className="input"
                        type="number"
                        min="-20"
                        max="20"
                        value={space.level}
                        onChange={(e) =>
                          spaceChange(index, "level", Number(e.target.value))
                        }
                      />
                    </label>
                    <NumField
                      label="Surface"
                      value={space.areaM2}
                      unit="m²"
                      onChange={(v) => spaceChange(index, "areaM2", v)}
                    />
                    <NumField
                      label="Longueur"
                      value={space.lengthM}
                      onChange={(v) => spaceChange(index, "lengthM", v)}
                    />
                    <NumField
                      label="Largeur"
                      value={space.widthM}
                      onChange={(v) => spaceChange(index, "widthM", v)}
                    />
                    <NumField
                      max={20}
                      label="Hauteur libre minimale"
                      value={space.clearanceM}
                      onChange={(v) => spaceChange(index, "clearanceM", v)}
                    />
                  </div>
                </fieldset>
              ))}
              <p className="notice">
                Les dimensions saisies sont déclaratives. Un modèle mesuré exige
                des sources et des distances de contrôle supplémentaires.
              </p>
            </>
          ) : null}
          {step === 3 ? (
            <>
              <label className="field">
                Périmètre de la description
                <select
                  className="input"
                  value={qualityTarget}
                  onChange={(e) => setQualityTarget(e.target.value)}
                >
                  <option value="general">État commun du parking</option>
                  {listing.spaces.map((space, index) => (
                    <option key={space.id} value={space.id}>
                      Place {space.number || index + 1} · niveau {space.level}
                    </option>
                  ))}
                </select>
              </label>
              <p className="notice">
                Déclarations du vendeur. Chaque place conserve ses propres
                informations ; un champ vide reste non renseigné, sans reprendre
                l’état commun. Les photos associées ne constituent pas une
                validation automatique.
              </p>
              <label className="field">
                Date des observations de ce périmètre · facultative
                <input
                  className="input"
                  type="date"
                  max={new Date().toISOString().slice(0, 10)}
                  value={
                    (qualityTarget === "general"
                      ? listing.quality.observedAt || listing.observedAt
                      : listing.unitQuality?.[qualityTarget]?.observedAt
                    )?.slice(0, 10) || ""
                  }
                  onChange={(e) =>
                    quality(
                      "observedAt",
                      e.target.value ? `${e.target.value}T00:00:00.000Z` : null,
                    )
                  }
                />
              </label>
              <label className="field">
                Origine déclarée par le vendeur
                <select
                  className="input"
                  value={
                    (qualityTarget === "general"
                      ? listing.quality
                      : listing.unitQuality?.[qualityTarget]
                    )?.basis || "unknown"
                  }
                  onChange={(e) =>
                    quality("basis", e.target.value as Quality["basis"])
                  }
                >
                  <option value="unknown">À préciser</option>
                  <option value="seller_observation">
                    Observation du vendeur
                  </option>
                  <option value="provided_document">Document fourni</option>
                </select>
              </label>
              <p className="muted">
                Montrez le parking tel qu’il est. Décrivez les limites et les
                défauts visibles : ils aident à préparer une visite utile.
              </p>
              <div className="form-grid">
                {(
                  [
                    ["floor", "Sol"],
                    ["lighting", "Éclairage"],
                    ["humidity", "Humidité"],
                    ["access", "Accès et fermeture"],
                    ["maneuver", "Manœuvres"],
                  ] as [keyof Quality, string][]
                ).map(([key, label]) => (
                  <label className="field" key={key}>
                    {label}
                    <input
                      className="input"
                      value={
                        (qualityTarget === "general"
                          ? listing.quality
                          : listing.unitQuality?.[qualityTarget])?.[key] || ""
                      }
                      maxLength={500}
                      placeholder="Non renseigné"
                      onChange={(e) => quality(key, e.target.value)}
                    />
                  </label>
                ))}
              </div>
              <label className="field">
                Observations, contraintes et défauts
                <textarea
                  className="input"
                  rows={5}
                  maxLength={3000}
                  value={
                    (qualityTarget === "general"
                      ? listing.quality
                      : listing.unitQuality?.[qualityTarget]
                    )?.observations || ""
                  }
                  onChange={(e) => quality("observations", e.target.value)}
                  placeholder="Ex. poteau à gauche de la place, marquage usé, traces visibles sur un mur…"
                />
              </label>
              <div className="notice">
                <Info size={18} />
                <p>
                  Une absence de trace visible ne garantit pas l’absence
                  d’infiltration. Ne partagez pas de code d’accès, de badge
                  lisible ni de donnée personnelle.
                </p>
              </div>
            </>
          ) : null}
          {step === 4 ? (
            <>
              <p className="muted">
                Ajoutez au moins 3 photos générales : contexte, accès et
                manœuvre. Reliez ensuite les vues propres à chaque place, sans
                présenter une vue commune comme sa preuve individuelle.
              </p>
              <label className="field">
                Ajouter des photos à
                <select
                  className="input"
                  value={photoTarget}
                  disabled={uploading}
                  onChange={(e) => {
                    setPhotoTarget(e.target.value);
                    setShareExisting(false);
                  }}
                >
                  <option value="general">Galerie générale du parking</option>
                  {listing.spaces.map((space, index) => (
                    <option key={space.id} value={space.id}>
                      Place {space.number || index + 1} · niveau {space.level}
                    </option>
                  ))}
                </select>
              </label>
              <div className="account-photo-target-note">
                <span className="badge">
                  {photoTarget === "general"
                    ? "VUE DU PARKING"
                    : `PHOTOS DE LA PLACE ${listing.spaces.find((s) => s.id === photoTarget)?.number || ""}`}
                </span>
                <p>
                  {photoTarget === "general"
                    ? "Les photos générales montrent le contexte commun. Elles ne documentent pas automatiquement chaque unité."
                    : "Ces vues sont rattachées à cette unité uniquement. Leur correspondance et les contraintes visibles seront relues en modération."}
                </p>
              </div>
              <label className="account-upload">
                <CloudUpload size={32} />
                <strong>
                  {uploading ? "Traitement des images…" : "Ajouter des photos"}
                </strong>
                <span>JPEG, PNG ou WebP · 10 Mo maximum par image</span>
                <input
                  aria-label={
                    photoTarget === "general"
                      ? "Ajouter des photos générales"
                      : "Ajouter des photos pour la place sélectionnée"
                  }
                  type="file"
                  multiple
                  accept="image/jpeg,image/png,image/webp"
                  disabled={
                    uploading ||
                    selectedPhotos.length >=
                      (photoTarget === "general" ? 20 : 6) ||
                    imageUnion.size >= 120
                  }
                  onChange={(e) => {
                    void upload(e.target.files);
                    e.target.value = "";
                  }}
                />
              </label>
              <div className="account-photo-grid">
                {selectedPhotos.map((photo, index) => (
                  <div key={`${photo}-${index}`}>
                    <img
                      src={photo}
                      alt={
                        photoTarget === "general"
                          ? `Vue du parking ${index + 1}`
                          : `Photo déclarée de la place sélectionnée ${index + 1}`
                      }
                      loading="lazy"
                    />
                    <span>
                      {photoTarget === "general"
                        ? index === 0
                          ? "Vue du parking · principale"
                          : "Vue du parking"
                        : `Photo de la place · ${index + 1}`}
                    </span>
                    <button
                      aria-label={`Retirer la photo ${index + 1} de cette galerie`}
                      disabled={uploading}
                      onClick={() => removePhoto(index)}
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                ))}
              </div>
              <p className="muted">
                {selectedPhotos.length}/{photoTarget === "general" ? 20 : 6}{" "}
                photos dans cette galerie · {imageUnion.size}/120 images
                distinctes pour l’annonce. Les images restent privées jusqu’à
                approbation.
              </p>
              {photoTarget !== "general" && shareable.size ? (
                <section className="account-share-photos">
                  <button
                    className="button button-secondary"
                    disabled={uploading || selectedPhotos.length >= 6}
                    aria-expanded={shareExisting}
                    onClick={() => setShareExisting((v) => !v)}
                  >
                    Associer une photo partagée existante
                  </button>
                  {shareExisting ? (
                    <>
                      <p className="muted">
                        Choisissez uniquement une vue où la place sélectionnée
                        est identifiable. Le même fichier peut décrire plusieurs
                        unités sans être compté plusieurs fois dans les 120
                        images distinctes.
                      </p>
                      <div className="account-photo-grid">
                        {[...shareable].map(([photo, numbers]) => (
                          <button
                            key={photo}
                            type="button"
                            className="account-shared-photo-option"
                            disabled={uploading || selectedPhotos.length >= 6}
                            onClick={() => {
                              if (selectedPhotos.length >= 6) {
                                setError(
                                  "Cette galerie comporte déjà 6 photos.",
                                );
                                return;
                              }
                              change({
                                spacePhotos: {
                                  ...listing.spacePhotos,
                                  [photoTarget]: [...selectedPhotos, photo],
                                },
                              });
                              setShareExisting(false);
                            }}
                          >
                            <img
                              src={photo}
                              alt={`Vue déjà rattachée aux places ${numbers.join(", ")}`}
                              loading="lazy"
                            />
                            <span>
                              Places {numbers.join(", ")} · associer à cette
                              place
                            </span>
                          </button>
                        ))}
                      </div>
                    </>
                  ) : null}
                </section>
              ) : null}
              <section className="account-photo-coverage">
                <h2>Couverture par place</h2>
                <p className="muted">
                  Un rattachement déclaré ne constitue pas une vérification de
                  l’état ou une preuve de couverture complète.
                </p>
                {listing.spaces.map((space, index) => {
                  const count = listing.spacePhotos?.[space.id]?.length || 0;
                  return (
                    <div key={space.id}>
                      <div>
                        <strong>Place {space.number || index + 1}</strong>
                        <span>
                          {count
                            ? `Couverture partielle déclarée · ${count} photo${count > 1 ? "s" : ""} · à vérifier`
                            : "Aucune photo propre · vues communes uniquement si disponibles"}
                        </span>
                      </div>
                      <button
                        className="button button-secondary"
                        disabled={uploading}
                        onClick={() => setPhotoTarget(space.id)}
                      >
                        Voir cette galerie
                      </button>
                    </div>
                  );
                })}
              </section>
              <div className="notice">
                <ImagePlus size={20} />
                <p>
                  Floutez les plaques et les personnes avant le dépôt. Les
                  défauts et obstacles doivent rester visibles. Pour un grand
                  lot partiellement photographié, la couverture incomplète reste
                  explicitement indiquée.
                </p>
              </div>
              <p>
                La préparation d’une vue 3D fidèle passe par vos plans et
                sources privés dans l’espace{" "}
                <Link href="/compte/scenes">Mes plans et vues 3D</Link>. Aucun
                modèle n’est inventé à partir de ces seules photos.
              </p>
            </>
          ) : null}
          {step === 5 ? (
            <>
              <p className="muted">
                Le montant présenté sera le prix total de l’annonce, pour{" "}
                {listing.spaces.length > 1
                  ? `l’ensemble des ${listing.spaces.length} places`
                  : "la place"}
                .
              </p>
              <label className="field">
                Prix total de vente
                <span className="account-unit-field">
                  <input
                    className="input account-price-input"
                    type="number"
                    min="1"
                    max="100000000"
                    step="1"
                    value={listing.priceCents ? listing.priceCents / 100 : ""}
                    onChange={(e) =>
                      change({
                        priceCents: Math.round(Number(e.target.value) * 100),
                      })
                    }
                    placeholder="18 500"
                  />
                  <span>€</span>
                </span>
              </label>
              <label className="field">
                Occupation actuelle
                <select
                  className="input"
                  value={listing.occupancy || "unknown"}
                  onChange={(e) =>
                    change({
                      occupancy: e.target.value as Listing["occupancy"],
                    })
                  }
                >
                  <option value="unknown">Non renseignée</option>
                  <option value="vacant">Libre · déclaration vendeur</option>
                  <option value="occupied">
                    Occupée · déclaration vendeur
                  </option>
                </select>
              </label>
              <div className="form-grid">
                <NumField
                  label="Charges annuelles connues"
                  value={
                    listing.annualChargesCents == null
                      ? null
                      : listing.annualChargesCents / 100
                  }
                  unit="€/an"
                  onChange={(v) =>
                    change({
                      annualChargesCents:
                        v == null ? null : Math.round(v * 100),
                    })
                  }
                />
                <NumField
                  label="Taxe foncière annuelle connue"
                  value={
                    listing.propertyTaxCents == null
                      ? null
                      : listing.propertyTaxCents / 100
                  }
                  unit="€/an"
                  onChange={(v) =>
                    change({
                      propertyTaxCents: v == null ? null : Math.round(v * 100),
                    })
                  }
                />
              </div>
              <p className="muted">
                Une case vide indique un montant inconnu. Précisez l’année et le
                périmètre des montants dans votre description.
              </p>
              {listing.spaces.length > 1 ? (
                <p className="muted">
                  Moyenne indicative :{" "}
                  {money(
                    Math.round(listing.priceCents / listing.spaces.length),
                  )}{" "}
                  par place. Le lot n’est pas vendu séparément.
                </p>
              ) : null}
              <div className="notice">
                <Info size={18} />
                <p>
                  La plateforme met acheteur et vendeur en relation. Elle
                  n’encaisse pas le prix immobilier. Aucun forfait ni paiement à
                  l’annonce n’est actif en V1.
                </p>
              </div>
            </>
          ) : null}
          {step === 6 ? (
            <>
              <label className="field">
                Titre de l’annonce
                <input
                  className="input"
                  minLength={15}
                  maxLength={90}
                  value={listing.title}
                  onChange={(e) => change({ title: e.target.value })}
                  placeholder="Place couverte · Lyon Part-Dieu"
                />
                <small>{listing.title.length}/90 caractères · minimum 15</small>
              </label>
              <label className="field">
                Description
                <textarea
                  className="input"
                  rows={8}
                  minLength={100}
                  maxLength={5000}
                  value={listing.description}
                  onChange={(e) => change({ description: e.target.value })}
                  placeholder="Présentez le bien, sa situation, les accès et ce que l’acheteur doit savoir avant la visite."
                />
                <small>
                  {listing.description.length}/5 000 caractères · minimum 100
                </small>
              </label>
              <div className="notice">
                <p>
                  Votre nom public : <strong>{user.name}</strong>. Les acheteurs
                  vous contacteront par messagerie. Votre adresse email
                  n’apparaîtra pas dans l’annonce.
                </p>
              </div>
            </>
          ) : null}
          {step === 7 ? (
            <form onSubmit={submit}>
              <p className="muted">
                Relisez les informations qui seront proposées aux acheteurs
                après modération.
              </p>
              <article className="account-preview card">
                {listing.photos[0] ? (
                  <img
                    src={listing.photos[0]}
                    alt="Photo principale de l’annonce"
                  />
                ) : null}
                <div>
                  <span className="badge">APERÇU · NON PUBLIÉ</span>
                  <h2>{listing.title || "Titre à compléter"}</h2>
                  <p>
                    {listing.city} · {listing.district}
                  </p>
                  <h3>{money(listing.priceCents)}</h3>
                  <p>
                    {typeLabels[listing.type]} · {areaLabel(listing.spaces)}
                    {listing.spaces.length > 1
                      ? ` · lot de ${listing.spaces.length} places`
                      : ""}
                  </p>
                  <div className="account-preview-unit-galleries">
                    <h3>Photos propres aux places</h3>
                    {listing.spaces.map((space, index) => {
                      const photos = listing.spacePhotos?.[space.id] || [];
                      return (
                        <section key={space.id}>
                          <strong>Place {space.number || index + 1}</strong>
                          <p className="muted">
                            {photos.length
                              ? `${photos.length} photo(s) rattachée(s) par le vendeur · couverture à vérifier`
                              : "Aucune photo propre fournie · couverture individuelle non établie"}
                          </p>
                          {photos.length ? (
                            <div className="account-photo-grid">
                              {photos.map((photo, n) => (
                                <div key={`${photo}-${n}`}>
                                  <img
                                    src={photo}
                                    alt={`Photo déclarée de la place ${space.number || index + 1}`}
                                    loading="lazy"
                                  />
                                  <span>Place {space.number || index + 1}</span>
                                </div>
                              ))}
                            </div>
                          ) : null}
                        </section>
                      );
                    })}
                  </div>
                  <p className="account-preview-description">
                    {listing.description || "Description à compléter"}
                  </p>
                  <p>
                    Occupation :{" "}
                    {
                      {
                        vacant: "Libre · déclaré",
                        occupied: "Occupée · déclaré",
                        unknown: "Non renseignée",
                      }[listing.occupancy || "unknown"]
                    }
                    . Charges :{" "}
                    {listing.annualChargesCents == null
                      ? "non renseignées"
                      : `${money(listing.annualChargesCents)}/an`}
                    . Taxe foncière :{" "}
                    {listing.propertyTaxCents == null
                      ? "non renseignée"
                      : `${money(listing.propertyTaxCents)}/an`}
                    .
                  </p>
                  <h3>État commun · déclaration vendeur</h3>
                  <QualitySummary quality={listing.quality} common />
                  <p className="notice">
                    Localisation publique :{" "}
                    {listing.locationPrecision === "area"
                      ? "quartier uniquement, sans scène intérieure"
                      : "position exacte autorisée"}
                    . La 3D n’est disponible qu’après une revue spécifique.
                  </p>
                </div>
              </article>
              {!user.emailVerified ? (
                <p className="notice">
                  Votre email doit être confirmé avant la soumission.{" "}
                  <Link href="/verifier-email">Vérifier mon email</Link>
                </p>
              ) : null}
              <label className="account-checkbox">
                <input
                  type="checkbox"
                  checked={attest}
                  onChange={(e) => setAttest(e.target.checked)}
                  required
                />
                <span>
                  J’atteste disposer des droits nécessaires pour publier cette
                  annonce et ces images. Les informations reflètent le bien et
                  ses limites connues.
                </span>
              </label>
              <button
                className="button button-primary"
                disabled={
                  !attest ||
                  !user.emailVerified ||
                  busy ||
                  uploading ||
                  saveState === "saving"
                }
              >
                {busy ? "Envoi en cours…" : "Soumettre à la modération"}
                <ArrowRight size={18} />
              </button>
              <p className="muted">
                Votre annonce ne sera pas publiée automatiquement.
              </p>
            </form>
          ) : null}
          {step < 7 ? (
            <div className="account-wizard-actions">
              <button
                className="button button-secondary"
                disabled={step === 0}
                onClick={() => {
                  setStep((s) => s - 1);
                  setError("");
                }}
              >
                <ArrowLeft size={18} />
                Retour
              </button>
              <button
                className="button button-primary"
                onClick={next}
                disabled={uploading || saveState === "saving"}
              >
                {step === 6 ? "Prévisualiser" : "Continuer"}
                {step === 6 ? <Eye size={18} /> : <ArrowRight size={18} />}
              </button>
            </div>
          ) : (
            <button
              className="button button-secondary account-preview-back"
              onClick={() => setStep(6)}
            >
              <ArrowLeft size={18} />
              Modifier la description
            </button>
          )}
        </section>
      </div>
    </main>
  );
}
export default function ListingWizard({ id }: { id?: string }) {
  const session = useSession();
  if (id)
    return (
      <AccountGate>
        {(user) => <WizardContent user={user} id={id} />}
      </AccountGate>
    );
  if (session.loading)
    return (
      <main id="main" className="page-shell" role="status">
        Vérification de votre session…
      </main>
    );
  return session.user ? (
    <WizardContent user={session.user} />
  ) : (
    <PreparationForm />
  );
}
