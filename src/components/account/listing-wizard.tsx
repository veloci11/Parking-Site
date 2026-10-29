"use client";
import FilterSelect from "../FilterSelect";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
} from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
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
import {
  ConditionEvidenceEditor,
  ConditionEvidenceSummary,
} from "./condition-evidence";
import { editableConditions } from "@/lib/condition-observations";
import {
  emptyCommercialDetails,
  emptyUnitDetails,
} from "@/lib/commercial-details";
import LocationPicker from "./location-picker";
import { ModelRequest } from "./modeling-request";
import "@/styles/wizard-simplified.css";
import {
  listingPrice,
  offerLabel,
  spaceOffer,
  lotOfferChange,
} from "@/lib/listing-price";
import { CommercialEditor } from "./commercial-editor";
import {
  createDraftSpace,
  parseSpaceCount,
  resizeDraftSpaces,
} from "@/lib/draft-spaces";
import { createDraftSaveQueue } from "@/lib/draft-save-queue";
import { draftNavigationTarget } from "@/lib/draft-navigation";
import { CommercialSummary } from "../CommercialSummary";
import {
  wizardIssues,
  wizardStepIssues,
  type WizardIssue,
} from "@/lib/listing-wizard-validation";
import { useSession } from "@/lib/client";
import DepositSignIn from "./preparation";
import {
  areaLabel,
  spaceLevelLabel,
  money,
  typeLabels,
  type Listing,
  type Quality,
  type Space,
  type User,
} from "@/lib/types";
const steps = [
  "Localisation et places",
  "Photos et description",
  "Vérifier et envoyer",
];
const offerStatusLabels = {
  available: "Disponible",
  reserved: "Réservée",
  sold: "Vendue",
  rented: "Louée",
  withdrawn: "Retirée",
} as const;
function spaceLabel(space: Space | undefined, index: number) {
  return space?.number.trim()
    ? `Place ${space.number.trim()}`
    : `${index >= 0 ? `Emplacement ${index + 1}` : "Emplacement sélectionné"} · numéro non renseigné`;
}
function PaintedNumberField({
  space,
  index,
  onChange,
}: {
  space: Space;
  index: number;
  onChange: (value: string) => void;
}) {
  return (
    <label className="field">
      Numéro de la place
      <input
        className="input"
        aria-label={`Numéro de la place — emplacement ${index + 1}`}
        maxLength={40}
        placeholder="18"
        value={space.number}
        onChange={(event) => onChange(event.target.value)}
      />
      <small>Public · facultatif si inconnu</small>
    </label>
  );
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
          step={unit === "m" ? "0.001" : "0.01"}
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
  const router = useRouter();
  const [listing, setListing] = useState<Listing | null>(null),
    [preview, setPreview] = useState<Listing | null>(null),
    [previewError, setPreviewError] = useState(""),
    [previewAttempt, setPreviewAttempt] = useState(0),
    [issuesForStep, setIssuesForStep] = useState<number | null>(null),
    [feedbackFocus, setFeedbackFocus] = useState<{
      target: "summary" | "error" | "field";
    } | null>(null),
    [step, setStep] = useState(0),
    [loading, setLoading] = useState(!!id),
    [creating, setCreating] = useState(false),
    [sellerType, setSellerType] = useState<User["sellerType"]>(
      user.sellerType ?? null,
    ),
    [savingSellerType, setSavingSellerType] = useState(false),
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
    [locationSelectionPending, setLocationSelectionPending] = useState(false),
    [locationReload, setLocationReload] = useState(0),
    [spaceCountInput, setSpaceCountInput] = useState<string | null>(null),
    [leaving, setLeaving] = useState(false),
    [busy, setBusy] = useState(false);
  const cachedOffers = useRef(new Map<string, NonNullable<Space["offer"]>>());
  const issueSummary = useRef<HTMLDivElement>(null),
    formError = useRef<HTMLParagraphElement>(null),
    pendingIssue = useRef<WizardIssue | null>(null),
    stepHeading = useRef<HTMLHeadingElement>(null),
    submittedHeading = useRef<HTMLHeadingElement>(null),
    previousStep = useRef(step);
  const latest = useRef<Listing | null>(null),
    dirty = useRef(false),
    navigationPending = useRef(false),
    seq = useRef(0),
    mounted = useRef(true);
  useEffect(() => {
    if (submitted) {
      submittedHeading.current?.focus({ preventScroll: true });
      window.scrollTo({ top: 0, behavior: "instant" });
    } else if (previousStep.current !== step) {
      stepHeading.current?.focus({ preventScroll: true });
      window.scrollTo({ top: 0, behavior: "instant" });
    }
    previousStep.current = step;
  }, [step, submitted]);
  useEffect(() => {
    if (!feedbackFocus) return;
    let target: HTMLElement | null;
    if (feedbackFocus.target === "field") {
      const issue = pendingIssue.current;
      if (!issue || issue.step !== step) return;
      pendingIssue.current = null;
      target = document.getElementById(issue.field);
      for (let parent = target; parent; parent = parent.parentElement)
        if (parent instanceof HTMLDetailsElement) parent.open = true;
    } else {
      target =
        feedbackFocus.target === "summary"
          ? issueSummary.current
          : formError.current;
    }
    target?.focus({ preventScroll: true });
    target?.scrollIntoView({ block: "center", behavior: "instant" });
    setFeedbackFocus(null);
  }, [feedbackFocus, step]);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  useEffect(() => {
    if (
      id &&
      new URLSearchParams(window.location.search).get("partial") === "1"
    ) {
      setPartialSale(true);
      setStep(0);
    }
  }, [id]);
  useEffect(() => {
    if (!id) return;
    setLoading(true);
    api<{ data: Listing }>(`/api/listings/${id}?draft=1`)
      .then((r) => {
        cachedOffers.current.clear();
        for (const space of r.data.spaces)
          if (space.offer)
            cachedOffers.current.set(space.id, { ...space.offer });
        setListing(r.data);
        setLocationConfirmed(!!r.data.locationConfirmedAt);
        latest.current = r.data;
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [id]);
  useEffect(() => {
    setPreview(null);
    setPreviewError("");
    if (step !== 2 || !listing?.id || saveState !== "saved") return;
    let active = true;
    api<{ data: Listing }>(`/api/listings/${listing.id}/preview`)
      .then((response) => {
        if (active) setPreview(response.data);
      })
      .catch((error) => {
        if (active) setPreviewError(error.message);
      });
    return () => {
      active = false;
    };
  }, [step, listing?.id, listing?.version, saveState, previewAttempt]);
  async function create() {
    setCreating(true);
    setError("");
    try {
      const r = await api<{ data: Listing }>("/api/listings", {
        method: "POST",
        body: JSON.stringify({
          pricingMode: "per_space",
          spaces: [createDraftSpace()].map((space) => ({
            ...space,
            offer: space.offer || {
              transactionType: "sale",
              priceCents: 0,
              status: "available",
            },
          })),
        }),
      });
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
  const saveCurrent = useCallback(async (): Promise<Listing | null> => {
    if (!latest.current || !dirty.current) return latest.current;
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
          transactionType: current.transactionType || "sale",
          pricingMode: current.pricingMode,
          type: current.type,
          spaces: current.spaces,
          photos: current.photos,
          spacePhotos: current.spacePhotos,
          quality: current.quality,
          unitQuality: current.unitQuality,
          conditionObservations: editableConditions(
            current.conditionObservations,
          ),
          commercialDetails: current.commercialDetails,
          publicCoordinates: current.publicCoordinates,
          locationConfirmedAt: current.locationConfirmedAt,
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
      if (!changed) setLocationConfirmed(!!r.data.locationConfirmedAt);
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
    }
  }, []);
  const save = useMemo(
    () =>
      createDraftSaveQueue(saveCurrent, () => mounted.current && dirty.current),
    [saveCurrent],
  );
  useEffect(() => {
    const leave = (event: MouseEvent) => {
      const countPending =
        spaceCountInput !== null &&
        parseSpaceCount(spaceCountInput) !== latest.current?.spaces.length;
      if (
        (!dirty.current && !uploading && !countPending) ||
        event.defaultPrevented
      )
        return;
      const anchor =
        event.target instanceof Element
          ? event.target.closest("a[href]")
          : null;
      if (
        !(anchor instanceof HTMLAnchorElement) ||
        anchor.getAttribute("aria-disabled") === "true"
      )
        return;
      const destination = draftNavigationTarget(
        anchor.href,
        window.location.href,
        {
          button: event.button,
          metaKey: event.metaKey,
          ctrlKey: event.ctrlKey,
          altKey: event.altKey,
          shiftKey: event.shiftKey,
          target: anchor.target,
          download: anchor.hasAttribute("download"),
        },
      );
      if (!destination) return;
      event.preventDefault();
      event.stopPropagation();
      if (navigationPending.current) return;
      if (countPending) {
        setStep(0);
        setIssuesForStep(0);
        pendingIssue.current = {
          step: 0,
          field: "listing-space-count",
          message:
            "Validez le nouveau nombre de places ou annulez cette modification.",
        };
        setFeedbackFocus({ target: "field" });
        return;
      }
      if (uploading) {
        setError(
          "Attendez la fin de l’ajout des photos avant de quitter le brouillon.",
        );
        setFeedbackFocus({ target: "error" });
        return;
      }
      navigationPending.current = true;
      setLeaving(true);
      void save()
        .then((saved) => {
          if (!mounted.current) return;
          if (!saved) {
            setFeedbackFocus({ target: "error" });
            return;
          }
          if (destination.origin === window.location.origin)
            router.push(
              `${destination.pathname}${destination.search}${destination.hash}`,
            );
          else window.location.assign(destination.href);
        })
        .finally(() => {
          navigationPending.current = false;
          if (mounted.current) setLeaving(false);
        });
    };
    document.addEventListener("click", leave, true);
    return () => document.removeEventListener("click", leave, true);
  }, [router, save, spaceCountInput, uploading]);
  useEffect(() => {
    if (saveState !== "dirty") return;
    const timer = setTimeout(() => {
      void save();
    }, 900);
    return () => clearTimeout(timer);
  }, [saveState, listing, save]);
  useEffect(() => {
    const guard = (e: BeforeUnloadEvent) => {
      if (
        dirty.current ||
        uploading ||
        (spaceCountInput !== null &&
          parseSpaceCount(spaceCountInput) !== latest.current?.spaces.length)
      ) {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", guard);
    return () => window.removeEventListener("beforeunload", guard);
  }, [spaceCountInput, uploading]);
  function change(patch: Partial<Listing>) {
    if (!latest.current) return;
    if (
      "city" in patch ||
      "district" in patch ||
      "coordinates" in patch ||
      "publicCoordinates" in patch ||
      "address" in patch ||
      "locationPrecision" in patch
    ) {
      setLocationConfirmed(false);
      patch.locationConfirmedAt = null;
    }
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
      next.conditionObservations = next.conditionObservations?.filter(
        (value) => !value.spaceId || allowed.has(value.spaceId),
      );
      if (next.commercialDetails)
        next.commercialDetails = {
          ...next.commercialDetails,
          units: Object.fromEntries(
            Object.entries(next.commercialDetails.units).filter(([id]) =>
              allowed.has(id),
            ),
          ),
        };
      if (qualityTarget !== "general" && !allowed.has(qualityTarget))
        setQualityTarget("general");
      if (photoTarget !== "general" && !allowed.has(photoTarget))
        setPhotoTarget("general");
    }
    if (patch.photos || patch.spacePhotos) {
      if (next.commercialDetails) {
        const photos = new Set([
          ...next.photos,
          ...Object.values(next.spacePhotos || {}).flat(),
        ]);
        next.commercialDetails = {
          ...next.commercialDetails,
          photoMetadata: Object.fromEntries(
            Object.entries(next.commercialDetails.photoMetadata).filter(
              ([id]) => photos.has(`/api/media/${id}`),
            ),
          ),
        };
      }
      next.conditionObservations = next.conditionObservations?.map((value) => {
        const photos = new Set(
          value.spaceId
            ? next.spacePhotos?.[value.spaceId] || []
            : [...next.photos, ...Object.values(next.spacePhotos || {}).flat()],
        );
        const evidenceMediaIds = value.evidenceMediaIds.filter((id) =>
          photos.has(`/api/media/${id}`),
        );
        return {
          ...value,
          evidenceMediaIds,
          ...(value.sourceKind === "photo_documented" &&
          !evidenceMediaIds.length
            ? { sourceKind: "seller_declared" as const }
            : {}),
        };
      });
    }
    seq.current++;
    latest.current = next;
    dirty.current = true;
    setListing(next);
    setSaveState("dirty");
  }
  function changeOffer(
    index: number,
    patch: Partial<NonNullable<Space["offer"]>>,
  ) {
    if (!latest.current) return;
    const value = latest.current;
    change({
      spaces: value.spaces.map((space, n) =>
        n === index
          ? { ...space, offer: { ...spaceOffer(value, space), ...patch } }
          : space,
      ),
    });
  }
  function setPricingMode(mode: "lot" | "per_space") {
    if (!latest.current || (latest.current.pricingMode || "lot") === mode)
      return;
    const value = latest.current;
    if (mode === "lot") {
      for (const space of value.spaces)
        if (space.offer) cachedOffers.current.set(space.id, { ...space.offer });
      change({
        pricingMode: "lot",
        priceCents: 0,
        spaces: value.spaces.map(({ offer: _offer, ...space }) => space),
      });
    } else {
      change({
        pricingMode: "per_space",
        priceCents: 0,
        spaces: value.spaces.map((space) => ({
          ...space,
          offer: cachedOffers.current.get(space.id) || {
            transactionType: value.transactionType || "sale",
            priceCents: 0,
            status: "available",
          },
        })),
      });
    }
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
    if (!latest.current) return false;
    const issues = wizardStepIssues(
      latest.current,
      step,
      locationSelectionPending,
      spaceCountInput,
    );
    setError("");
    if (!issues.length) return true;
    setIssuesForStep(step);
    setFeedbackFocus({ target: "summary" });
    return false;
  }
  async function next() {
    if (!validateStep()) return;
    const saved = await save();
    if (!saved) {
      setFeedbackFocus({ target: "error" });
      return;
    }
    if (step === 0 && !saved.locationConfirmedAt) {
      change({ locationConfirmedAt: new Date().toISOString() });
      const confirmed = await save();
      if (!confirmed?.locationConfirmedAt) {
        setFeedbackFocus({ target: "error" });
        return;
      }
    }
    setIssuesForStep(null);
    setStep((s) => Math.min(2, s + 1));
    window.scrollTo({ top: 0, behavior: "instant" });
  }
  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!latest.current || !attest || busy || savingSellerType) return;
    if (!sellerType) {
      setError(
        "Précisez si vous publiez en tant que particulier ou professionnel.",
      );
      setFeedbackFocus({ target: "error" });
      return;
    }
    if (
      wizardIssues(latest.current, locationSelectionPending, spaceCountInput)
        .length
    ) {
      setIssuesForStep(2);
      setError("");
      setFeedbackFocus({ target: "summary" });
      return;
    }
    if (!locationConfirmed) {
      setError(
        "Confirmez le point de localisation avant de soumettre votre annonce.",
      );
      setStep(0);
      setFeedbackFocus({ target: "error" });
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
      setFeedbackFocus({ target: "error" });
    } finally {
      setBusy(false);
    }
  }
  async function saveSellerType(value: "private" | "professional") {
    if (savingSellerType || busy || value === sellerType) return;
    setSavingSellerType(true);
    setError("");
    try {
      await api("/api/me/profile", {
        method: "PATCH",
        body: JSON.stringify({ sellerType: value }),
      });
      setSellerType(value);
      setPreviewAttempt((attempt) => attempt + 1);
      window.dispatchEvent(new Event("gp:session"));
    } catch (e) {
      setError((e as Error).message);
      setFeedbackFocus({ target: "error" });
    } finally {
      setSavingSellerType(false);
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
        <h1 ref={submittedHeading} tabIndex={-1}>
          Annonce envoyée
        </h1>
        <p>
          Votre annonce sera vérifiée avant sa publication. Son statut est
          disponible dans Mes annonces.
        </p>
        <Link href="/compte/annonces" className="button button-primary">
          Suivre mon annonce
        </Link>
      </main>
    );
  if (!listing)
    return (
      <main id="main" className="page-shell account-wizard-start">
        <h1>Déposer une annonce</h1>
        <p>
          Ajoutez l’adresse, vos places et leurs prix, puis les photos. Vous
          pourrez reprendre votre brouillon à tout moment.
        </p>
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
          {creating ? "Création du brouillon…" : "Créer l’annonce"}
        </button>
      </main>
    );
  const selectedPhotos =
    photoTarget === "general"
      ? listing.photos
      : listing.spacePhotos?.[photoTarget] || [];
  const missing = wizardIssues(
    listing,
    locationSelectionPending,
    spaceCountInput,
  );
  const requestedSpaceCount =
    spaceCountInput === null
      ? listing.spaces.length
      : parseSpaceCount(spaceCountInput);
  const spaceCountPending = requestedSpaceCount !== listing.spaces.length;
  const spaceCountDifference =
    requestedSpaceCount === null
      ? 0
      : requestedSpaceCount - listing.spaces.length;
  const visibleIssues =
    step === 2 || issuesForStep === step
      ? wizardStepIssues(
          listing,
          step,
          locationSelectionPending,
          spaceCountInput,
        )
      : [];
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
        <Link
          href="/compte/annonces"
          aria-busy={leaving}
          onNavigate={(event) => {
            event.preventDefault();
            if (leaving) return;
            if (spaceCountPending) {
              setStep(0);
              setIssuesForStep(0);
              pendingIssue.current =
                missing.find(
                  (issue) => issue.field === "listing-space-count",
                ) || null;
              setFeedbackFocus({ target: "field" });
              return;
            }
            if (uploading) {
              setError(
                "Attendez la fin de l’ajout des photos avant de quitter le brouillon.",
              );
              setFeedbackFocus({ target: "error" });
              return;
            }
            setLeaving(true);
            void save()
              .then((saved) => {
                if (saved) router.push("/compte/annonces");
                else setFeedbackFocus({ target: "error" });
              })
              .finally(() => setLeaving(false));
          }}
        >
          {leaving ? "Enregistrement…" : "Mes annonces"}
        </Link>
        <div className="account-save-state" role="status">
          {saveState === "saving" ? (
            <LoaderCircle size={16} className="account-spin" />
          ) : saveState === "saved" ? (
            <Check size={16} />
          ) : (
            <Save size={16} />
          )}
          {spaceCountPending
            ? "Nombre de places à valider"
            : {
                saved: "Brouillon enregistré",
                dirty: "Modifications à enregistrer",
                saving: "Enregistrement…",
                error: "Enregistrement à réessayer",
              }[saveState]}
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
          <h2>Étapes de l’annonce</h2>
          <ol>
            {steps.map((label, index) => (
              <li
                key={label}
                className={
                  step === index
                    ? "active"
                    : index < step &&
                        !missing.some((issue) => issue.step === index)
                      ? "complete"
                      : ""
                }
              >
                <button
                  onClick={() => {
                    setStep(index);
                    setIssuesForStep(null);
                    setError("");
                  }}
                  aria-current={step === index ? "step" : undefined}
                >
                  <span>
                    {index < step &&
                    !missing.some((issue) => issue.step === index) ? (
                      <Check size={14} />
                    ) : (
                      index + 1
                    )}
                  </span>
                  {label}
                  {missing.some((issue) => issue.step === index) ? (
                    <small className="muted">
                      {" "}
                      · {
                        missing.filter((issue) => issue.step === index).length
                      }{" "}
                      à compléter
                    </small>
                  ) : null}
                </button>
              </li>
            ))}
          </ol>
        </aside>
        <section
          className="account-wizard-content"
          id={
            step === 0
              ? "listing-details"
              : step === 1
                ? "listing-media-description"
                : "listing-preview"
          }
          tabIndex={-1}
          aria-labelledby="wizard-step-title"
        >
          <span className="account-eyebrow">ÉTAPE {step + 1} SUR 3</span>
          <h1 id="wizard-step-title" ref={stepHeading} tabIndex={-1}>
            {steps[step]}
          </h1>
          {visibleIssues.length ? (
            <div
              className="notice account-wizard-errors"
              ref={issueSummary}
              tabIndex={-1}
              role="region"
              aria-labelledby="wizard-errors-title"
            >
              <p id="wizard-errors-title">
                {step === 2
                  ? "À compléter avant d’envoyer l’annonce"
                  : "À compléter pour continuer"}
              </p>
              <ul>
                {visibleIssues.map((issue, index) => (
                  <li key={`${issue.field}-${index}`}>
                    <a
                      href={`#${issue.field}`}
                      onClick={(event) => {
                        event.preventDefault();
                        pendingIssue.current = issue;
                        setStep(issue.step);
                        setIssuesForStep(issue.step);
                        setError("");
                        if (issue.field === "listing-photos")
                          setPhotoTarget("general");
                        setFeedbackFocus({ target: "field" });
                      }}
                    >
                      {issue.message}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
          {error ? (
            <p className="error" role="alert" ref={formError} tabIndex={-1}>
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
                  setLocationConfirmed(!!r.data.locationConfirmedAt);
                  setLocationReload((reload) => reload + 1);
                  setLocationSelectionPending(false);
                  setSpaceCountInput(null);
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
              Mettez à jour le statut des places et le prix du lot. Si l’offre
              en ligne n’est plus valable, mettez l’annonce en pause pendant sa
              vérification.
            </p>
          ) : null}
          {listing.status === "suspended" ? (
            <p className="notice">
              Annonce suspendue. Corrigez les informations puis renvoyez-la pour
              vérification.
            </p>
          ) : null}
          {listing.status === "pending" ? (
            <div className="notice">
              Annonce en cours de vérification. Après modification, envoyez-la à
              nouveau.
            </div>
          ) : null}
          {listing.status === "published" ? (
            <div className="notice">
              L’annonce actuelle reste en ligne jusqu’à la validation de vos
              modifications.
            </div>
          ) : null}
          {step === 0 ? (
            <>
              <p className="muted">
                Recherchez l’adresse ou la commune du parking.
              </p>
              <div id="listing-location" tabIndex={-1}>
                <LocationPicker
                  key={locationReload}
                  value={listing}
                  onChange={change}
                  onSelectionPendingChange={setLocationSelectionPending}
                />
              </div>
              <h2>Vos places</h2>
              <div className="account-type-options">
                {(["covered", "box", "outdoor", "mixed"] as const).map(
                  (type) => (
                    <button
                      type="button"
                      key={type}
                      className={listing.type === type ? "active" : ""}
                      aria-pressed={listing.type === type}
                      onClick={() => change({ type })}
                    >
                      <span>{typeLabels[type]}</span>
                      {listing.type === type ? (
                        <CheckCircle2 size={20} />
                      ) : null}
                    </button>
                  ),
                )}
              </div>
              <label className="field">
                Nombre de places dans cette annonce
                <input
                  id="listing-space-count"
                  className="input"
                  type="number"
                  min="1"
                  max="500"
                  value={spaceCountInput ?? listing.spaces.length}
                  onChange={(event) => setSpaceCountInput(event.target.value)}
                />
              </label>
              {spaceCountPending ? (
                <div className="account-space-count-actions">
                  <p className="muted" role="status">
                    {requestedSpaceCount === null
                      ? "Indiquez un nombre entier de 1 à 500."
                      : requestedSpaceCount < listing.spaces.length
                        ? spaceCountDifference === -1
                          ? "Le dernier emplacement sera retiré de ce brouillon, avec son prix et ses photos associées. Les autres places restent inchangées."
                          : `Les ${-spaceCountDifference} derniers emplacements seront retirés de ce brouillon, avec leurs prix et leurs photos associées. Les autres places restent inchangées.`
                        : `${spaceCountDifference} emplacement${spaceCountDifference > 1 ? "s" : ""} à ajouter. Les places déjà renseignées restent inchangées.`}
                  </p>
                  <div className="account-wizard-actions">
                    <button
                      type="button"
                      className="button button-secondary"
                      onClick={() => setSpaceCountInput(null)}
                    >
                      Annuler
                    </button>
                    <button
                      type="button"
                      className="button button-primary"
                      disabled={requestedSpaceCount === null || uploading}
                      onClick={() => {
                        if (!latest.current || spaceCountInput === null) return;
                        change({
                          spaces: resizeDraftSpaces(
                            latest.current.spaces,
                            spaceCountInput,
                          ),
                        });
                        setSpaceCountInput(null);
                      }}
                    >
                      {requestedSpaceCount !== null &&
                      requestedSpaceCount < listing.spaces.length
                        ? spaceCountDifference === -1
                          ? "Retirer le dernier emplacement"
                          : `Retirer les ${-spaceCountDifference} derniers emplacements`
                        : spaceCountDifference === 1
                          ? "Ajouter l’emplacement"
                          : "Ajouter les emplacements"}
                    </button>
                  </div>
                </div>
              ) : null}
              <p className="muted">
                Vous pouvez proposer certaines places à vendre et d’autres à
                louer. Elles restent réunies dans la même annonce.
              </p>
              {listing.pricingMode === "per_space" ? (
                <div id="listing-units" tabIndex={-1}>
                  {listing.spaces.map((space, index) => {
                    const offer = spaceOffer(listing, space);
                    return (
                      <fieldset
                        className="account-space-fieldset"
                        key={space.id}
                      >
                        <legend>Emplacement {index + 1}</legend>
                        <div className="form-grid account-offer-fields">
                          <PaintedNumberField
                            space={space}
                            index={index}
                            onChange={(value) =>
                              spaceChange(index, "number", value)
                            }
                          />
                          <div className="field">
                            <span>Offre — emplacement {index + 1}</span>
                            <FilterSelect
                              label={`Offre — emplacement ${index + 1}`}
                              variant="field"
                              value={offer.transactionType}
                              options={[
                                { value: "sale", label: "À vendre" },
                                { value: "rent", label: "À louer" },
                              ]}
                              onChange={(value) =>
                                changeOffer(index, {
                                  transactionType: value as "sale" | "rent",
                                  priceCents:
                                    value === offer.transactionType
                                      ? offer.priceCents
                                      : 0,
                                  status:
                                    offer.status === "sold" ||
                                    offer.status === "rented"
                                      ? "available"
                                      : offer.status,
                                })
                              }
                            />
                          </div>
                          <label className="field">
                            {offer.transactionType === "rent"
                              ? `Loyer mensuel — emplacement ${index + 1}`
                              : `Prix de vente — emplacement ${index + 1}`}
                            <span className="account-unit-field">
                              <input
                                className="input"
                                type="number"
                                min="0"
                                max="100000000"
                                step="0.01"
                                value={
                                  offer.priceCents ? offer.priceCents / 100 : ""
                                }
                                placeholder={
                                  offer.transactionType === "rent"
                                    ? "150"
                                    : "18500"
                                }
                                onChange={(event) =>
                                  changeOffer(index, {
                                    priceCents: Math.round(
                                      Number(event.target.value) * 100,
                                    ),
                                  })
                                }
                              />
                              <span>
                                {offer.transactionType === "rent"
                                  ? "€/mois"
                                  : "€"}
                              </span>
                            </span>
                          </label>
                          {listing.type === "mixed" ? (
                            <div className="field">
                              <span>Type — emplacement {index + 1}</span>
                              <FilterSelect
                                label={`Type — emplacement ${index + 1}`}
                                variant="field"
                                value={
                                  listing.commercialDetails?.units[space.id]
                                    ?.type || ""
                                }
                                options={[
                                  {
                                    value: "",
                                    label: "Choisir",
                                    disabled: true,
                                  },
                                  {
                                    value: "covered",
                                    label: "Parking couvert",
                                  },
                                  { value: "box", label: "Box fermé" },
                                  {
                                    value: "outdoor",
                                    label: "Parking extérieur",
                                  },
                                ]}
                                onChange={(value) =>
                                  change({
                                    commercialDetails: {
                                      ...(listing.commercialDetails ||
                                        emptyCommercialDetails()),
                                      units: {
                                        ...listing.commercialDetails?.units,
                                        [space.id]: {
                                          ...emptyUnitDetails(),
                                          ...listing.commercialDetails?.units[
                                            space.id
                                          ],
                                          type: value as
                                            "covered" | "box" | "outdoor",
                                        },
                                      },
                                    },
                                  })
                                }
                              />
                            </div>
                          ) : null}
                        </div>
                        <details className="account-space-status">
                          <summary>
                            {offerStatusLabels[offer.status]} · modifier la
                            disponibilité
                          </summary>
                          <div className="field">
                            <span>Disponibilité — emplacement {index + 1}</span>
                            <FilterSelect
                              label={`Disponibilité — emplacement ${index + 1}`}
                              variant="field"
                              value={offer.status}
                              options={Object.entries(offerStatusLabels)
                                .filter(
                                  ([value]) =>
                                    value !==
                                    (offer.transactionType === "rent"
                                      ? "sold"
                                      : "rented"),
                                )
                                .map(([value, label]) => ({ value, label }))}
                              onChange={(value) =>
                                changeOffer(index, {
                                  status: value as NonNullable<
                                    Space["offer"]
                                  >["status"],
                                })
                              }
                            />
                          </div>
                        </details>
                      </fieldset>
                    );
                  })}
                </div>
              ) : (
                <div id="listing-units" tabIndex={-1}>
                  <p className="notice">
                    {offerLabel(listing)} · {listingPrice(listing)} pour
                    l’ensemble des {listing.spaces.length} place(s).
                  </p>
                  {listing.spaces.map((space, index) => (
                    <fieldset className="account-space-fieldset" key={space.id}>
                      <legend>Emplacement {index + 1}</legend>
                      <PaintedNumberField
                        space={space}
                        index={index}
                        onChange={(value) =>
                          spaceChange(index, "number", value)
                        }
                      />
                    </fieldset>
                  ))}
                </div>
              )}
              <details className="account-fieldset">
                <summary>Vendre ou louer les places ensemble</summary>
                <label className="account-checkbox">
                  <input
                    type="checkbox"
                    checked={listing.pricingMode !== "per_space"}
                    onChange={(event) =>
                      setPricingMode(event.target.checked ? "lot" : "per_space")
                    }
                  />
                  <span>
                    Une seule offre et un prix total pour toutes les places
                  </span>
                </label>
                {listing.pricingMode !== "per_space" ? (
                  <div className="form-grid">
                    <div className="field">
                      <span>Offre pour l’ensemble</span>
                      <FilterSelect
                        label="Offre pour l’ensemble"
                        variant="field"
                        value={listing.transactionType || "sale"}
                        options={[
                          { value: "sale", label: "À vendre ensemble" },
                          { value: "rent", label: "À louer ensemble" },
                        ]}
                        onChange={(value) => {
                          const patch =
                            latest.current &&
                            lotOfferChange(
                              latest.current,
                              value as "sale" | "rent",
                            );
                          if (patch) change(patch);
                        }}
                      />
                    </div>
                    <label className="field">
                      {listing.transactionType === "rent"
                        ? "Loyer mensuel total du lot"
                        : "Prix total du lot"}
                      <span className="account-unit-field">
                        <input
                          id="listing-price"
                          className="input"
                          type="number"
                          min="0"
                          max="100000000"
                          step="0.01"
                          value={
                            listing.priceCents ? listing.priceCents / 100 : ""
                          }
                          onChange={(event) =>
                            change({
                              priceCents: Math.round(
                                Number(event.target.value) * 100,
                              ),
                            })
                          }
                        />
                        <span>
                          {listing.transactionType === "rent" ? "€/mois" : "€"}
                        </span>
                      </span>
                    </label>
                  </div>
                ) : (
                  <p className="muted">
                    Un prix individuel est demandé pour chaque place disponible.
                    Aucun prix global n’est divisé automatiquement.
                  </p>
                )}
              </details>
              <details
                id="listing-unit-details"
                className="account-fieldset"
                tabIndex={-1}
              >
                <summary>Dimensions, niveaux et accès · facultatif</summary>
                <>
                  <p className="muted">
                    Renseignez chaque unité. Laissez une dimension vide si vous
                    ne la connaissez pas : nous afficherons « Non renseigné ».
                  </p>
                  {listing.spaces.map((space, index) => (
                    <fieldset key={space.id} className="account-space-fieldset">
                      <legend>{spaceLabel(space, index)}</legend>
                      <div className="form-grid">
                        <label className="field">
                          Niveau
                          <input
                            className="input"
                            type="number"
                            min="-20"
                            max="20"
                            value={
                              space.levelKnown === false ? "" : space.level
                            }
                            placeholder="Non renseigné"
                            onChange={(e) =>
                              change({
                                spaces: listing.spaces.map((item, i) =>
                                  i === index
                                    ? {
                                        ...item,
                                        level:
                                          e.target.value === ""
                                            ? 0
                                            : Number(e.target.value),
                                        levelKnown: e.target.value !== "",
                                      }
                                    : item,
                                ),
                              })
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
                    Indiquez les dimensions que vous connaissez.
                  </p>
                  <CommercialEditor
                    listing={listing}
                    section="units"
                    onChange={(commercialDetails) =>
                      change({ commercialDetails })
                    }
                  />
                </>
              </details>
              <details
                id="listing-condition"
                className="account-fieldset"
                tabIndex={-1}
              >
                <summary>État et observations · facultatif</summary>
                <>
                  <div className="field">
                    <span>{"Périmètre de la description"}</span>
                    <FilterSelect
                      label={"Périmètre de la description"}
                      variant="field"
                      value={qualityTarget}
                      onChange={(selectedValue) =>
                        setQualityTarget(selectedValue)
                      }
                      options={[
                        { value: "general", label: "État commun du parking" },
                        ...listing.spaces.map((space, index) => ({
                          value: space.id,
                          label: `${spaceLabel(space, index)} · niveau ${spaceLevelLabel(space)}`,
                        })),
                      ]}
                    />
                  </div>
                  <p className="notice">
                    Décrivez le parking ou la place sélectionnée. Laissez vides
                    les informations que vous ne connaissez pas.
                  </p>
                  <ConditionEvidenceEditor
                    listing={listing}
                    spaceId={qualityTarget === "general" ? null : qualityTarget}
                    onChange={(conditionObservations) =>
                      change({ conditionObservations })
                    }
                  />
                  <details>
                    <summary>Description libre complémentaire</summary>
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
                            e.target.value
                              ? `${e.target.value}T00:00:00.000Z`
                              : null,
                          )
                        }
                      />
                    </label>
                    <div className="field">
                      <span>{"Origine déclarée par le vendeur"}</span>
                      <FilterSelect
                        label={"Origine déclarée par le vendeur"}
                        variant="field"
                        value={
                          (qualityTarget === "general"
                            ? listing.quality
                            : listing.unitQuality?.[qualityTarget]
                          )?.basis || "unknown"
                        }
                        onChange={(selectedValue) =>
                          quality("basis", selectedValue as Quality["basis"])
                        }
                        options={[
                          { value: "unknown", label: "À préciser" },
                          {
                            value: "seller_observation",
                            label: "Observation du vendeur",
                          },
                          {
                            value: "provided_document",
                            label: "Document fourni",
                          },
                        ]}
                      />
                    </div>
                    <p className="muted">
                      Précisez les défauts et les contraintes d’accès.
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
                                : listing.unitQuality?.[qualityTarget])?.[
                                key
                              ] || ""
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
                        onChange={(e) =>
                          quality("observations", e.target.value)
                        }
                        placeholder="Ex. poteau à gauche de la place, marquage usé, traces visibles sur un mur…"
                      />
                    </label>
                  </details>
                  <div className="notice">
                    <Info size={18} />
                    <p>
                      Une absence de trace visible ne garantit pas l’absence
                      d’infiltration. Ne partagez pas de code d’accès, de badge
                      lisible ni de donnée personnelle.
                    </p>
                  </div>
                </>
              </details>
              <details
                id="listing-financial"
                className="account-fieldset"
                tabIndex={-1}
              >
                <summary>Charges, occupation et sources · facultatif</summary>
                <>
                  <div className="field">
                    <span>{"Occupation actuelle"}</span>
                    <FilterSelect
                      label={"Occupation actuelle"}
                      variant="field"
                      value={listing.occupancy || "unknown"}
                      onChange={(selectedValue) =>
                        change({
                          occupancy: selectedValue as Listing["occupancy"],
                        })
                      }
                      options={[
                        { value: "unknown", label: "Non renseignée" },
                        {
                          value: "vacant",
                          label: "Libre · déclaration vendeur",
                        },
                        {
                          value: "occupied",
                          label: "Occupée · déclaration vendeur",
                        },
                      ]}
                    />
                  </div>
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
                          propertyTaxCents:
                            v == null ? null : Math.round(v * 100),
                        })
                      }
                    />
                  </div>
                  <p className="muted">
                    Une case vide indique un montant inconnu. Précisez l’année
                    et le périmètre des montants ci-dessous.
                  </p>
                  <CommercialEditor
                    listing={listing}
                    section="financial"
                    onChange={(commercialDetails) =>
                      change({ commercialDetails })
                    }
                  />
                </>
              </details>
            </>
          ) : null}
          {step === 1 ? (
            <>
              <>
                <label className="field">
                  Titre de l’annonce
                  <input
                    id="listing-title"
                    className="input"
                    minLength={15}
                    maxLength={90}
                    value={listing.title}
                    onChange={(e) => change({ title: e.target.value })}
                    placeholder="Place couverte · Paris 12e Bercy"
                  />
                  <small>
                    {listing.title.length}/90 caractères · minimum 15
                  </small>
                </label>
                <label className="field">
                  Description
                  <textarea
                    id="listing-description"
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
                    Annonce publiée sous le nom <strong>{user.name}</strong>.
                    Votre email reste masqué.
                  </p>
                </div>
              </>
              <>
                <p className="muted">
                  Ajoutez au moins une photo. Trois vues sont recommandées : le
                  parking, son accès et la place.
                </p>
                <div className="field">
                  <span>{"Ajouter des photos à"}</span>
                  <FilterSelect
                    label={"Ajouter des photos à"}
                    variant="field"
                    value={photoTarget}
                    disabled={uploading}
                    onChange={(selectedValue) => {
                      setPhotoTarget(selectedValue);
                      setShareExisting(false);
                    }}
                    options={[
                      {
                        value: "general",
                        label: "Galerie générale du parking",
                      },
                      ...listing.spaces.map((space, index) => ({
                        value: space.id,
                        label: `${spaceLabel(space, index)} · niveau ${spaceLevelLabel(space)}`,
                      })),
                    ]}
                  />
                </div>
                <div className="account-photo-target-note">
                  <span className="badge">
                    {photoTarget === "general"
                      ? "VUE DU PARKING"
                      : `PHOTOS · ${spaceLabel(
                          listing.spaces.find(
                            (space) => space.id === photoTarget,
                          )!,
                          listing.spaces.findIndex(
                            (space) => space.id === photoTarget,
                          ),
                        )}`}
                  </span>
                  <p>
                    {photoTarget === "general"
                      ? "Ces photos présentent le parking dans son ensemble."
                      : "Ces photos montrent uniquement la place sélectionnée."}
                  </p>
                </div>
                <label
                  id="listing-photos"
                  className="account-upload"
                  tabIndex={-1}
                >
                  <CloudUpload size={32} />
                  <strong>
                    {uploading
                      ? "Traitement des images…"
                      : "Ajouter des photos"}
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
                            : `Vue ${index + 1} · ${spaceLabel(
                                listing.spaces.find(
                                  (space) => space.id === photoTarget,
                                )!,
                                listing.spaces.findIndex(
                                  (space) => space.id === photoTarget,
                                ),
                              )}`
                        }
                        loading="lazy"
                      />
                      <span>
                        {photoTarget === "general"
                          ? index === 0
                            ? "Vue du parking · principale"
                            : "Vue du parking"
                          : `Vue ${index + 1} · ${spaceLabel(
                              listing.spaces.find(
                                (space) => space.id === photoTarget,
                              )!,
                              listing.spaces.findIndex(
                                (space) => space.id === photoTarget,
                              ),
                            )}`}
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
                  photos dans cette galerie. Elles restent privées jusqu’à
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
                          Choisissez une photo où cette place est identifiable.
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
                <details className="account-fieldset">
                  <summary>Photos par place · facultatif</summary>
                  <section className="account-photo-coverage">
                    {listing.spaces.map((space, index) => {
                      const count =
                        listing.spacePhotos?.[space.id]?.length || 0;
                      return (
                        <div key={space.id}>
                          <div>
                            <strong>{spaceLabel(space, index)}</strong>
                            <span>
                              {count
                                ? `${count} photo${count > 1 ? "s" : ""} associée${count > 1 ? "s" : ""}`
                                : "Aucune photo associée à cette place"}
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
                </details>
                <div className="notice">
                  <ImagePlus size={20} />
                  <p>
                    Floutez les plaques et les visages. Laissez les défauts et
                    les obstacles visibles.
                  </p>
                </div>
                <details className="account-fieldset account-photo-metadata">
                  <summary>Légendes et dates · facultatif</summary>
                  <CommercialEditor
                    listing={listing}
                    section="photos"
                    onChange={(commercialDetails) =>
                      change({ commercialDetails })
                    }
                  />
                </details>
                <ModelRequest listingId={listing.id} />
              </>
            </>
          ) : null}
          {step === 2 ? (
            <form onSubmit={submit}>
              <fieldset
                className="account-fieldset"
                disabled={savingSellerType || busy}
              >
                <legend>Vous publiez en tant que</legend>
                <div className="account-type-options">
                  {(
                    [
                      ["private", "Particulier"],
                      ["professional", "Professionnel"],
                    ] as const
                  ).map(([value, label]) => (
                    <button
                      type="button"
                      key={value}
                      className={sellerType === value ? "active" : ""}
                      aria-pressed={sellerType === value}
                      onClick={() => void saveSellerType(value)}
                    >
                      {label}
                      {sellerType === value ? <CheckCircle2 size={20} /> : null}
                    </button>
                  ))}
                </div>
                {savingSellerType ? <p role="status">Enregistrement…</p> : null}
              </fieldset>
              <p className="muted">
                Vérifiez les informations avant d’envoyer votre annonce.
              </p>
              {preview ? (
                <article className="account-preview card">
                  {preview.photos[0] ? (
                    <img
                      src={preview.photos[0]}
                      alt="Photo principale de l’annonce"
                    />
                  ) : null}
                  <div>
                    <span className="badge">APERÇU · NON PUBLIÉ</span>
                    <h2>{preview.title || "Titre à compléter"}</h2>
                    <p>
                      {preview.city} · {preview.district}
                    </p>
                    <h3>{listingPrice(preview)}</h3>
                    <p>{offerLabel(preview)}</p>
                    <p>
                      {typeLabels[preview.type]} · {areaLabel(preview.spaces)}
                      {preview.spaces.length > 1
                        ? ` · ${preview.spaces.length} places dans cette annonce`
                        : ""}
                    </p>
                    <div className="account-preview-unit-galleries">
                      <h3>Offres et photos de chaque place</h3>
                      {preview.spaces.map((space, index) => {
                        const photos = preview.spacePhotos?.[space.id] || [];
                        return (
                          <section key={space.id}>
                            <strong>{spaceLabel(space, index)}</strong>
                            {preview.pricingMode === "per_space" ? (
                              <p>
                                {spaceOffer(preview, space).transactionType ===
                                "rent"
                                  ? "À louer"
                                  : "À vendre"}{" "}
                                · {money(spaceOffer(preview, space).priceCents)}
                                {spaceOffer(preview, space).transactionType ===
                                "rent"
                                  ? " / mois"
                                  : ""}{" "}
                                ·{" "}
                                {
                                  offerStatusLabels[
                                    spaceOffer(preview, space).status
                                  ]
                                }
                              </p>
                            ) : null}
                            <p className="muted">
                              {photos.length
                                ? `${photos.length} photo${photos.length > 1 ? "s" : ""} de cette place`
                                : "Photos générales du parking"}
                            </p>
                            {photos.length ? (
                              <div className="account-photo-grid">
                                {photos.map((photo, n) => (
                                  <div key={`${photo}-${n}`}>
                                    <img
                                      src={photo}
                                      alt={`Photo déclarée · ${spaceLabel(space, index)}`}
                                      loading="lazy"
                                    />
                                    <span>{spaceLabel(space, index)}</span>
                                  </div>
                                ))}
                              </div>
                            ) : null}
                          </section>
                        );
                      })}
                    </div>
                    <p className="account-preview-description">
                      {preview.description || "Description à compléter"}
                    </p>
                    <details className="account-fieldset">
                      <summary>Informations complémentaires</summary>
                      <p>
                        Occupation :{" "}
                        {
                          {
                            vacant: "Libre · déclaré",
                            occupied: "Occupée · déclaré",
                            unknown: "Non renseignée",
                          }[preview.occupancy || "unknown"]
                        }
                        . Charges :{" "}
                        {preview.annualChargesCents == null
                          ? "non renseignées"
                          : `${money(preview.annualChargesCents)}/an`}
                        . Taxe foncière :{" "}
                        {preview.propertyTaxCents == null
                          ? "non renseignée"
                          : `${money(preview.propertyTaxCents)}/an`}
                        .
                      </p>
                      <h3>État déclaré du parking</h3>
                      <QualitySummary quality={preview.quality} common />
                      <CommercialSummary listing={preview} />
                      <ConditionEvidenceSummary
                        values={preview.conditionObservations}
                      />
                      {preview.spaces.map((space) => (
                        <ConditionEvidenceSummary
                          key={space.id}
                          values={preview.conditionObservations}
                          spaceId={space.id}
                        />
                      ))}
                    </details>
                    <p className="notice">
                      Localisation affichée :{" "}
                      {preview.locationPrecision === "area"
                        ? `${preview.city} · secteur uniquement. Adresse masquée.`
                        : preview.address ||
                          `${preview.city} · ${preview.district}`}
                      {preview.sceneAvailable ? (
                        <>
                          <br />
                          Plan 3D disponible.
                        </>
                      ) : null}
                    </p>
                  </div>
                </article>
              ) : (
                <p role="status">
                  {previewError ||
                    "Enregistrement puis préparation de l’aperçu public…"}
                </p>
              )}
              {previewError ? (
                <button
                  type="button"
                  className="button button-secondary"
                  onClick={() => setPreviewAttempt((v) => v + 1)}
                >
                  Recharger l’aperçu
                </button>
              ) : null}
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
                  !sellerType ||
                  savingSellerType ||
                  !user.emailVerified ||
                  busy ||
                  uploading ||
                  saveState !== "saved" ||
                  !preview ||
                  preview.version !== listing.version
                }
              >
                {busy ? "Envoi en cours…" : "Envoyer l’annonce"}
              </button>
              <p className="muted">
                Publication après vérification par notre équipe.
              </p>
            </form>
          ) : null}
          {step < 2 ? (
            <div className="account-wizard-actions">
              <button
                className="button button-secondary"
                disabled={step === 0}
                onClick={() => {
                  setStep((s) => s - 1);
                  setIssuesForStep(null);
                  setError("");
                }}
              >
                Retour
              </button>
              <button
                className="button button-primary"
                onClick={next}
                disabled={uploading || saveState === "saving"}
              >
                {step === 1
                  ? "Prévisualiser"
                  : listing.locationPrecision === "area"
                    ? "Confirmer ce secteur et continuer"
                    : "Confirmer cette position et continuer"}
                {step === 1 ? <Eye size={18} /> : null}
              </button>
            </div>
          ) : (
            <button
              className="button button-secondary account-preview-back"
              onClick={() => {
                setStep(1);
                setIssuesForStep(null);
                setError("");
              }}
            >
              Modifier les photos et la description
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
    <DepositSignIn />
  );
}
