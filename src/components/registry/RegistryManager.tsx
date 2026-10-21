"use client";
import FilterSelect from "@/components/FilterSelect";
import { useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { RefreshCw, Building2, Layers3, Link2, UsersRound } from "lucide-react";
import { api } from "@/lib/client";
import { AccountGate, AccountShell } from "@/components/account/shared";
import {
  registryCommandSchema,
  type RegistryCommand,
  type RegistryAdminData,
  type RegistryMutationResult,
} from "@/lib/parking-registry";
import type { Listing, User, AdminUser } from "@/lib/types";
import "@/styles/registry.css";
const empty: RegistryAdminData = { sites: [], links: [], conflicts: [] };
function Content({
  user,
  initialListingId,
}: {
  user: User;
  initialListingId?: string;
}) {
  const [contributorId, setContributorId] = useState("");
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
    [error, setError] = useState(""),
    [notice, setNotice] = useState("");
  const site = data.sites.find((item) => item.id === siteId),
    level = site?.levels.find((item) => item.id === levelId);
  async function reload() {
    setLoading(true);
    const results = await Promise.allSettled([
      api<RegistryAdminData>("/api/admin/parking-registry"),
      api<Listing[]>("/api/admin/revisions"),
      ...(user.role === "admin" ? [api<AdminUser[]>("/api/admin/users")] : []),
    ]);
    const [registry, revisions, users] = results;
    if (registry.status === "fulfilled") {
      setData(registry.value);
      setSiteId((current) =>
        registry.value.sites.some((site) => site.id === current)
          ? current
          : registry.value.sites[0]?.id || "",
      );
    } else setError((registry.reason as Error).message);
    if (revisions.status === "fulfilled") setPending(revisions.value);
    if (users?.status === "fulfilled") setAccounts(users.value as AdminUser[]);
    setLoading(false);
  }
  useEffect(() => {
    void reload();
  }, []);
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
    if (!id) return;
    setBusy(true);
    setError("");
    setChecked(false);
    try {
      const item = await api<Listing>(
        `/api/scenes?scope=listing&listingId=${encodeURIComponent(id)}`,
      );
      setListing(item);
      setListingId(item.id);
      const links = data.links.filter((link) => link.listingId === item.id);
      if (links[0]) setSiteId(links[0].siteId);
      setMapping(
        Object.fromEntries(links.map((link) => [link.unitId, link.spaceId])),
      );
    } catch (error) {
      setError((error as Error).message);
      setListing(null);
    } finally {
      setBusy(false);
    }
  }
  useEffect(() => {
    if (initialListingId) void loadListing(initialListingId);
  }, [initialListingId]);
  async function mutate(command: unknown) {
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
          (result.status === "conflict"
            ? "Un conflit de correspondance est ouvert. Aucun rapprochement concurrent n’est forcé."
            : "Le registre a été enregistré."),
      );
      if (result.status === "saved" && parsed.data.action === "link_listing") {
        setChecked(false);
        await loadListing(parsed.data.listingId);
      }
      await reload();
      if (result.id && parsed.data.action === "create_site")
        setSiteId(result.id);
    } catch (error) {
      setError((error as Error).message);
    } finally {
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
            <button className="button button-secondary" disabled={busy}>
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
              <button className="button button-secondary" disabled={busy}>
                Ajouter le niveau
              </button>
            </form>
          </details>
          {level ? (
            <>
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
                  <button className="button button-secondary" disabled={busy}>
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
              onChange={(event) => setListingId(event.target.value)}
              placeholder="Identifiant de l’annonce à rapprocher"
            />
          </label>
          <button
            className="button button-secondary"
            disabled={busy || !listingId}
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
                onChange={(event) => setChecked(event.target.checked)}
              />{" "}
              J’ai comparé toutes les unités aux pièces et vérifié qu’elles
              appartiennent au même site, sans déduire la propriété des autres
              places.
            </label>
            <button
              className="button button-primary"
              disabled={
                busy ||
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
              {accounts.length ? (
                <>
                  <input type="hidden" name="userId" value={contributorId} />
                  <FilterSelect
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
                          label: `${account.name} · ${account.role}`,
                        })),
                    ]}
                  />
                </>
              ) : (
                <input
                  className="input"
                  name="userId"
                  required
                  placeholder="Identifiant du compte validé"
                />
              )}
            </label>
            <button
              className="button button-secondary"
              disabled={busy || (accounts.length > 0 && !contributorId)}
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
                  disabled={busy}
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
