"use client";
import { useEffect, useRef, useState } from "react";
import type { AuditEntry, User } from "@/lib/types";
import { auditActionLabel } from "@/lib/admin-account-ux";
import { AccountGate, AccountShell, api } from "./shared";
function Content({ user }: { user: User }) {
  const [items, setItems] = useState<AuditEntry[]>([]),
    [cursor, setCursor] = useState<string | null>(null),
    [loading, setLoading] = useState(true),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [failedCursor, setFailedCursor] = useState<string | undefined>();
  const loadVersion = useRef(0);
  async function load(next?: string) {
    const version = ++loadVersion.current;
    setError("");
    setFailedCursor(undefined);
    if (next) setBusy(true);
    else setLoading(true);
    try {
      const p = new URLSearchParams({ limit: "50" });
      if (next) p.set("cursor", next);
      const r = await api<{ data: AuditEntry[]; nextCursor?: string | null }>(
        `/api/admin/audit?${p}`,
      );
      if (version !== loadVersion.current) return;
      setItems((current) =>
        next
          ? [
              ...current,
              ...r.data.filter(
                (row) => !current.some((old) => old.id === row.id),
              ),
            ]
          : r.data,
      );
      setCursor(r.nextCursor || null);
    } catch (e) {
      if (version === loadVersion.current) {
        setError((e as Error).message);
        setFailedCursor(next);
      }
    } finally {
      if (version === loadVersion.current) {
        setLoading(false);
        setBusy(false);
      }
    }
  }
  useEffect(() => {
    void load();
    return () => {
      loadVersion.current++;
    };
  }, []);
  return (
    <AccountShell
      user={user}
      title="Journal administratif"
      eyebrow="ADMINISTRATION"
      action={
        <button
          className="button button-secondary"
          disabled={busy || loading}
          onClick={() => void load()}
        >
          Actualiser
        </button>
      }
    >
      <p className="muted">
        Événements techniques et décisions conservés côté serveur. Ce journal
        affiche identifiant, acteur, action, cible, date et changements d’état
        limités ; aucun texte de conversation ni coordonnées privées.
      </p>
      {error ? (
        <div>
          <p className="error" role="alert">
            {error}
          </p>
          <button
            className="button button-secondary"
            disabled={busy || loading}
            onClick={() => void load(failedCursor)}
          >
            Réessayer le chargement
          </button>
        </div>
      ) : null}
      {loading && !items.length ? (
        <p role="status">Chargement du journal…</p>
      ) : items.length ? (
        <div className="account-audit-list">
          {items.map((item) => (
            <article className="card" key={item.id}>
              <strong>{auditActionLabel(item.action)}</strong>
              <time dateTime={item.createdAt}>
                {new Date(item.createdAt).toLocaleString("fr-FR")}
              </time>
              <dl className="account-quality-list">
                <div>
                  <dt>Action</dt>
                  <dd>{item.action}</dd>
                </div>
                <div>
                  <dt>Événement</dt>
                  <dd>{item.id}</dd>
                </div>
                <div>
                  <dt>Acteur</dt>
                  <dd>{item.actorId || "Système"}</dd>
                </div>
                <div>
                  <dt>Cible</dt>
                  <dd>{item.targetId || "Non renseignée"}</dd>
                </div>
              </dl>
              {item.requestId ? (
                <p className="muted small">
                  Référence de requête : {item.requestId}
                </p>
              ) : null}
              {item.before || item.after ? (
                <details>
                  <summary>État avant et après</summary>
                  <dl className="account-quality-list">
                    <div>
                      <dt>Avant</dt>
                      <dd>
                        {Object.entries(item.before || {})
                          .map(
                            ([key, value]) => `${key} : ${value ?? "inconnu"}`,
                          )
                          .join(" · ") || "Non renseigné"}
                      </dd>
                    </div>
                    <div>
                      <dt>Après</dt>
                      <dd>
                        {Object.entries(item.after || {})
                          .map(
                            ([key, value]) => `${key} : ${value ?? "inconnu"}`,
                          )
                          .join(" · ") || "Non renseigné"}
                      </dd>
                    </div>
                  </dl>
                </details>
              ) : null}
            </article>
          ))}
        </div>
      ) : !error ? (
        <p className="notice">Aucun événement à afficher.</p>
      ) : null}
      {cursor ? (
        <button
          className="button button-secondary"
          disabled={busy || loading}
          onClick={() => void load(cursor)}
        >
          {busy ? "Chargement…" : "Afficher les événements précédents"}
        </button>
      ) : null}
    </AccountShell>
  );
}
export default function AdminAudit() {
  return (
    <AccountGate admin adminOnly>
      {(user) => <Content user={user} />}
    </AccountGate>
  );
}
