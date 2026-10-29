"use client";
import FilterSelect from "@/components/FilterSelect";
import { useEffect, useState, useRef, type FormEvent } from "react";
import Link from "next/link";
import { RefreshCw, Building2, Layers3, Link2, UsersRound } from "lucide-react";
import { api } from "@/lib/client";
import { AccountGate, AccountShell } from "@/components/account/shared";
import {
  registryCommandSchema,
  type RegistryCommand,
  type RegistryAdminData,
  type RegistryMutationResult,
  type RegistryLevel,
  type RegistryLevelPlanHistory,
} from "@/lib/parking-registry";
import type { Listing, User, AdminUser } from "@/lib/types";
import { loadRegistrySelection } from "@/lib/registry-selection";
import { loadAdminAccountPage } from "@/lib/admin-account-ux";
import { requestJson } from "@/lib/request-json";
import "@/styles/registry.css";
const empty: RegistryAdminData = { sites: [], links: [], conflicts: [] };
function LevelPlanHistory({
  level,
  busy,
  mutate,
}: {
  level: RegistryLevel;
  busy: boolean;
  mutate: (command: RegistryCommand) => Promise<void>;
}) {
  const [history, setHistory] = useState<RegistryLevelPlanHistory | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [reason, setReason] = useState("");
  const [selected, setSelected] = useState("");
  const [checks, setChecks] = useState<boolean[]>([false, false, false, false]);
  const [attempt, setAttempt] = useState(0);
  const pending = useRef<AbortController | null>(null);
  async function load(before?: number) {
    pending.current?.abort();
    const controller = new AbortController();
    pending.current = controller;
    setLoading(true);
    setError("");
    try {
      const page = await api<RegistryLevelPlanHistory>(
        `/api/admin/parking-registry?levelPlanHistory=${encodeURIComponent(level.id)}${before ? `&beforeVersion=${before}` : ""}`,
        { signal: controller.signal },
      );
      if (controller.signal.aborted) return;
      setHistory((current) =>
        before && current
          ? {
              ...page,
              items: [
                ...current.items,
                ...page.items.filter(
                  (item) =>
                    !current.items.some((old) => old.version === item.version),
                ),
              ],
            }
          : page,
      );
    } catch (error) {
      if (!controller.signal.aborted) setError((error as Error).message);
    } finally {
      if (!controller.signal.aborted) setLoading(false);
    }
  }
  useEffect(() => {
    setHistory(null);
    setSelected("");
    setChecks([false, false, false, false]);
    setReason("");
    void load();
    return () => pending.current?.abort();
  }, [level.id, level.planVersion, attempt]);
  const revision = history?.items.find(
    (item) => item.version === Number(selected),
  );
  const currentVersion = history?.currentVersion ?? level.planVersion ?? 0;
  return (
    <details className="account-fieldset">
      <summary>
        Versions du plan commun · version {currentVersion || "absente"}
      </summary>
      <p className="muted small">
        Une restauration crée une nouvelle version après contrôle du registre,
        des sources et des autorisations actuelles. Elle ne remet aucune
        ancienne annonce en ligne.
      </p>
      {loading ? <p role="status">Chargement des versions…</p> : null}
      {error ? (
        <p className="notice error" role="alert">
          {error}{" "}
          <button
            type="button"
            className="text-button"
            onClick={() => setAttempt((v) => v + 1)}
          >
            Réessayer
          </button>
        </p>
      ) : null}
      {history && !history.items.length ? (
        <p>Aucune version enregistrée pour ce niveau.</p>
      ) : null}
      {history?.items.length ? (
        <>
          <label className="field">
            Version à consulter
            <FilterSelect
              variant="field"
              label="Version du plan commun"
              value={selected}
              onChange={(value) => {
                setSelected(value);
                setChecks([false, false, false, false]);
              }}
              options={[
                { value: "", label: "Choisir une version" },
                ...history.items.map((item) => ({
                  value: String(item.version),
                  label: `Version ${item.version} · ${item.state === "published" ? "publiée" : "retirée"} · ${new Date(item.createdAt).toLocaleDateString("fr-FR", { timeZone: "UTC" })}`,
                })),
              ]}
            />
          </label>
          {revision ? (
            <div className="notice">
              <strong>
                Version {revision.version} ·{" "}
                {revision.state === "published" ? "publiée" : "retirée"}
              </strong>
              <p>
                {revision.spaceCount} place(s) rapprochée(s) ·{" "}
                {revision.evidenceCount} source(s)
                {revision.restoredFromVersion
                  ? ` · restaurée depuis la version ${revision.restoredFromVersion}`
                  : ""}
              </p>
              <p style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>
                {revision.reason}
              </p>
              {revision.action === "legacy_snapshot" ? (
                <p className="small">
                  État antérieur repris lors de l’activation de l’historique.
                  Aucune nouvelle vérification n’est attestée à cette date.
                </p>
              ) : null}
              {revision.isDemo ? (
                <p className="small">
                  Plan fictif de démonstration, non restaurable comme relevé
                  réel.
                </p>
              ) : null}
            </div>
          ) : null}
          {history.hasMore ? (
            <button
              type="button"
              className="button button-secondary"
              disabled={loading}
              onClick={() => void load(history.nextBeforeVersion)}
            >
              Versions précédentes
            </button>
          ) : null}
          <label className="field">
            Motif de restauration ou de retrait
            <textarea
              className="input"
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              minLength={15}
              maxLength={2000}
            />
          </label>
          {revision?.state === "published" && !revision.isDemo ? (
            <>
              {[
                "Je confirme les droits actuels de publication des sources.",
                "J’ai vérifié le repère calibré du niveau.",
                "J’ai rapproché les places et dimensions du registre actuel.",
                "J’ai contrôlé les sources actuelles et leurs empreintes.",
              ].map((label, index) => (
                <label className="registry-check" key={label}>
                  <input
                    type="checkbox"
                    checked={checks[index]}
                    disabled={busy}
                    onChange={(event) =>
                      setChecks((current) =>
                        current.map((value, i) =>
                          i === index ? event.target.checked : value,
                        ),
                      )
                    }
                  />
                  {label}
                </label>
              ))}
              <button
                type="button"
                className="button button-primary"
                disabled={
                  busy ||
                  loading ||
                  Boolean(error) ||
                  !checks.every(Boolean) ||
                  reason.trim().length < 15
                }
                onClick={() =>
                  void mutate({
                    action: "restore_level_plan",
                    levelId: level.id,
                    version: currentVersion,
                    sourceVersion: revision.version,
                    reason: reason.trim(),
                    rightsAttested: true,
                    checks: {
                      coordinateFrameConfirmed: true,
                      mappingChecked: true,
                      sourcesChecked: true,
                    },
                  })
                }
              >
                Restaurer en version {currentVersion + 1}
              </button>
            </>
          ) : null}
          {level.planState === "published" ? (
            <button
              type="button"
              className="button button-secondary"
              disabled={
                busy || loading || Boolean(error) || reason.trim().length < 15
              }
              onClick={() =>
                void mutate({
                  action: "withdraw_level_plan",
                  levelId: level.id,
                  version: currentVersion,
                  reason: reason.trim(),
                })
              }
            >
              Retirer le plan actuel
            </button>
          ) : null}
        </>
      ) : null}
    </details>
  );
}
function Content({
  user,
  initialListingId,
}: {
  user: User;
  initialListingId?: string;
}) {
  const [contributorId, setContributorId] = useState("");
  const [accountSearch, setAccountSearch] = useState(""),
    [appliedAccountSearch, setAppliedAccountSearch] = useState(""),
    [accountsCursor, setAccountsCursor] = useState<string | null>(null),
    [accountsLoading, setAccountsLoading] = useState(false),
    [accountsError, setAccountsError] = useState(""),
    [failedAccountsLoad, setFailedAccountsLoad] = useState<{
      search: string;
      cursor: string | null;
    } | null>(null);
  const [data, setData] = useState(empty),
    [pending, setPending] = useState<Listing[]>([]),
    [accounts, setAccounts] = useState<AdminUser[]>([]),
    [siteId, setSiteId] = useState(""),
    [levelId, setLevelId] = useState(""),
    [listingId, setListingId] = useState(initialListingId || ""),
    [listing, setListing] = useState<Listing | null>(null),
    [mapping, setMapping] = useState<Record<string, string>>({}),
    [reason, setReason] = useState(""),
    [checked, setChecked] = useState(false),
    [busy, setBusy] = useState(false),
    [loading, setLoading] = useState(true),
    [registryReady, setRegistryReady] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState("");
  const activeListingId = useRef(initialListingId || ""),
    pendingLoad = useRef<AbortController | null>(null),
    pendingAccountsLoad = useRef<AbortController | null>(null),
    mutationPending = useRef(false);
  const site = data.sites.find((item) => item.id === siteId),
    level = site?.levels.find((item) => item.id === levelId);
  const mutationDisabled = busy || loading || !registryReady;
  async function loadAccounts(search = "", cursor: string | null = null) {
    pendingAccountsLoad.current?.abort();
    const controller = new AbortController();
    pendingAccountsLoad.current = controller;
    setAccountsLoading(true);
    setAccountsError("");
    setFailedAccountsLoad(null);
    if (!cursor) setContributorId("");
    try {
      const page = await loadAdminAccountPage(
        requestJson,
        search,
        cursor,
        controller.signal,
      );
      if (controller.signal.aborted) return;
      setAccounts((current) =>
        cursor
          ? [
              ...new Map(
                [...current, ...page.data].map((item) => [item.id, item]),
              ).values(),
            ]
          : page.data,
      );
      setAccountsCursor(page.nextCursor);
      setAppliedAccountSearch(search);
    } catch (error) {
      if (!controller.signal.aborted) {
        setAccountsError((error as Error).message);
        setFailedAccountsLoad({ search, cursor });
      }
    } finally {
      if (!controller.signal.aborted) setAccountsLoading(false);
    }
  }
  async function reload(
    requestedListingId = activeListingId.current,
    restoreLinkedSite = true,
  ) {
    pendingLoad.current?.abort();
    const controller = new AbortController();
    pendingLoad.current = controller;
    activeListingId.current = requestedListingId;
    setLoading(true);
    setRegistryReady(false);
    setChecked(false);
    setError("");
    const results = await Promise.allSettled([
      loadRegistrySelection(api, requestedListingId, controller.signal),
      api<Listing[]>("/api/admin/revisions", { signal: controller.signal }),
    ]);
    if (controller.signal.aborted) return;
    const [context, revisions] = results;
    const failures: string[] = [];
    if (context.status === "fulfilled" && context.value) {
      const { registry, listing: loadedListing } = context.value;
      setData(registry);
      setListing(loadedListing);
      setListingId(requestedListingId);
      setRegistryReady(true);
      const linkedSiteId = registry.links.find(
        (link) => link.listingId === requestedListingId,
      )?.siteId;
      setSiteId((current) => {
        if (restoreLinkedSite && linkedSiteId) return linkedSiteId;
        return registry.sites.some((site) => site.id === current)
          ? current
          : registry.sites[0]?.id || "";
      });
    } else {
      setListing(null);
      setMapping({});
      if (context.status === "rejected")
        failures.push((context.reason as Error).message);
    }
    if (revisions.status === "fulfilled") setPending(revisions.value);
    else {
      setPending([]);
      failures.push(
        "La liste des annonces n’a pas pu être chargée. Actualisez pour réessayer.",
      );
    }
    setError(failures.join(" "));
    setLoading(false);
  }
  useEffect(() => {
    void reload(initialListingId || "");
    return () => pendingLoad.current?.abort();
  }, [initialListingId]);
  useEffect(() => {
    void loadAccounts();
    return () => pendingAccountsLoad.current?.abort();
  }, []);
  useEffect(() => {
    setContributorId("");
  }, [siteId]);
  useEffect(() => {
    setLevelId((current) =>
      site?.levels.some((item) => item.id === current)
        ? current
        : site?.levels[0]?.id || "",
    );
    setMapping(
      Object.fromEntries(
        data.links
          .filter(
            (link) => link.listingId === listing?.id && link.siteId === siteId,
          )
          .map((link) => [link.unitId, link.spaceId]),
      ),
    );
    setChecked(false);
  }, [siteId, data.sites, data.links, listing?.id]);
  async function loadListing(id: string) {
    if (mutationPending.current) return;
    setReason("");
    setNotice("");
    await reload(id);
  }
  async function mutate(command: unknown) {
    if (mutationPending.current || loading || !registryReady) return;
    const parsed = registryCommandSchema.safeParse(command);
    if (!parsed.success) {
      setError(
        parsed.error.issues
          .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
          .join(" · "),
      );
      return;
    }
    if (
      parsed.data.action === "link_listing" &&
      new Set(parsed.data.units.map((unit) => unit.spaceId)).size !==
        parsed.data.units.length
    ) {
      setError(
        "Chaque unité doit correspondre à une place physique distincte.",
      );
      return;
    }
    mutationPending.current = true;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const result = await api<RegistryMutationResult>(
        "/api/admin/parking-registry",
        { method: "POST", body: JSON.stringify(parsed.data) },
      );
      setNotice(
        result.message ||
          (parsed.data.action === "restore_level_plan"
            ? `Le plan commun a été restauré en version ${result.version}.`
            : result.status === "conflict"
              ? "Un conflit de correspondance est ouvert. Aucun rapprochement concurrent n’est forcé."
              : "Le registre a été enregistré."),
      );
      if (result.status === "saved" && parsed.data.action === "link_listing") {
        setChecked(false);
      }
      await reload(
        parsed.data.action === "link_listing"
          ? parsed.data.listingId
          : activeListingId.current,
        parsed.data.action === "link_listing",
      );
      if (result.id && parsed.data.action === "create_site")
        setSiteId(result.id);
    } catch (error) {
      setError((error as Error).message);
    } finally {
      mutationPending.current = false;
      setBusy(false);
    }
  }
  function form(
    event: FormEvent<HTMLFormElement>,
    build: (values: FormData) => unknown,
  ) {
    event.preventDefault();
    try {
      const values = new FormData(event.currentTarget);
      if (
        values.has("lng") &&
        Boolean(values.get("lng")) !== Boolean(values.get("lat"))
      )
        throw new Error(
          "Renseignez la longitude et la latitude ensemble, ou laissez les deux champs vides.",
        );
      void mutate(build(values));
    } catch (error) {
      setError((error as Error).message);
    }
  }
  const numberOrNull = (value: FormDataEntryValue | null) =>
    String(value || "").trim() === "" ? null : Number(value);
  const options =
    site?.levels.flatMap((level) =>
      level.spaces.map((space) => ({ space, level })),
    ) || [];
  return (
    <AccountShell
      user={user}
      title="Registre des parkings"
      eyebrow="RAPPROCHEMENT TERRAIN"
      action={
        <button
          className="button button-secondary"
          disabled={busy || loading}
          onClick={() => void reload()}
        >
          <RefreshCw size={16} /> Actualiser
        </button>
      }
    >
      <p className="muted">
        Rattachez l’annonce à des places physiques avant son approbation. Le
        registre commun ne partage jamais les photos privées, les messages ou
        les brouillons d’un autre vendeur.
      </p>
      {error ? (
        <p className="notice error" role="alert">
          {error}
        </p>
      ) : null}
      {notice ? (
        <p className="notice" role="status">
          {notice}
        </p>
      ) : null}
      {loading ? <p role="status">Chargement du registre…</p> : null}
      <section className="card registry-card">
        <h2>
          <Building2 size={20} /> 1. Identifier le parking
        </h2>
        <label className="field">
          Parking existant
          <FilterSelect
            disabled={busy || loading}
            variant="field"
            label="Parking existant"
            value={siteId}
            onChange={setSiteId}
            options={[
              { value: "", label: "Choisir un parking" },
              ...data.sites.map((site) => ({
                value: site.id,
                label: `${site.publicName} · ${site.internalReference}`,
              })),
            ]}
          />
        </label>
        {site ? (
          <>
            <p className="muted">
              Référence interne : {site.internalReference}
              {site.exactAddress
                ? ` · Adresse privée : ${site.exactAddress}`
                : ""}
            </p>
            <Link
              className="text-link"
              href={`/parkings/${encodeURIComponent(site.publicAlias)}`}
            >
              Consulter la vue publique autorisée
            </Link>
          </>
        ) : null}
        <details>
          <summary>Créer un parking distinct</summary>
          <form
            className="registry-grid"
            onSubmit={(event) =>
              form(event, (v) => ({
                action: "create_site",
                publicName: String(v.get("name")),
                internalReference: String(v.get("reference")),
                exactAddress: String(v.get("address") || ""),
                ...(v.get("lng") && v.get("lat")
                  ? {
                      coordinates: [Number(v.get("lng")), Number(v.get("lat"))],
                    }
                  : {}),
              }))
            }
          >
            <label className="field">
              Nom public
              <input
                className="input"
                name="name"
                required
                minLength={2}
                maxLength={100}
              />
            </label>
            <label className="field">
              Référence interne privée
              <input
                className="input"
                name="reference"
                required
                maxLength={100}
              />
            </label>
            <label className="field registry-full">
              Adresse exacte privée
              <input className="input" name="address" maxLength={250} />
            </label>
            <label className="field">
              Longitude facultative
              <input
                className="input"
                name="lng"
                type="number"
                min="-180"
                max="180"
                step="any"
              />
            </label>
            <label className="field">
              Latitude facultative
              <input
                className="input"
                name="lat"
                type="number"
                min="-90"
                max="90"
                step="any"
              />
            </label>
            <button
              className="button button-secondary"
              disabled={mutationDisabled}
            >
              Créer le parking
            </button>
          </form>
        </details>
      </section>
      {site ? (
        <section className="card registry-card">
          <h2>
            <Layers3 size={20} /> 2. Référencer les niveaux et les places
          </h2>
          <label className="field">
            Niveau
            <FilterSelect
              disabled={busy || loading}
              variant="field"
              label="Niveau du parking"
              value={levelId}
              onChange={setLevelId}
              options={[
                { value: "", label: "Choisir un niveau" },
                ...site.levels.map((level) => ({
                  value: level.id,
                  label: `${level.code} · ${level.label || level.number}`,
                })),
              ]}
            />
          </label>
          <details>
            <summary>Ajouter un niveau</summary>
            <form
              className="registry-grid"
              onSubmit={(event) =>
                form(event, (v) => ({
                  action: "add_level",
                  siteId,
                  code: String(v.get("code")),
                  label: String(v.get("label") || ""),
                  number: Number(v.get("number")),
                  sortOrder: Number(v.get("sort") || 0),
                }))
              }
            >
              <label className="field">
                Code
                <input
                  className="input"
                  name="code"
                  required
                  maxLength={30}
                  placeholder="SS1 ou extérieur"
                />
              </label>
              <label className="field">
                Libellé
                <input className="input" name="label" maxLength={100} />
              </label>
              <label className="field">
                Niveau numérique
                <input
                  className="input"
                  name="number"
                  type="number"
                  min={-20}
                  max={50}
                  defaultValue={-1}
                  required
                />
              </label>
              <label className="field">
                Ordre d’affichage
                <input
                  className="input"
                  name="sort"
                  type="number"
                  min={-100}
                  max={100}
                  defaultValue={0}
                />
              </label>
              <button
                className="button button-secondary"
                disabled={mutationDisabled}
              >
                Ajouter le niveau
              </button>
            </form>
          </details>
          {level ? (
            <>
              <LevelPlanHistory
                level={level}
                busy={mutationDisabled}
                mutate={mutate}
              />
              <p className="muted">
                {level.spaces.length} place(s) physique(s) référencée(s). Les
                dimensions inconnues restent vides.
              </p>
              <div className="registry-space-list">
                {level.spaces.map((space) => (
                  <span key={space.id}>
                    Place {space.number || "non numérotée"} ·{" "}
                    {space.lengthM ?? "—"} × {space.widthM ?? "—"} m
                    {space.privateLotReference
                      ? ` · Lot privé ${space.privateLotReference}`
                      : ""}
                  </span>
                ))}
              </div>
              <details>
                <summary>Ajouter une place physique</summary>
                <form
                  className="registry-grid"
                  onSubmit={(event) =>
                    form(event, (v) => ({
                      action: "add_space",
                      levelId,
                      number: String(v.get("number") || ""),
                      privateLotReference: String(v.get("lot") || ""),
                      areaM2: numberOrNull(v.get("area")),
                      lengthM: numberOrNull(v.get("length")),
                      widthM: numberOrNull(v.get("width")),
                      clearanceM: numberOrNull(v.get("height")),
                    }))
                  }
                >
                  <label className="field">
                    Numéro affichable facultatif
                    <input className="input" name="number" maxLength={40} />
                  </label>
                  <label className="field">
                    Référence de lot privée
                    <input className="input" name="lot" maxLength={80} />
                  </label>
                  {[
                    ["area", "Surface (m²)", 500],
                    ["length", "Longueur (m)", 50],
                    ["width", "Largeur (m)", 50],
                    ["height", "Hauteur libre (m)", 20],
                  ].map(([name, label, max]) => (
                    <label className="field" key={name}>
                      {label}
                      <input
                        className="input"
                        name={String(name)}
                        type="number"
                        min="0.01"
                        step="any"
                        max={Number(max)}
                      />
                    </label>
                  ))}
                  <button
                    className="button button-secondary"
                    disabled={mutationDisabled}
                  >
                    Ajouter la place
                  </button>
                </form>
              </details>
            </>
          ) : null}
        </section>
      ) : null}
      <section className="card registry-card">
        <h2>
          <Link2 size={20} /> 3. Rattacher l’annonce et contrôler chaque unité
        </h2>
        <label className="field">
          Annonce en attente
          <FilterSelect
            disabled={busy || loading}
            variant="field"
            label="Annonce en attente"
            value={listingId}
            onChange={(value) => {
              setListingId(value);
              void loadListing(value);
            }}
            options={[
              { value: "", label: "Choisir une annonce" },
              ...pending.map((item) => ({
                value: item.id,
                label: `${item.title} · version ${item.version}`,
              })),
            ]}
          />
        </label>
        <form
          className="registry-inline"
          onSubmit={(event) => {
            event.preventDefault();
            void loadListing(listingId);
          }}
        >
          <label className="field">
            Identifiant d’une autre annonce
            <input
              className="input"
              value={listingId}
              disabled={busy || loading}
              onChange={(event) => setListingId(event.target.value)}
              placeholder="Identifiant de l’annonce à rapprocher"
            />
          </label>
          <button
            className="button button-secondary"
            disabled={busy || loading || !listingId}
          >
            Charger l’annonce
          </button>
        </form>
        {listing ? (
          <>
            <h3>
              {listing.title || "Brouillon sans titre"} · version{" "}
              {listing.version}
            </h3>
            <p className="muted">
              La localisation{" "}
              {listing.locationPrecision === "area"
                ? "de secteur restera masquée au public : ce rattachement ne crée aucun lien public vers le parking."
                : "exacte ne sera présentée dans le parking public qu’après approbation et consentement actif."}
            </p>
            <div className="registry-mapping">
              {listing.spaces.map((unit) => (
                <label className="field" key={unit.id}>
                  Unité {unit.number || "non numérotée"} · niveau {unit.level} ·{" "}
                  {unit.lengthM ?? "—"} × {unit.widthM ?? "—"} m
                  <FilterSelect
                    disabled={busy || loading}
                    variant="field"
                    label={`Place physique de l’unité ${unit.number || "non numérotée"}`}
                    value={mapping[unit.id] || ""}
                    onChange={(value) => {
                      setMapping((current) => ({
                        ...current,
                        [unit.id]: value,
                      }));
                      setChecked(false);
                    }}
                    options={[
                      {
                        value: "",
                        label: "Choisir la place physique correspondante",
                      },
                      ...options
                        .filter((option) => option.level.number === unit.level)
                        .map(({ space, level }) => ({
                          value: space.id,
                          label: `${level.code} · place ${space.number || "non numérotée"} · ${space.lengthM ?? "—"} × ${space.widthM ?? "—"} m${space.privateLotReference ? ` · lot ${space.privateLotReference}` : ""}`,
                        })),
                    ]}
                  />
                </label>
              ))}
            </div>
            <label className="field">
              Justification du rapprochement
              <textarea
                className="input"
                value={reason}
                onChange={(event) => setReason(event.target.value)}
                minLength={15}
                maxLength={2000}
                placeholder="Plan, repères, numéros, dimensions et pièces vérifiés."
              />
            </label>
            <label className="registry-check">
              <input
                type="checkbox"
                checked={checked}
                disabled={mutationDisabled}
                onChange={(event) => setChecked(event.target.checked)}
              />{" "}
              J’ai comparé toutes les unités aux pièces et vérifié qu’elles
              appartiennent au même site, sans déduire la propriété des autres
              places.
            </label>
            <button
              className="button button-primary"
              disabled={
                mutationDisabled ||
                !checked ||
                !site ||
                reason.trim().length < 15 ||
                listing.spaces.some((unit) => !mapping[unit.id])
              }
              onClick={() =>
                void mutate({
                  action: "link_listing",
                  listingId: listing.id,
                  version: listing.version,
                  siteId,
                  units: listing.spaces.map((unit) => ({
                    unitId: unit.id,
                    spaceId: mapping[unit.id],
                  })),
                  reason: reason.trim(),
                } satisfies RegistryCommand)
              }
            >
              Enregistrer le rattachement contrôlé
            </button>
            <Link className="text-link" href="/admin">
              Retourner à la revue de publication
            </Link>
          </>
        ) : (
          <p className="muted">
            Chargez une annonce pour rapprocher toutes ses unités ; aucune
            approbation n’est lancée depuis cet écran.
          </p>
        )}
      </section>
      {site ? (
        <section className="card registry-card">
          <h2>
            <UsersRound size={20} /> 4. Accès aux références communes
          </h2>
          <p className="muted">
            Un contributeur consulte uniquement les références communes
            autorisées. Cet accès ne donne pas les documents privés ou les
            annonces d’autres vendeurs.
          </p>
          <form
            className="registry-grid"
            onSubmit={(event) => {
              event.preventDefault();
              if (!busy && !accountsLoading) void loadAccounts(accountSearch);
            }}
          >
            <label className="field">
              Rechercher un compte
              <input
                className="input"
                type="search"
                maxLength={80}
                placeholder="Nom public ou identifiant"
                value={accountSearch}
                disabled={busy || accountsLoading}
                onChange={(event) => setAccountSearch(event.target.value)}
              />
            </label>
            <button
              className="button button-secondary"
              disabled={busy || accountsLoading}
            >
              Rechercher
            </button>
            {accountSearch || appliedAccountSearch ? (
              <button
                type="button"
                className="button button-secondary"
                disabled={busy || accountsLoading}
                onClick={() => {
                  setAccountSearch("");
                  void loadAccounts();
                }}
              >
                Tous les comptes
              </button>
            ) : null}
          </form>
          {accountsLoading ? (
            <p role="status">Chargement des comptes…</p>
          ) : null}
          {accountsError ? (
            <div>
              <p className="error" role="alert">
                {accountsError}
              </p>
              {failedAccountsLoad ? (
                <button
                  type="button"
                  className="button button-secondary"
                  disabled={busy || accountsLoading}
                  onClick={() =>
                    void loadAccounts(
                      failedAccountsLoad.search,
                      failedAccountsLoad.cursor,
                    )
                  }
                >
                  Réessayer le chargement des comptes
                </button>
              ) : null}
            </div>
          ) : null}
          {!accountsLoading &&
          !accountsError &&
          !accounts.some((account) => account.status === "active") ? (
            <p className="muted" role="status">
              Aucun compte actif parmi les résultats chargés.
              {accountsCursor
                ? " Chargez les comptes suivants ou précisez la recherche."
                : ""}
            </p>
          ) : null}
          {accountsCursor ? (
            <button
              type="button"
              className="button button-secondary"
              disabled={busy || accountsLoading}
              onClick={() =>
                void loadAccounts(appliedAccountSearch, accountsCursor)
              }
            >
              Afficher les comptes suivants
            </button>
          ) : null}
          <form
            className="registry-grid"
            onSubmit={(event) =>
              form(event, (v) => ({
                action: "set_contributor",
                siteId,
                userId: String(v.get("userId")),
                scope: "common_reference",
              }))
            }
          >
            <label className="field">
              Compte habilité
              <input type="hidden" name="userId" value={contributorId} />
              <FilterSelect
                disabled={
                  busy || loading || accountsLoading || Boolean(accountsError)
                }
                variant="field"
                label="Compte habilité aux références communes"
                value={contributorId}
                onChange={setContributorId}
                options={[
                  { value: "", label: "Choisir un compte actif" },
                  ...accounts
                    .filter((account) => account.status === "active")
                    .map((account) => ({
                      value: account.id,
                      label: `${account.name} · ${account.id}`,
                    })),
                ]}
              />
            </label>
            <button
              className="button button-secondary"
              disabled={
                mutationDisabled ||
                accountsLoading ||
                Boolean(accountsError) ||
                !contributorId
              }
            >
              Accorder l’accès commun
            </button>
          </form>
          <ul>
            {site.contributors.map((contributor) => (
              <li key={contributor.userId}>
                {accounts.find((account) => account.id === contributor.userId)
                  ?.name || contributor.userId}{" "}
                · références communes{" "}
                <button
                  className="text-link"
                  disabled={mutationDisabled}
                  onClick={() =>
                    void mutate({
                      action: "set_contributor",
                      siteId,
                      userId: contributor.userId,
                      scope: null,
                    })
                  }
                >
                  Retirer cet accès
                </button>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
      {data.conflicts.length ? (
        <section className="card registry-card">
          <h2>Conflits à examiner</h2>
          <p className="muted">
            Un conflit ne prouve pas la propriété d’un vendeur. Consultez les
            pièces et le dossier de modération avant toute décision.
          </p>
          {data.conflicts.map((conflict) => (
            <p key={conflict.id}>
              <Link href={`/admin/parkings?listingId=${conflict.listingId}`}>
                Annonce {conflict.listingId.slice(0, 8)}…
              </Link>{" "}
              · {conflict.status === "open" ? "Ouvert" : "Résolu"} ·{" "}
              {new Date(conflict.createdAt).toLocaleDateString("fr-FR")}
            </p>
          ))}
        </section>
      ) : null}
    </AccountShell>
  );
}
export default function RegistryManager({
  initialListingId,
}: {
  initialListingId?: string;
}) {
  return (
    <AccountGate admin adminOnly>
      {(user) => <Content user={user} initialListingId={initialListingId} />}
    </AccountGate>
  );
}
