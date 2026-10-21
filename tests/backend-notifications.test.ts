import { test, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { handleApi } from "../src/server/api";
import { resetDbForTests } from "../src/server/db";
import { boundedFormData } from "../src/server/uploads";
import {
  mailOptions,
  classifySmtpError,
  usableRecipient,
} from "../src/server/mail";
const dir = mkdtempSync(join(tmpdir(), "gp-inbox-"));
process.env.GP_DATABASE_PATH = join(dir, "test.sqlite");
process.env.GP_MEDIA_PATH = join(dir, "media");
process.env.GP_LOCAL_DEMO = "true";
process.env.GP_FORCE_LOCAL_DEMO = "true";
const origin = "http://127.0.0.1:3000";
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
    response,
    result: await response.json(),
    cookie: response.headers.get("set-cookie")?.split(";")[0],
  };
}
async function persona(persona: string) {
  const r = await api("auth/demo", "POST", { persona });
  return r.cookie!;
}
after(() => {
  resetDbForTests();
  rmSync(dir, { recursive: true, force: true });
});
test("notifications privées, lectures persistées et non-lus réels par conversation", async () => {
  const buyer = await persona("buyer"),
    seller = await persona("seller");
  const conversation = await api(
      "conversations",
      "POST",
      { listingId: "10000000-0000-4000-8000-000000000002" },
      buyer,
    ),
    id = conversation.result.data.id;
  await api(
    `conversations/${id}/messages`,
    "POST",
    { body: "Bonjour pour une visite.", clientRequestId: randomUUID() },
    buyer,
  );
  const unread = await api("conversations", "GET", undefined, seller);
  assert.equal(unread.result.data.find((c: any) => c.id === id).unread, 1);
  const inbox = await api("notifications", "GET", undefined, seller);
  assert.equal(inbox.result.unread, 2);
  const ids = inbox.result.data.map((n: any) => n.id);
  const forbiddenMark = await api("notifications/read", "POST", { ids }, buyer);
  assert.equal(forbiddenMark.result.data.updated, 0);
  assert.equal(
    (await api("notifications", "GET", undefined, buyer)).result.data.length,
    0,
  );
  await api(`conversations/${id}/messages`, "GET", undefined, seller);
  assert.equal(
    (await api("conversations", "GET", undefined, seller)).result.data.find(
      (c: any) => c.id === id,
    ).unread,
    0,
  );
  assert.equal(
    (await api("notifications", "GET", undefined, seller)).result.unread,
    0,
  );
});
test("signalements réservés à la modération et décisions versionnées", async () => {
  const buyer = await persona("buyer"),
    moderator = await persona("moderator");
  const report = await api(
    "reports",
    "POST",
    {
      listingId: "10000000-0000-4000-8000-000000000002",
      reason: "La description demande une vérification.",
    },
    buyer,
  );
  assert.equal(report.response.status, 201);
  assert.equal(
    (await api("admin/reports", "GET", undefined, buyer)).response.status,
    403,
  );
  const list = await api("admin/reports", "GET", undefined, moderator);
  const item = list.result.data.find(
    (r: any) => r.id === report.result.data.id,
  );
  assert.equal(item.status, "open");
  const decision = await api(
    `admin/reports/${item.id}/decision`,
    "POST",
    {
      status: "reviewed",
      reason: "Annonce examinée et vendeur contacté.",
      version: 1,
    },
    moderator,
  );
  assert.equal(decision.result.data.version, 2);
  assert.equal(
    (
      await api(
        `admin/reports/${item.id}/decision`,
        "POST",
        { status: "dismissed", reason: "Décision obsolète.", version: 1 },
        moderator,
      )
    ).response.status,
    409,
  );
});
test("préférences email persistées sans changer la réception in-app", async () => {
  const seller = await persona("seller");
  assert.equal(
    (await api("me/notification-settings", "GET", undefined, seller)).result
      .data.emailEnabled,
    true,
  );
  await api(
    "me/notification-settings",
    "PATCH",
    { emailEnabled: false },
    seller,
  );
  assert.equal(
    (await api("me/notification-settings", "GET", undefined, seller)).result
      .data.emailEnabled,
    false,
  );
  assert.equal(
    (await api("notifications", "GET", undefined, seller)).response.status,
    200,
  );
});
test("upload stream rejeté avant lecture complète même sans Content-Length", async () => {
  const request = new Request(`${origin}/api/uploads`, {
    method: "POST",
    headers: { "Content-Type": "multipart/form-data; boundary=a" },
    body: new Uint8Array(33),
  });
  await assert.rejects(
    boundedFormData(request, 32),
    (error) => (error as any).status === 413,
  );
});
test("email transactionnel sans contenu privé, URL bornée, Message-ID déterministe", () => {
  const value = {
    id: randomUUID(),
    recipient: "user@example.net",
    type: "message",
    title: "Un nouveau message",
    body: "Consultez votre espace GP.",
    url: "https://evil.invalid/steal",
  };
  const first = mailOptions(value, "https://parking.example"),
    second = mailOptions(value, "https://parking.example");
  assert.equal(first.messageId, second.messageId);
  assert.ok(first.text.includes("https://parking.example/compte"));
  assert.ok(!first.text.includes("evil.invalid"));
  assert.equal(first.disableFileAccess, true);
  assert.equal(first.disableUrlAccess, true);
  assert.equal(usableRecipient("member@demo.invalid"), false);
  assert.equal(usableRecipient("real@example.com"), false);
  assert.equal(usableRecipient("contact@mydomain.fr"), true);
  assert.equal(
    classifySmtpError({ command: "DATA", code: "ETIMEDOUT" }).status,
    "uncertain",
  );
  assert.equal(classifySmtpError({ responseCode: 451 }).status, "pending");
  assert.equal(classifySmtpError({ responseCode: 550 }).status, "failed");
});
test("JSON sans Content-Length borné à 128K avant parsing", async () => {
  const response = await handleApi(
    new Request(`${origin}/api/auth/register`, {
      method: "POST",
      headers: { origin, "Content-Type": "application/json" },
      body: JSON.stringify({ name: "A".repeat(132000) }),
    }),
  );
  assert.equal(response.status, 413);
});
