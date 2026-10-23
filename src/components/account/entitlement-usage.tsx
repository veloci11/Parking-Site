"use client";
import { useEffect, useState } from "react";
import type { Entitlements } from "@/lib/entitlements";
import { api } from "./shared";
export const usageLabels: Record<keyof Entitlements["usage"], string> = {
  activeListings: "Annonces actives",
  drafts: "Nouveaux brouillons · 24 h",
  submissions: "Envois en modération · 24 h",
  contacts: "Nouvelles conversations · 24 h",
  messages: "Messages · minute",
  messageBurst: "Messages · 5 secondes",
  uploads: "Fichiers ajoutés · heure",
  uploadBytes: "Volume ajouté · 24 h",
};
export function quotaAmount(value: number, bytes = false) {
  return bytes
    ? `${(value / 1048576).toLocaleString("fr-FR", { maximumFractionDigits: 1 })} Mio`
    : value.toLocaleString("fr-FR");
}
export function UsageList({ data }: { data: Entitlements }) {
  return (
    <div className="quota-list">
      {(Object.keys(usageLabels) as (keyof Entitlements["usage"])[]).map(
        (key) => {
          const usage = data.usage[key];
          return (
            <div className="quota-row" key={key}>
              <div>
                <strong>{usageLabels[key]}</strong>
                <span className="small muted">
                  {usage.resetsAt
                    ? `Renouvellement le ${new Date(usage.resetsAt).toLocaleString("fr-FR")}`
                    : key === "activeListings"
                      ? "Les annonces clôturées libèrent une place."
                      : "Fenêtre ouverte à la prochaine action."}
                </span>
              </div>
              <span>
                {quotaAmount(usage.used, key === "uploadBytes")} /{" "}
                {quotaAmount(usage.limit, key === "uploadBytes")}
              </span>
            </div>
          );
        },
      )}
    </div>
  );
}
export default function EntitlementUsage() {
  const [data, setData] = useState<Entitlements | null>(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  async function load() {
    setBusy(true);
    setError("");
    try {
      const result = await api<{ data: Entitlements }>("/api/entitlements");
      setData(result.data);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  useEffect(() => {
    void load();
  }, []);
  return (
    <section className="card account-settings-card" style={{ padding: 24 }}>
      <div className="section-row">
        <div>
          <h2>Votre utilisation</h2>
        </div>
        <button
          className="button button-secondary"
          onClick={() => void load()}
          disabled={busy}
        >
          Actualiser
        </button>
      </div>
      {error ? (
        <p className="error" role="alert">
          {error}
        </p>
      ) : null}
      {data ? (
        <>
          <UsageList data={data} />
          {data.override?.active ? (
            <p className="notice">
              Une adaptation temporaire de vos limites est active jusqu’au{" "}
              {new Date(data.override.expiresAt).toLocaleString("fr-FR")}.
            </p>
          ) : null}
        </>
      ) : busy ? (
        <p role="status">Chargement de vos limites…</p>
      ) : null}
    </section>
  );
}
