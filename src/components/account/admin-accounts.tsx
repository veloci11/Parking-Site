"use client";
import FilterSelect from "../FilterSelect";
import { useEffect, useState, type FormEvent } from "react";
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
    [notice, setNotice] = useState("");
  async function load() {
    setLoading(true);
    try {
      const r = await api<{ data: AdminUser[] }>("/api/admin/users");
      setItems(r.data);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    void load();
  }, []);
  const changed =
    selected && (selected.role !== role || selected.status !== status);
  async function decide(e: FormEvent) {
    e.preventDefault();
    if (!selected || !confirmed || !changed || busy) return;
    setBusy(true);
    setError("");
    try {
      await api(`/api/admin/users/${selected.id}/decision`, {
        method: "POST",
        body: JSON.stringify({
          version: selected.version,
          ...(role !== selected.role ? { role } : {}),
          ...(status !== selected.status ? { status } : {}),
          reason: reason.trim(),
        }),
      });
      setNotice(
        "La décision et son motif ont été enregistrés. Une réactivation du compte ne republie pas ses annonces suspendues.",
      );
      setSelected(null);
      setReason("");
      setConfirmed(false);
      await load();
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
        Liste limitée à 100 comptes, sans email ni coordonnées privées. Les
        rôles et suspensions sont des décisions distinctes du statut déclaré
        particulier/professionnel.
      </p>
      {error ? (
        <p className="error" role="alert">
          {error}
        </p>
      ) : null}
      {notice ? (
        <p className="notice" role="status">
          {notice}
        </p>
      ) : null}
      {loading ? (
        <p role="status">Chargement des comptes…</p>
      ) : items.length ? (
        <div className="account-list">
          {items.map((item) => (
            <button
              className="account-review-row"
              key={item.id}
              disabled={
                busy ||
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
      ) : (
        <p className="notice">Aucun compte à afficher.</p>
      )}
      {selected ? (
        <form className="card account-review-detail" onSubmit={decide}>
          <h2>Décision sur {selected.name}</h2>
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
