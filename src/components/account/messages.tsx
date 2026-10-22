"use client";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type FormEvent,
} from "react";
import Link from "next/link";
import { CalendarDays, Check, Mail, Send, X } from "lucide-react";
import { AccountGate, AccountShell, api } from "./shared";
import { mergeMessageHistory } from "./message-history";
import {
  messageRequestDraft,
  composerAfterAcknowledgement,
  createConversationSendScope,
  type MessageRequestDraft,
} from "./message-request-draft";
import {
  visitRequestDraft,
  type VisitRequestDraft,
} from "./visit-request-draft";
import ContextReportForm from "./context-report-form";
import type { Conversation, Listing, Message, User, Visit } from "@/lib/types";
const visitLabels: Record<Visit["status"], string> = {
  requested: "Visite demandée",
  accepted: "À organiser",
  declined: "Visite refusée",
  cancelled: "Visite annulée",
  confirmed: "Visite confirmée",
};
function formatDate(date: string) {
  return new Intl.DateTimeFormat("fr-FR", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(date));
}
function Content({ user, id }: { user: User; id?: string }) {
  const [conversations, setConversations] = useState<Conversation[]>([]),
    [messages, setMessages] = useState<Message[]>([]),
    [visits, setVisits] = useState<Visit[]>([]),
    [ownListings, setOwnListings] = useState<string[]>([]),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(""),
    [sending, setSending] = useState(false),
    [text, setText] = useState(""),
    [showVisit, setShowVisit] = useState(false),
    [proposed, setProposed] = useState(""),
    [confirmed, setConfirmed] = useState<Record<string, string>>({}),
    [busyVisit, setBusyVisit] = useState(""),
    [timezone, setTimezone] = useState(""),
    [blockState, setBlockState] = useState<{
      blocked: boolean;
      blockedByMe: boolean;
    } | null>(null),
    [blockConfirm, setBlockConfirm] = useState(false),
    [blockBusy, setBlockBusy] = useState(false),
    [blockNotice, setBlockNotice] = useState("");
  const [reportTarget, setReportTarget] = useState<{
    type: "conversation" | "message";
    id: string;
  } | null>(null);
  const pendingMessage = useRef<MessageRequestDraft | null>(null);
  const [sendScope] = useState(createConversationSendScope);
  useLayoutEffect(() => {
    sendScope.select(id);
    return () => sendScope.select(undefined);
  }, [id, sendScope]);
  const pendingVisit = useRef<VisitRequestDraft | null>(null);
  const feed = useRef<HTMLDivElement>(null),
    currentId = useRef(id),
    initializedCursor = useRef(false),
    scrollRestore = useRef<{
      height: number;
      top: number;
      bottom: boolean;
      prepend: boolean;
    } | null>(null);
  currentId.current = id;
  const [historyCursor, setHistoryCursor] = useState<string | null>(null),
    [loadingHistory, setLoadingHistory] = useState(false);
  function rememberScroll(prepend = false) {
    const node = feed.current;
    if (node)
      scrollRestore.current = {
        height: node.scrollHeight,
        top: node.scrollTop,
        bottom: node.scrollHeight - node.scrollTop - node.clientHeight < 80,
        prepend,
      };
  }
  useLayoutEffect(() => {
    const snapshot = scrollRestore.current,
      node = feed.current;
    if (!snapshot || !node) return;
    scrollRestore.current = null;
    node.scrollTop = snapshot.prepend
      ? snapshot.top + node.scrollHeight - snapshot.height
      : snapshot.bottom
        ? node.scrollHeight
        : snapshot.top;
  }, [messages, visits]);
  useEffect(() => {
    initializedCursor.current = false;
    setHistoryCursor(null);
    setMessages([]);
    setVisits([]);
    setLoadingHistory(false);
    pendingMessage.current = null;
    setText("");
    setSending(false);
    pendingVisit.current = null;
  }, [id]);
  async function loadOlder() {
    if (!id || !historyCursor || loadingHistory) return;
    const conversationId = id;
    setLoadingHistory(true);
    setError("");
    try {
      const p = new URLSearchParams({ limit: "100", cursor: historyCursor });
      const r = await api<{ data: Message[]; nextCursor?: string | null }>(
        `/api/conversations/${id}/messages?${p}`,
      );
      if (currentId.current !== conversationId) return;
      rememberScroll(true);
      setMessages((current) => mergeMessageHistory(current, r.data));
      setHistoryCursor(r.nextCursor || null);
    } catch (e) {
      if (currentId.current === conversationId) setError((e as Error).message);
    } finally {
      if (currentId.current === conversationId) setLoadingHistory(false);
    }
  }

  const blocked = blockState?.blocked ?? true;
  useEffect(() => {
    setReportTarget(null);
    setBlockState(null);
    setBlockConfirm(false);
    setBlockNotice("");
  }, [id]);
  async function changeBlock() {
    if (!id || !blockState) return;
    const removing = blockState.blockedByMe;
    setBlockBusy(true);
    setError("");
    try {
      const result = await api<{
        data: { blocked: boolean; blockedByMe: boolean };
      }>(`/api/conversations/${id}/block`, {
        method: removing ? "DELETE" : "PUT",
      });
      setBlockState(result.data);
      setBlockConfirm(false);
      setShowVisit(false);
      const list = await api<{ data: Conversation[] }>("/api/conversations");
      setConversations(list.data);
      setBlockNotice(
        removing
          ? result.data.blocked
            ? "Votre blocage a été retiré. L’autre participant maintient le sien : les échanges restent désactivés."
            : "Votre blocage a été retiré. Les échanges peuvent reprendre."
          : "Interlocuteur bloqué. Les nouveaux messages et visites sont désactivés dans les deux sens.",
      );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBlockBusy(false);
    }
  }
  useEffect(() => {
    setTimezone(Intl.DateTimeFormat().resolvedOptions().timeZone);
    Promise.all([
      api<{ data: Conversation[] }>("/api/conversations"),
      api<{ data: Listing[] }>("/api/me/listings"),
    ])
      .then(([a, b]) => {
        setConversations(a.data);
        setOwnListings(b.data.map((x) => x.id));
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);
  const load = useCallback(async () => {
    if (!id) return;
    const conversationId = id;
    const [m, v, b] = await Promise.all([
      api<{ data: Message[]; nextCursor?: string | null }>(
        `/api/conversations/${id}/messages?limit=100`,
      ),
      api<{ data: Visit[] }>(`/api/conversations/${id}/visits`),
      api<{ data: { blocked: boolean; blockedByMe: boolean } }>(
        `/api/conversations/${id}/block`,
      ),
    ]);
    if (currentId.current !== conversationId) return;
    rememberScroll();
    setMessages((current) => mergeMessageHistory(current, m.data));
    if (!initializedCursor.current) {
      initializedCursor.current = true;
      setHistoryCursor(m.nextCursor || null);
    }
    setVisits(v.data);
    setBlockState(b.data);
  }, [id]);
  useEffect(() => {
    if (!id) return;
    load().catch((e) => setError(e.message));
    const t = setInterval(() => {
      if (!document.hidden) load().catch(() => {});
    }, 10000);
    return () => clearInterval(t);
  }, [id, load]);
  async function send(e: FormEvent) {
    e.preventDefault();
    if (!id || !text.trim() || blocked || sending) return;
    setSending(true);
    setError("");
    const draft = messageRequestDraft(pendingMessage.current, id, text);
    const completion = sendScope.begin(id);
    pendingMessage.current = draft;
    try {
      await api(`/api/conversations/${id}/messages`, {
        method: "POST",
        body: JSON.stringify({
          body: draft.body,
          clientRequestId: draft.clientRequestId,
        }),
      });
      if (
        !completion.apply(() => {
          setText((current) =>
            composerAfterAcknowledgement(current, draft.body),
          );
          if (pendingMessage.current === draft) pendingMessage.current = null;
        })
      )
        return;
      await load();
    } catch (e) {
      completion.apply(() => setError((e as Error).message));
    } finally {
      completion.apply(() => setSending(false));
    }
  }
  async function requestVisit(e: FormEvent) {
    e.preventDefault();
    if (!id || blocked || busyVisit === "new") return;
    setBusyVisit("new");
    setError("");
    try {
      const draft = visitRequestDraft(
        pendingVisit.current,
        id,
        proposed ? new Date(proposed).toISOString() : null,
      );
      pendingVisit.current = draft;
      await api(`/api/conversations/${id}/visits`, {
        method: "POST",
        body: JSON.stringify({
          proposedAt: draft.proposedAt,
          clientRequestId: draft.clientRequestId,
        }),
      });
      if (pendingVisit.current === draft) pendingVisit.current = null;
      if (currentId.current !== id) return;
      setShowVisit(false);
      setProposed("");
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusyVisit("");
    }
  }
  async function decision(v: Visit, action: string) {
    if (blocked && action !== "cancel") return;
    setBusyVisit(v.id);
    setError("");
    try {
      await api(`/api/visits/${v.id}/decision`, {
        method: "POST",
        body: JSON.stringify({
          action,
          version: v.version,
          confirmedAt:
            action === "accept" && confirmed[v.id]
              ? new Date(confirmed[v.id]).toISOString()
              : null,
        }),
      });
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusyVisit("");
    }
  }
  const selected = conversations.find((c) => c.id === id),
    isSeller = selected ? ownListings.includes(selected.listingId) : false;
  return (
    <AccountShell user={user} title="Mes messages">
      <p className="muted account-lead">
        Des échanges privés, liés au bon parking.
      </p>
      {error ? (
        <p className="error" role="alert">
          {error}
        </p>
      ) : null}
      {loading ? (
        <p role="status">Chargement des conversations…</p>
      ) : conversations.length || id ? (
        <div className={`account-inbox ${id ? "has-selection" : ""}`}>
          <aside className="account-threads" aria-label="Conversations">
            {conversations.map((c) => (
              <Link
                key={c.id}
                href={`/compte/messages/${c.id}`}
                className={c.id === id ? "active" : ""}
              >
                <span className="account-avatar">
                  {c.otherName.slice(0, 1).toUpperCase()}
                </span>
                <div>
                  <strong>{c.otherName}</strong>
                  <span>{c.listingTitle}</span>
                  <small>
                    {new Date(c.updatedAt).toLocaleDateString("fr-FR")}
                    {c.blocked ? " · échanges bloqués" : ""}
                  </small>
                </div>
              </Link>
            ))}
          </aside>
          {id ? (
            <section className="account-conversation">
              <header>
                <Link
                  className="account-thread-back"
                  href="/compte/messages"
                  aria-label="Retour aux conversations"
                >
                  Retour
                </Link>
                <div>
                  <strong>
                    {selected?.otherName || "Conversation privée"}
                  </strong>
                  <span>{selected?.listingTitle || "Annonce"}</span>
                </div>
                {selected ? (
                  <Link href={`/annonces/${selected.listingId}/parking`}>
                    Voir l’annonce
                  </Link>
                ) : null}
              </header>
              <button
                className="account-link-button"
                onClick={() => setReportTarget({ type: "conversation", id })}
              >
                Signaler cette conversation
              </button>
              {reportTarget ? (
                <ContextReportForm
                  key={`${reportTarget.type}-${reportTarget.id}`}
                  targetType={reportTarget.type}
                  targetId={reportTarget.id}
                  onClose={() => setReportTarget(null)}
                />
              ) : null}
              <section
                className="account-block-controls"
                aria-label="Gestion de l’interlocuteur"
              >
                {blockState ? (
                  <>
                    {blockState.blocked ? (
                      <p className="notice">
                        {blockState.blockedByMe
                          ? "Vous avez bloqué cet interlocuteur."
                          : "Les échanges sont bloqués par l’autre participant."}{" "}
                        Aucun nouveau message ou rendez-vous ne peut être
                        envoyé. L’historique et l’annulation des visites restent
                        accessibles.
                      </p>
                    ) : null}
                    {blockNotice ? (
                      <p className="notice" role="status">
                        {blockNotice}
                      </p>
                    ) : null}
                    {blockConfirm ? (
                      <div className="notice">
                        <p>
                          {blockState.blockedByMe
                            ? "Retirer votre blocage ? Les échanges reprendront seulement si l’autre participant ne vous bloque pas."
                            : "Bloquer cet interlocuteur ? Les nouveaux messages et visites seront désactivés dans les deux sens. Vous pourrez retirer votre blocage ici ; les échanges passés resteront consultables."}
                        </p>
                        <div className="account-visit-actions">
                          <button
                            className="button button-secondary"
                            disabled={blockBusy}
                            onClick={() => void changeBlock()}
                          >
                            {blockBusy
                              ? "Mise à jour…"
                              : blockState.blockedByMe
                                ? "Confirmer le déblocage"
                                : "Confirmer le blocage"}
                          </button>
                          <button
                            className="button button-secondary"
                            disabled={blockBusy}
                            onClick={() => setBlockConfirm(false)}
                          >
                            Annuler
                          </button>
                        </div>
                      </div>
                    ) : (
                      <button
                        className="account-link-button"
                        disabled={blockBusy}
                        onClick={() => setBlockConfirm(true)}
                      >
                        {blockState.blockedByMe
                          ? "Débloquer cet interlocuteur"
                          : "Bloquer cet interlocuteur"}
                      </button>
                    )}
                  </>
                ) : (
                  <p className="muted" role="status">
                    Vérification des autorisations d’échange…
                  </p>
                )}
              </section>
              <div
                className="account-chat-feed"
                ref={feed}
                aria-label="Messages de la conversation"
                aria-live="polite"
              >
                {historyCursor ? (
                  <button
                    className="button button-secondary"
                    disabled={loadingHistory}
                    onClick={() => void loadOlder()}
                  >
                    {loadingHistory
                      ? "Chargement de l’historique…"
                      : "Afficher les messages précédents"}
                  </button>
                ) : null}
                {messages.length ? (
                  messages.map((m) => (
                    <article
                      key={m.id}
                      className={`account-message ${m.senderId === user.id ? "own" : ""}`}
                    >
                      <span>
                        {m.senderId === user.id
                          ? "Vous"
                          : selected?.otherName || "Membre"}
                      </span>
                      <p>{m.body}</p>
                      <time dateTime={m.createdAt}>
                        {formatDate(m.createdAt)}
                      </time>
                      <button
                        className="account-link-button"
                        onClick={() =>
                          setReportTarget({ type: "message", id: m.id })
                        }
                      >
                        Signaler ce message
                      </button>
                    </article>
                  ))
                ) : (
                  <div className="account-chat-intro">
                    <Mail size={28} />
                    <p>La conversation commence ici.</p>
                    <span>
                      Posez vos questions sur le parking ou organisez une
                      visite.
                    </span>
                  </div>
                )}
                {visits.map((v) => (
                  <article
                    className={`account-visit account-visit-${v.status}`}
                    key={v.id}
                  >
                    <CalendarDays size={20} />
                    <div>
                      <strong>{visitLabels[v.status]}</strong>
                      {v.confirmedAt ? (
                        <p>
                          {formatDate(v.confirmedAt)} · {timezone}
                        </p>
                      ) : v.proposedAt ? (
                        <p>
                          Proposition : {formatDate(v.proposedAt)} · {timezone}
                        </p>
                      ) : (
                        <p>Aucun horaire convenu.</p>
                      )}
                      {v.status === "accepted" ? (
                        <p>
                          Un horaire doit encore être confirmé avec le vendeur.
                        </p>
                      ) : null}
                      {isSeller &&
                      !blocked &&
                      ["requested", "accepted"].includes(v.status) ? (
                        <>
                          <label className="field">
                            Horaire à confirmer · {timezone}
                            <input
                              className="input"
                              type="datetime-local"
                              value={confirmed[v.id] || ""}
                              onChange={(e) =>
                                setConfirmed({
                                  ...confirmed,
                                  [v.id]: e.target.value,
                                })
                              }
                            />
                          </label>
                          <div className="account-visit-actions">
                            <button
                              className="button button-primary"
                              disabled={busyVisit === v.id}
                              onClick={() => decision(v, "accept")}
                            >
                              <Check size={16} />
                              {confirmed[v.id]
                                ? "Confirmer cet horaire"
                                : "Accepter · à organiser"}
                            </button>
                            <button
                              className="button button-secondary"
                              disabled={busyVisit === v.id}
                              onClick={() => decision(v, "decline")}
                            >
                              Refuser
                            </button>
                          </div>
                        </>
                      ) : null}
                      {["requested", "accepted", "confirmed"].includes(
                        v.status,
                      ) ? (
                        <button
                          className="account-link-button"
                          disabled={busyVisit === v.id}
                          onClick={() => decision(v, "cancel")}
                        >
                          Annuler la demande
                        </button>
                      ) : null}
                    </div>
                  </article>
                ))}
              </div>
              {!isSeller && !blocked ? (
                <div className="account-visit-request">
                  {showVisit ? (
                    <form onSubmit={requestVisit}>
                      <label className="field">
                        Proposer un horaire · {timezone}
                        <input
                          className="input"
                          type="datetime-local"
                          value={proposed}
                          onChange={(e) => setProposed(e.target.value)}
                        />
                      </label>
                      <p className="muted">
                        Facultatif. La visite n’est confirmée qu’après l’accord
                        du vendeur sur un horaire.
                      </p>
                      <div className="account-visit-actions">
                        <button
                          className="button button-primary"
                          disabled={busyVisit === "new"}
                        >
                          Envoyer la demande
                        </button>
                        <button
                          type="button"
                          className="button button-secondary"
                          onClick={() => setShowVisit(false)}
                        >
                          <X size={16} />
                          Fermer
                        </button>
                      </div>
                    </form>
                  ) : (
                    <button
                      className="button button-secondary"
                      onClick={() => setShowVisit(true)}
                      disabled={!user.emailVerified || blocked}
                    >
                      <CalendarDays size={18} />
                      Proposer une visite
                    </button>
                  )}
                </div>
              ) : null}
              <form onSubmit={send} className="account-compose">
                <label className="sr-only" htmlFor="message-body">
                  Votre message
                </label>
                <textarea
                  id="message-body"
                  rows={2}
                  required
                  maxLength={4000}
                  minLength={1}
                  placeholder="Votre message…"
                  value={text}
                  disabled={!user.emailVerified || blocked}
                  onChange={(e) => setText(e.target.value)}
                />
                <button
                  className="button button-primary"
                  disabled={
                    sending || !text.trim() || !user.emailVerified || blocked
                  }
                  aria-label="Envoyer le message"
                >
                  {sending ? "Envoi…" : <Send size={20} />}
                </button>
              </form>
            </section>
          ) : (
            <section className="account-conversation-empty">
              <Mail size={40} />
              <h2>Choisissez une conversation.</h2>
              <p>Vos échanges privés s’affichent ici.</p>
            </section>
          )}
        </div>
      ) : (
        <div className="empty-state account-empty">
          <Mail size={36} />
          <h2>Votre prochain échange commence avec une place.</h2>
          <p>
            Contactez un vendeur depuis une annonce pour poser vos questions.
          </p>
          <Link className="button button-primary" href="/explorer">
            Explorer les parkings
          </Link>
        </div>
      )}
    </AccountShell>
  );
}
export default function Messages({ id }: { id?: string }) {
  return <AccountGate>{(u) => <Content user={u} id={id} />}</AccountGate>;
}
