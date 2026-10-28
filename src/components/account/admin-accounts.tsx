"use client";
import FilterSelect from "../FilterSelect";
import { useEffect, useRef, useState, type FormEvent } from "react";
import type { AdminUser, User } from "@/lib/types";
import { AccountGate, AccountShell, api } from "./shared";
const statusLabels: Record<AdminUser["status"], string> = {
  active: "Actif",
  suspended: "Suspendu",
  deletion_pending: "Fermeture en cours",
  deleted: "Fermé",
};
const roleLabels: Record<User["role"], string> = {
  member: "Membre",
  moderator: "Modérateur",
  admin: "Administrateur",
};
function Content({ user }: { user: User }) {
  const [items, setItems] = useState<AdminUser[]>([]),
    [loading, setLoading] = useState(true),
    [selected, setSelected] = useState<AdminUser | null>(null),
    [role, setRole] = useState<User["role"]>("member"),
    [status, setStatus] = useState("active"),
    [reason, setReason] = useState(""),
    [confirmed, setConfirmed] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [query, setQuery] = useState(""),
    [appliedQuery, setAppliedQuery] = useState(""),
    [nextCursor, setNextCursor] = useState<string | null>(null),
    [failedLoad, setFailedLoad] = useState<{
      search: string;
      cursor: string | null;
    } | null>(null);
  const loadVersion = useRef(0);
  const decisionHeading = useRef<HTMLHeadingElement>(null);
  async function load(search = appliedQuery, cursor: string | null = null) {
    const version = ++loadVersion.current;
    setLoading(true);
    setError("");
    setFailedLoad(null);
    if (!cursor) {
      setSelected(null);
      setConfirmed(false);
    }
    try {
      const params = new URLSearchParams({ q: search, limit: "50" });
      if (cursor) params.set("cursor", cursor);
      const r = await api<{ data: AdminUser[]; nextCursor: string | null }>(
        `/api/admin/users?${params}`,
      );
      if (version !== loadVersion.current) return;
      setItems((current) =>
        cursor
          ? [
              ...new Map(
                [...current, ...r.data].map((item) => [item.id, item]),
              ).values(),
            ]
          : r.data,
      );
      setNextCursor(r.nextCursor);
      setAppliedQuery(search);
    } catch (e) {
      if (version === loadVersion.current) {
        setError((e as Error).message);
        setFailedLoad({ search, cursor });
      }
    } finally {
      if (version === loadVersion.current) setLoading(false);
    }
  }
  useEffect(() => {
    void load();
    return () => {
      loadVersion.current++;
    };
  }, []);
  useEffect(() => {
    if (!selected) return;
    decisionHeading.current?.focus({ preventScroll: true });
    decisionHeading.current?.scrollIntoView({
      block: "center",
      behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches
        ? "instant"
        : "smooth",
    });
  }, [selected?.id]);
  const changed =
    selected && (selected.role !== role || selected.status !== status);
  async function decide(e: FormEvent) {
    e.preventDefault();
    if (!selected || !confirmed || !changed || busy) return;
    setBusy(true);
    setError("");
    setFailedLoad(null);
    try {
      const result = await api<{ data: AdminUser }>(
        `/api/admin/users/${selected.id}/decision`,
        {
          method: "POST",
          body: JSON.stringify({
            version: selected.version,
            ...(role !== selected.role ? { role } : {}),
            ...(status !== selected.status ? { status } : {}),
            reason: reason.trim(),
          }),
        },
      );
      setItems((current) =>
        current.map((item) =>
          item.id === result.data.id ? result.data : item,
        ),
      );
      setNotice(
        "La décision et son motif ont été enregistrés. Une réactivation du compte ne republie pas ses annonces suspendues.",
      );
      setSelected(null);
      setReason("");
      setConfirmed(false);
    } catch (e) {
      setError((e as Error).message);
      setConfirmed(false);
    } finally {
      setBusy(false);
    }
  }
  return (
    <AccountShell
      user={user}
      title="Comptes et accès"
      eyebrow="ADMINISTRATION"
      action={
        <button
          className="button button-secondary"
          disabled={busy || loading}
          onClick={() => {
            setError("");
            setSelected(null);
            void load();
          }}
        >
          Actualiser
        </button>
      }
    >
      <p className="muted">
        Recherchez un compte par son nom public ou son identifiant. Les emails
        et coordonnées privées ne sont pas affichés.
      </p>
      <form
        className="account-visit-actions"
        onSubmit={(event) => {
          event.preventDefault();
          if (!busy && !loading) void load(query);
        }}
      >
        <label className="field">
          Nom public ou identifiant
          <input
            className="input"
            type="search"
            value={query}
            maxLength={80}
            disabled={busy}
            onChange={(event) => setQuery(event.target.value)}
          />
        </label>
        <button className="button button-primary" disabled={busy || loading}>
          Rechercher
        </button>
        {query || appliedQuery ? (
          <button
            type="button"
            className="button button-secondary"
            disabled={busy || loading}
            onClick={() => {
              setQuery("");
              void load("");
            }}
          >
            Tous les comptes
          </button>
        ) : null}
      </form>
      {error ? (
        <div>
          <p className="error" role="alert">
            {error}
          </p>
          {failedLoad ? (
            <button
              className="button button-secondary"
              disabled={busy || loading}
              onClick={() => void load(failedLoad.search, failedLoad.cursor)}
            >
              Réessayer le chargement
            </button>
          ) : null}
        </div>
      ) : null}
      {notice ? (
        <p className="notice" role="status">
          {notice}
        </p>
      ) : null}
      {loading && !items.length ? (
        <p role="status">Chargement des comptes…</p>
      ) : items.length ? (
        <div className="account-list">
          {items.map((item) => (
            <button
              className={`account-review-row${selected?.id === item.id ? " active" : ""}`}
              key={item.id}
              aria-pressed={selected?.id === item.id}
              aria-controls={selected ? "admin-account-decision" : undefined}
              disabled={
                busy ||
                loading ||
                item.id === user.id ||
                !["active", "suspended"].includes(item.status)
              }
              onClick={() => {
                setSelected(item);
                setRole(item.role);
                setStatus(item.status);
                setReason("");
                setConfirmed(false);
                setError("");
                setFailedLoad(null);
                setNotice("");
              }}
            >
              <span>
                <strong>
                  {item.name}
                  {item.id === user.id ? " · votre compte" : ""}
                </strong>
                <span>
                  {item.sellerType === "professional"
                    ? "Professionnel déclaré"
                    : item.sellerType === "private"
                      ? "Particulier déclaré"
                      : "Statut vendeur non renseigné"}{" "}
                  · version {item.version}
                </span>
              </span>
              <span>
                {roleLabels[item.role]} · {statusLabels[item.status]}
              </span>
            </button>
          ))}
        </div>
      ) : !error ? (
        <p className="notice">Aucun compte ne correspond à cette recherche.</p>
      ) : null}
      {items.length ? (
        <p className="muted" role="status">
          {items.length} compte{items.length > 1 ? "s" : ""} affiché
          {items.length > 1 ? "s" : ""}
          {nextCursor ? " · d’autres résultats sont disponibles" : ""}.
        </p>
      ) : null}
      {nextCursor ? (
        <button
          className="button button-secondary"
          disabled={loading || busy}
          onClick={() => void load(appliedQuery, nextCursor)}
        >
          {loading ? "Chargement…" : "Afficher les comptes suivants"}
        </button>
      ) : null}
      {selected ? (
        <form
          id="admin-account-decision"
          className="card account-review-detail"
          aria-labelledby="admin-account-decision-title"
          onSubmit={decide}
        >
          <h2
            ref={decisionHeading}
            id="admin-account-decision-title"
            tabIndex={-1}
          >
            Décision sur {selected.name}
          </h2>
          <p className="muted">
            Compte {selected.id} · version {selected.version}
          </p>
          <div className="form-grid">
            <div className="field">
              <span>{"Statut"}</span>
              <FilterSelect
                label={"Statut"}
                variant="field"
                value={status}
                disabled={busy}
                onChange={(selectedValue) => {
                  setStatus(selectedValue);
                  setConfirmed(false);
                }}
                options={[
                  { value: "active", label: "Actif" },
                  { value: "suspended", label: "Suspendu" },
                ]}
              />
            </div>
            <div className="field">
              <span>{"Rôle"}</span>
              <FilterSelect
                label={"Rôle"}
                variant="field"
                value={role}
                disabled={busy}
                onChange={(selectedValue) => {
                  setRole(selectedValue as User["role"]);
                  setConfirmed(false);
                }}
                options={[
                  { value: "member", label: "Membre" },
                  { value: "moderator", label: "Modérateur" },
                  { value: "admin", label: "Administrateur" },
                ]}
              />
            </div>
          </div>
          <p className="notice">
            Une suspension masque les publications et bloque les actions du
            compte. Une réactivation ne remet aucune annonce en ligne
            automatiquement. Le serveur interdit la modification de votre propre
            compte et protège le dernier administrateur actif.
          </p>
          <label className="field">
            Motif de la décision
            <textarea
              className="input"
              value={reason}
              onChange={(e) => {
                setReason(e.target.value);
                setConfirmed(false);
              }}
              minLength={15}
              maxLength={2000}
              rows={4}
              required
              disabled={busy}
            />
          </label>
          <label className="account-checkbox">
            <input
              type="checkbox"
              checked={confirmed}
              onChange={(e) => setConfirmed(e.target.checked)}
              disabled={busy}
            />
            <span>
              Je confirme ce rôle, ce statut et le motif pour {selected.name}.
            </span>
          </label>
          <div className="account-review-actions">
            <button
              className="button button-primary"
              disabled={
                busy || !changed || !confirmed || reason.trim().length < 15
              }
            >
              {busy ? "Enregistrement…" : "Confirmer la décision"}
            </button>
            <button
              type="button"
              className="button button-secondary"
              disabled={busy}
              onClick={() => setSelected(null)}
            >
              Annuler
            </button>
          </div>
        </form>
      ) : null}
    </AccountShell>
  );
}
export default function AdminAccounts() {
  return (
    <AccountGate admin adminOnly>
      {(user) => <Content user={user} />}
    </AccountGate>
  );
}
