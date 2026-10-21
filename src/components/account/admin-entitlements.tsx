"use client";
import FilterSelect from "../FilterSelect";
import { useEffect, useState, type FormEvent } from "react";
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
    [notice, setNotice] = useState("");
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
    void api<{ data: AdminUser[] }>("/api/admin/users")
      .then((r) => setUsers(r.data))
      .catch((e) => setError((e as Error).message));
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
      <div className="field">
        <span>{"Portée de la modification"}</span>
        <FilterSelect
          label={"Portée de la modification"}
          variant="field"
          value={userId}
          disabled={busy}
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
