"use client";
import FilterSelect from "../FilterSelect";
import { useEffect, useRef, useState, type FormEvent } from "react";
import Link from "next/link";
import {
  type AdminEntitlements,
  type QuotaLimits,
  quotaLimitsSchema,
} from "@/lib/entitlements";
import type { AdminUser, User } from "@/lib/types";
import { AccountGate, AccountShell, api } from "./shared";
import { UsageList } from "./entitlement-usage";
const fields: { key: keyof QuotaLimits; label: string; max: number }[] = [
  { key: "activeListings", label: "Annonces actives", max: 500 },
  { key: "draftsPerDay", label: "Nouveaux brouillons / 24 h", max: 1000 },
  { key: "submissionsPerDay", label: "Envois en modération / 24 h", max: 2000 },
  { key: "contactsPerDay", label: "Nouvelles conversations / 24 h", max: 1000 },
  { key: "messagesPerMinute", label: "Messages / minute", max: 300 },
  { key: "messagesBurst", label: "Messages / 5 secondes", max: 50 },
  { key: "uploadsPerHour", label: "Fichiers ajoutés / heure", max: 1000 },
  {
    key: "uploadBytesPerDay",
    label: "Volume ajouté / 24 h (octets)",
    max: 2147483648,
  },
];
function Content({ user }: { user: User }) {
  const [data, setData] = useState<AdminEntitlements | null>(null),
    [users, setUsers] = useState<AdminUser[]>([]),
    [userId, setUserId] = useState(""),
    [limits, setLimits] = useState<QuotaLimits | null>(null),
    [expires, setExpires] = useState(""),
    [reason, setReason] = useState(""),
    [confirm, setConfirm] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [userSearch, setUserSearch] = useState(""),
    [appliedUserSearch, setAppliedUserSearch] = useState(""),
    [usersLoading, setUsersLoading] = useState(false),
    [usersCursor, setUsersCursor] = useState<string | null>(null);
  const usersVersion = useRef(0);
  async function loadUsers(search = "", cursor: string | null = null) {
    const version = ++usersVersion.current;
    setUsersLoading(true);
    setError("");
    try {
      const params = new URLSearchParams({ q: search, limit: "50" });
      if (cursor) params.set("cursor", cursor);
      const result = await api<{
        data: AdminUser[];
        nextCursor: string | null;
      }>(`/api/admin/users?${params}`);
      if (version !== usersVersion.current) return;
      setUsers((current) => [
        ...new Map(
          [
            ...(cursor
              ? current
              : current.filter((item) => item.id === userId)),
            ...result.data,
          ].map((item) => [item.id, item]),
        ).values(),
      ]);
      setUsersCursor(result.nextCursor);
      setAppliedUserSearch(search);
    } catch (e) {
      if (version === usersVersion.current) setError((e as Error).message);
    } finally {
      if (version === usersVersion.current) setUsersLoading(false);
    }
  }
  async function load(id: string) {
    setBusy(true);
    setError("");
    setData(null);
    setLimits(null);
    setConfirm(false);
    setReason("");
    setExpires("");
    try {
      const result = await api<{ data: AdminEntitlements }>(
        `/api/admin/entitlements${id ? `?userId=${encodeURIComponent(id)}` : ""}`,
      );
      setData(result.data);
      setLimits(result.data.user?.limits ?? result.data.freePlan.limits);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  useEffect(() => {
    void load("");
    void loadUsers();
    return () => {
      usersVersion.current++;
    };
  }, []);
  async function save(e: FormEvent, clear = false) {
    e.preventDefault();
    if (!data || !limits || !confirm || busy) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      if (!clear && !quotaLimitsSchema.safeParse(limits).success)
        throw new Error(
          "Les limites doivent être des nombres entiers dans les bornes indiquées.",
        );
      if (
        userId &&
        !clear &&
        (!expires || !Number.isFinite(Date.parse(expires)))
      )
        throw new Error("Choisissez une échéance pour cette adaptation.");
      const command = userId
        ? {
            action: clear ? "clear_user_override" : "set_user_override",
            userId,
            version: data.user?.override?.version ?? 0,
            reason: reason.trim(),
            ...(!clear
              ? { limits, expiresAt: new Date(expires).toISOString() }
              : {}),
          }
        : {
            action: "set_free_limits",
            version: data.freePlan.version,
            limits,
            reason: reason.trim(),
          };
      await api("/api/admin/entitlements", {
        method: "POST",
        body: JSON.stringify(command),
      });
      setNotice(
        clear
          ? "L’adaptation a été retirée. Les limites du forfait gratuit s’appliquent."
          : "Les limites et le motif ont été enregistrés.",
      );
      await load(userId);
    } catch (e) {
      setError((e as Error).message);
      setConfirm(false);
    } finally {
      setBusy(false);
    }
  }
  return (
    <AccountShell user={user} title="Limites de la V1" eyebrow="ADMINISTRATION">
      <p className="muted">
        Le forfait gratuit reste le seul forfait actif. Ces limites ne créent
        aucun abonnement ni paiement. Les modifications sont versionnées et
        tracées, avec authentification renforcée sur le site connecté.
      </p>
      <Link href="/compte/securite">Vérifier ma session sécurisée</Link>
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
      <form
        className="account-visit-actions"
        onSubmit={(event) => {
          event.preventDefault();
          if (!busy && !usersLoading) void loadUsers(userSearch);
        }}
      >
        <label className="field">
          Rechercher un compte
          <input
            className="input"
            type="search"
            maxLength={80}
            value={userSearch}
            disabled={busy || usersLoading}
            onChange={(event) => setUserSearch(event.target.value)}
            placeholder="Nom public ou identifiant"
          />
        </label>
        <button
          className="button button-secondary"
          disabled={busy || usersLoading}
        >
          Rechercher
        </button>
      </form>
      <div className="field">
        <span>{"Portée de la modification"}</span>
        <FilterSelect
          label={"Portée de la modification"}
          variant="field"
          value={userId}
          disabled={busy || usersLoading}
          onChange={(selectedValue) => {
            const id = selectedValue;
            setUserId(id);
            setNotice("");
            void load(id);
          }}
          options={[
            { value: "", label: "Forfait gratuit · tous les comptes" },
            ...users.map((item) => ({
              value: item.id,
              label: [item.name, " · ", item.id].join("").trim(),
            })),
          ]}
        />
      </div>
      {usersCursor ? (
        <button
          type="button"
          className="button button-secondary"
          disabled={busy || usersLoading}
          onClick={() => void loadUsers(appliedUserSearch, usersCursor)}
        >
          {usersLoading ? "Chargement…" : "Afficher les comptes suivants"}
        </button>
      ) : null}
      {!usersLoading &&
      appliedUserSearch &&
      !users.some(
        (item) =>
          item.name
            .toLowerCase()
            .includes(appliedUserSearch.trim().toLowerCase()) ||
          item.id.includes(appliedUserSearch.trim().toLowerCase()),
      ) ? (
        <p role="status" className="muted">
          Aucun compte ne correspond à cette recherche.
        </p>
      ) : null}
      {busy && !data ? <p role="status">Chargement des limites…</p> : null}
      {data && limits ? (
        <form
          className="card account-settings-card"
          style={{ padding: 24, marginTop: 24 }}
          onSubmit={(e) => void save(e)}
        >
          <h2>
            {userId ? "Adaptation temporaire du compte" : "Limites communes"}
          </h2>
          <p className="muted">
            {userId
              ? "Les valeurs ci-dessous remplacent les limites communes jusqu’à l’échéance, dans un maximum de 90 jours. Zéro bloque les nouvelles actions concernées."
              : "Ces valeurs s’appliquent aux comptes sans adaptation active. Zéro bloque les nouvelles actions concernées."}
          </p>
          <div className="form-grid">
            {fields.map((field) => (
              <label className="field" key={field.key}>
                {field.label}
                <input
                  className="input"
                  type="number"
                  min={0}
                  max={field.max}
                  step={1}
                  required
                  disabled={busy}
                  value={limits[field.key]}
                  onChange={(e) => {
                    setLimits({
                      ...limits,
                      [field.key]: Number(e.target.value),
                    });
                    setConfirm(false);
                  }}
                />
                <span className="small muted">
                  Maximum : {field.max.toLocaleString("fr-FR")}
                </span>
              </label>
            ))}
          </div>
          {userId ? (
            <label className="field">
              Échéance de l’adaptation
              <input
                className="input"
                type="datetime-local"
                value={expires}
                required
                disabled={busy}
                onChange={(e) => {
                  setExpires(e.target.value);
                  setConfirm(false);
                }}
              />
            </label>
          ) : null}
          <label className="field">
            Motif de la décision
            <textarea
              className="input"
              rows={3}
              minLength={15}
              maxLength={2000}
              required
              disabled={busy}
              value={reason}
              onChange={(e) => {
                setReason(e.target.value);
                setConfirm(false);
              }}
            />
          </label>
          <label className="account-checkbox">
            <input
              type="checkbox"
              checked={confirm}
              disabled={busy}
              onChange={(e) => setConfirm(e.target.checked)}
            />
            <span>Je confirme cette portée, ces limites et ce motif.</span>
          </label>
          <div className="account-review-actions">
            <button
              className="button button-primary"
              disabled={busy || !confirm || reason.trim().length < 15}
            >
              {busy ? "Enregistrement…" : "Enregistrer les limites"}
            </button>
            {userId && data.user?.override?.active ? (
              <button
                type="button"
                className="button button-secondary"
                disabled={busy || !confirm || reason.trim().length < 15}
                onClick={(e) => void save(e, true)}
              >
                Retirer l’adaptation
              </button>
            ) : null}
          </div>
          {data.user ? (
            <>
              <h2>Utilisation actuelle du compte</h2>
              <UsageList data={data.user} />
            </>
          ) : null}
        </form>
      ) : null}
    </AccountShell>
  );
}
export default function AdminEntitlementsPage() {
  return (
    <AccountGate admin adminOnly>
      {(user) => <Content user={user} />}
    </AccountGate>
  );
}
