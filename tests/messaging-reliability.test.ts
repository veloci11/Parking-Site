import { afterEach, beforeEach, test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { handleApi } from "../src/server/api";
import { db, resetDbForTests } from "../src/server/db";
import { mailOptions } from "../src/server/mail";
import {
  messageRequestDraft,
  composerAfterAcknowledgement,
  createConversationSendScope,
} from "../src/components/account/message-request-draft";
import {
  visitRequestDraft,
  type VisitRequestDraft,
} from "../src/components/account/visit-request-draft";

const origin = "http://127.0.0.1:3000";
const listings = [
  "10000000-0000-4000-8000-000000000001",
  "10000000-0000-4000-8000-000000000002",
];
let folder: string;
beforeEach(() => {
  resetDbForTests();
  folder = mkdtempSync(join(tmpdir(), "gp-messaging-review-"));
  process.env.GP_DATABASE_PATH = join(folder, "test.sqlite");
  process.env.GP_MEDIA_PATH = join(folder, "media");
  process.env.GP_LOCAL_DEMO = "true";
  process.env.GP_FORCE_LOCAL_DEMO = "true";
});
afterEach(() => {
  resetDbForTests();
  rmSync(folder, { recursive: true, force: true });
});
async function api(
  path: string,
  method = "GET",
  data?: unknown,
  cookie?: string,
) {
  const response = await handleApi(
    new Request(`${origin}/api/${path}`, {
      method,
      headers: {
        origin,
        ...(cookie ? { cookie } : {}),
        ...(data ? { "Content-Type": "application/json" } : {}),
      },
      body: data ? JSON.stringify(data) : undefined,
    }),
  );
  return {
    status: response.status,
    body: await response.json(),
    cookie: response.headers.get("set-cookie")?.split(";")[0],
  };
}
async function persona(name: string) {
  return (await api("auth/demo", "POST", { persona: name })).cookie!;
}
async function conversation(cookie: string, listingId = listings[0]) {
  const result = await api("conversations", "POST", { listingId }, cookie);
  assert.equal(result.status, 201);
  return result.body.data.id as string;
}
function count(table: "messages" | "visits" | "outbox" | "message_reads") {
  return Number(db().prepare(`SELECT COUNT(*) AS n FROM ${table}`).get()?.n);
}

test("message retry retains its key, while an edited body or conversation creates a new request", () => {
  let serial = 0;
  const id = () => `request-${++serial}`;
  const first = messageRequestDraft(null, "a", " Bonjour ", id);
  assert.equal(messageRequestDraft(first, "a", "Bonjour", id), first);
  const edited = messageRequestDraft(first, "a", "Bonjour, place 18 ?", id);
  assert.notEqual(edited.clientRequestId, first.clientRequestId);
  assert.notEqual(
    messageRequestDraft(edited, "b", edited.body, id).clientRequestId,
    edited.clientRequestId,
  );
  assert.equal(composerAfterAcknowledgement(" Bonjour ", first.body), "");
  assert.equal(
    composerAfterAcknowledgement("Nouvelle question", first.body),
    "Nouvelle question",
  );
});

test("lost message response then edited content sends both intentions, unchanged retry sends only once", async () => {
  const buyer = await persona("buyer");
  const id = await conversation(buyer);
  const first = messageRequestDraft(
    null,
    id,
    "La place 18 est-elle disponible ?",
  );
  const accepted = await api(
    `conversations/${id}/messages`,
    "POST",
    first,
    buyer,
  );
  const retried = await api(
    `conversations/${id}/messages`,
    "POST",
    messageRequestDraft(first, id, first.body),
    buyer,
  );
  assert.equal(accepted.status, 201);
  assert.equal(retried.body.data.id, accepted.body.data.id);
  assert.equal(count("messages"), 1);
  const edited = messageRequestDraft(first, id, "Je peux venir samedi matin.");
  const changed = await api(
    `conversations/${id}/messages`,
    "POST",
    edited,
    buyer,
  );
  assert.equal(changed.status, 201);
  assert.equal(changed.body.data.body, edited.body);
  assert.equal(count("messages"), 2);
});

test("a delayed send success or failure cannot alter the composer after A → B → A", async () => {
  for (const failed of [false, true]) {
    const scope = createConversationSendScope();
    scope.select("a");
    const oldSend = scope.begin("a");
    let settle!: () => void;
    const response = new Promise<void>((resolve, reject) => {
      settle = () => (failed ? reject(new Error("Ancien envoi")) : resolve());
    });
    const composer = {
      text: "Texte de la nouvelle visite de A",
      error: "",
      sending: true,
    };
    const handled = response
      .then(
        () =>
          oldSend.apply(() => {
            composer.text = "";
          }),
        (error) =>
          oldSend.apply(() => {
            composer.error = error.message;
          }),
      )
      .finally(() => {
        oldSend.apply(() => {
          composer.sending = false;
        });
      });
    scope.select("b");
    scope.select("a");
    const newSend = scope.begin("a");
    settle();
    await handled;
    assert.deepEqual(composer, {
      text: "Texte de la nouvelle visite de A",
      error: "",
      sending: true,
    });
    assert.equal(
      newSend.apply(() => {
        composer.sending = false;
      }),
      true,
    );
    assert.equal(composer.sending, false);
    scope.select(undefined);
    assert.equal(
      newSend.apply(() => {
        composer.error = "late";
      }),
      false,
    );
  }
});

test("clé de visite conservée après réponse perdue, renouvelée pour un nouveau créneau ou échange", () => {
  let serial = 0;
  const id = () => `request-${++serial}`;
  const first = visitRequestDraft(null, "conversation-a", null, id);
  assert.equal(visitRequestDraft(first, "conversation-a", null, id), first);
  const changedSlot = visitRequestDraft(
    first,
    "conversation-a",
    "2030-01-02T12:00:00.000Z",
    id,
  );
  assert.notEqual(changedSlot.clientRequestId, first.clientRequestId);
  const changedConversation = visitRequestDraft(
    changedSlot,
    "conversation-b",
    changedSlot.proposedAt,
    id,
  );
  assert.notEqual(
    changedConversation.clientRequestId,
    changedSlot.clientRequestId,
  );
  assert.notEqual(
    visitRequestDraft(null, "conversation-a", null, id).clientRequestId,
    first.clientRequestId,
  );
});

test("reprise de visite après réponse perdue produit une seule visite et une seule notification", async () => {
  const buyer = await persona("buyer");
  const id = await conversation(buyer);
  let pending: VisitRequestDraft | null = null;
  async function submit() {
    pending = visitRequestDraft(pending, id, null);
    return api(`conversations/${id}/visits`, "POST", pending, buyer);
  }
  const first = await submit();
  // The first response is not acknowledged by the UI, as with a network failure.
  const retried = await submit();
  assert.equal(first.status, 201);
  assert.equal(retried.status, 200);
  assert.equal(retried.body.data.id, first.body.data.id);
  assert.equal(count("visits"), 1);
  assert.equal(
    Number(
      db().prepare("SELECT COUNT(*) AS n FROM outbox WHERE type='visit'").get()
        ?.n,
    ),
    1,
  );
});

test("un tiers, même modérateur, ne lit ni ne modifie les messages, visites et lectures", async () => {
  const buyer = await persona("buyer"),
    outsider = await persona("moderator"),
    seller = await persona("seller");
  const id = await conversation(buyer);
  await api(
    `conversations/${id}/messages`,
    "POST",
    { body: "Contenu confidentiel de test", clientRequestId: randomUUID() },
    buyer,
  );
  const visit = await api(
    `conversations/${id}/visits`,
    "POST",
    { clientRequestId: randomUUID() },
    buyer,
  );
  const before = { messages: count("messages"), outbox: count("outbox") };
  for (const resource of ["messages", "visits"]) {
    assert.equal(
      (await api(`conversations/${id}/${resource}`, "GET", undefined, outsider))
        .status,
      404,
    );
    assert.equal(
      (
        await api(
          `conversations/${id}/${resource}`,
          "POST",
          { body: "Intrusion refusée", clientRequestId: randomUUID() },
          outsider,
        )
      ).status,
      404,
    );
  }
  assert.equal(
    (
      await api(
        `visits/${visit.body.data.id}/decision`,
        "POST",
        { action: "cancel", version: 1 },
        outsider,
      )
    ).status,
    404,
  );
  assert.equal(count("message_reads"), 0);
  assert.equal(count("messages"), before.messages);
  assert.equal(count("outbox"), before.outbox);
  const inbox = await api("notifications", "GET", undefined, seller);
  assert.equal(inbox.body.unread, 3);
  assert.equal(
    (
      await api(
        "notifications/read",
        "POST",
        { ids: inbox.body.data.map((n: { id: string }) => n.id) },
        outsider,
      )
    ).body.data.updated,
    0,
  );
  assert.equal(
    (await api("notifications", "GET", undefined, outsider)).body.data.length,
    0,
  );
  const mail = mailOptions(
    {
      ...inbox.body.data.find((n: { type: string }) => n.type === "message"),
      recipient: "test@demo.invalid",
    },
    origin,
  );
  assert.ok(!mail.text.includes("Contenu confidentiel de test"));
  assert.ok(mail.text.includes(`/compte/messages/${id}`));
});

test("clés idempotentes isolées par auteur et refusées sur un autre échange", async () => {
  const buyer = await persona("buyer"),
    seller = await persona("seller");
  const first = await conversation(buyer),
    second = await conversation(buyer, listings[1]);
  const payload = { body: "Message de test", clientRequestId: randomUUID() };
  const sent = await api(
    `conversations/${first}/messages`,
    "POST",
    payload,
    buyer,
  );
  const replay = await api(
    `conversations/${first}/messages`,
    "POST",
    payload,
    buyer,
  );
  assert.equal(replay.body.data.id, sent.body.data.id);
  assert.equal(
    (await api(`conversations/${second}/messages`, "POST", payload, buyer))
      .status,
    409,
  );
  assert.equal(
    (await api(`conversations/${first}/messages`, "POST", payload, seller))
      .status,
    201,
  );
  assert.equal(count("messages"), 2);
  const request = { clientRequestId: randomUUID() };
  assert.equal(
    (await api(`conversations/${first}/visits`, "POST", request, buyer)).status,
    201,
  );
  assert.equal(
    (await api(`conversations/${second}/visits`, "POST", request, buyer))
      .status,
    409,
  );
  assert.equal(count("visits"), 1);
});

test("décisions de visite versionnées, clôture définitive et annulation permise malgré blocage", async () => {
  const buyer = await persona("buyer"),
    seller = await persona("seller");
  const id = await conversation(buyer);
  const created = await api(
    `conversations/${id}/visits`,
    "POST",
    { clientRequestId: randomUUID() },
    buyer,
  );
  const path = `visits/${created.body.data.id}/decision`;
  assert.equal(
    (await api(path, "POST", { action: "accept", version: 1 }, buyer)).status,
    403,
  );
  const accepted = await api(
    path,
    "POST",
    { action: "accept", version: 1 },
    seller,
  );
  assert.equal(accepted.body.data.status, "accepted");
  assert.equal(accepted.body.data.version, 2);
  const outbox = count("outbox");
  assert.equal(
    (await api(path, "POST", { action: "accept", version: 1 }, seller)).status,
    409,
  );
  assert.equal(count("outbox"), outbox);
  const confirmed = await api(
    path,
    "POST",
    { action: "accept", version: 2, confirmedAt: "2030-01-02T12:00:00.000Z" },
    seller,
  );
  assert.equal(confirmed.body.data.status, "confirmed");
  assert.equal(confirmed.body.data.version, 3);
  await api(`conversations/${id}/block`, "PUT", undefined, seller);
  const blockedCount = count("outbox");
  assert.equal(
    (
      await api(
        `conversations/${id}/messages`,
        "POST",
        { body: "Nouveau message bloqué", clientRequestId: randomUUID() },
        buyer,
      )
    ).status,
    409,
  );
  assert.equal(
    (
      await api(
        `conversations/${id}/visits`,
        "POST",
        { clientRequestId: randomUUID() },
        buyer,
      )
    ).status,
    409,
  );
  assert.equal(count("outbox"), blockedCount);
  assert.equal(
    (await api(`conversations/${id}/visits`, "GET", undefined, buyer)).status,
    200,
  );
  const cancelled = await api(
    path,
    "POST",
    { action: "cancel", version: 3 },
    buyer,
  );
  assert.equal(cancelled.body.data.status, "cancelled");
  assert.equal(cancelled.body.data.version, 4);
  assert.equal(
    (await api(path, "POST", { action: "cancel", version: 4 }, seller)).status,
    409,
  );
  assert.equal(count("outbox"), blockedCount + 1);
});
