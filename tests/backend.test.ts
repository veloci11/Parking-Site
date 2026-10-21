import { test, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { handleApi } from "../src/server/api";
import { db, resetDbForTests } from "../src/server/db";
const dir = mkdtempSync(join(tmpdir(), "gp-backend-"));
process.env.GP_DATABASE_PATH = join(dir, "test.sqlite");
process.env.GP_MEDIA_PATH = join(dir, "media");
process.env.GP_LOCAL_DEMO = "true";
const origin = "http://127.0.0.1:3000";
async function api(
  path: string,
  method = "GET",
  data?: unknown,
  cookie?: string,
  extra: Record<string, string> = {},
) {
  const headers: Record<string, string> = {
    origin,
    ...extra,
    ...(cookie ? { cookie } : {}),
    ...(data ? { "Content-Type": "application/json" } : {}),
  };
  const response = await handleApi(
    new Request(`${origin}/api/${path}`, {
      method,
      headers,
      body: data ? JSON.stringify(data) : undefined,
    }),
  );
  const result = await response.json();
  return {
    response,
    result,
    cookie: response.headers.get("set-cookie")?.split(";")[0],
  };
}
async function persona(name: "buyer" | "seller" | "moderator") {
  const a = await api("auth/demo", "POST", { persona: name });
  assert.equal(a.response.status, 200);
  return a.cookie!;
}
const makeDraft = (version: number) => ({
  version,
  title: "Place de test complète",
  description:
    "Une description complète et suffisante pour valider la publication. La place est présentée avec ses accès, ses dimensions et son état connu.",
  city: "Lyon",
  district: "Part-Dieu",
  priceCents: 1850000,
  type: "covered",
  spaces: [
    {
      id: randomUUID(),
      number: "12",
      level: -1,
      areaM2: 12,
      lengthM: 5,
      widthM: 2.4,
      clearanceM: 2.1,
    },
  ],
  photos: ["/demo/covered.png", "/demo/box.png", "/demo/outdoor.png"],
  locationPrecision: "area",
  coordinates: [4.8597, 45.7612],
  address: "Rue privée à masquer",
});
after(() => {
  resetDbForTests();
  rmSync(dir, { recursive: true, force: true });
});
test("catalogue public assaini, filtre de lot par chaque surface, prix total", async () => {
  const a = await api("listings");
  assert.equal(a.response.status, 200);
  assert.equal(a.result.data.length, 6);
  assert.ok(
    a.result.data.every((l: any) => !("sellerId" in l) && !("email" in l)),
  );
  const area = a.result.data.find((l: any) => l.district === "Montchat");
  assert.equal(area.address, undefined);
  assert.equal(area.sceneAvailable, false);
  assert.deepEqual(area.coordinates, [4.89, 45.75]);
  const filtered = await api("listings?areaMin=13&priceMax=2500000");
  assert.deepEqual(
    filtered.result.data.map((l: any) => l.district),
    ["Montchat"],
  );
});
test("inscription, mailbox privée, vérification et session hashée", async () => {
  const a = await api("auth/register", "POST", {
    name: "Utilisateur A",
    email: "a@test.invalid",
    password: "long password 12345",
  });
  assert.equal(a.response.status, 201);
  assert.equal(a.result.data.emailVerified, false);
  assert.ok(a.response.headers.get("set-cookie")?.includes("HttpOnly"));
  const publicBox = await api("local-mailbox");
  assert.equal(publicBox.response.status, 401);
  const mine = await api("local-mailbox", "GET", undefined, undefined, {
    "x-mailbox-receipt": a.result.mailboxReceipt,
  });
  assert.equal(mine.result.data.length, 1);
  const rawToken = a.cookie!.split("=")[1];
  assert.equal(
    db().prepare("SELECT * FROM sessions WHERE token_hash=?").get(rawToken),
    undefined,
  );
  const verified = await api("auth/verify", "POST", {
    token: mine.result.data[0].token,
  });
  assert.equal(verified.response.status, 200);
  const again = await api("auth/verify", "POST", {
    token: mine.result.data[0].token,
  });
  assert.equal(again.response.status, 400);
  const session = await api("session", "GET", undefined, a.cookie);
  assert.equal(session.result.data.emailVerified, true);
});
test("CSRF, escalade de rôle et requêtes non locales rejetées", async () => {
  const req = new Request(`${origin}/api/auth/demo`, {
    method: "POST",
    headers: {
      origin: "https://evil.test",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ persona: "moderator" }),
  });
  assert.equal((await handleApi(req)).status, 403);
  assert.equal(
    (await handleApi(new Request("http://public.test/api/listings"))).status,
    503,
  );
  const user = await persona("buyer");
  assert.equal(
    (await api("admin/revisions", "GET", undefined, user)).response.status,
    403,
  );
  assert.equal(
    (await api("me/profile", "PATCH", { name: "Admin", role: "admin" }, user))
      .response.status,
    400,
  );
});
test("brouillon privé, contrôle version, modération et révision préservant publication", async () => {
  const seller = await persona("seller"),
    buyer = await persona("buyer"),
    moderator = await persona("moderator");
  const draft = await api("listings", "POST", {}, seller);
  const id = draft.result.data.id;
  assert.equal(
    (await api(`listings/${id}?draft=1`, "GET", undefined, buyer)).response
      .status,
    404,
  );
  assert.equal((await api(`listings/${id}`)).response.status, 404);
  const edited = await api(`listings/${id}`, "PATCH", makeDraft(1), seller);
  assert.equal(edited.response.status, 200);
  assert.equal(
    (
      await api(
        `listings/${id}`,
        "PATCH",
        { version: 1, title: "stale" },
        seller,
      )
    ).response.status,
    409,
  );
  const submitted = await api(
    `listings/${id}/submit`,
    "POST",
    { version: 2, ownershipAttested: true },
    seller,
  );
  assert.equal(submitted.result.data.status, "pending");
  assert.equal((await api(`listings/${id}`)).response.status, 404);
  assert.equal(
    (
      await api(
        `admin/revisions/${id}/decision`,
        "POST",
        { version: 3, decision: "approve" },
        buyer,
      )
    ).response.status,
    403,
  );
  const approved = await api(
    `admin/revisions/${id}/decision`,
    "POST",
    { version: 3, decision: "approve" },
    moderator,
  );
  assert.equal(approved.response.status, 200);
  const published = await api(`listings/${id}`);
  assert.equal(published.result.data.address, undefined);
  assert.equal(published.result.data.sceneAvailable, false);
  const update = await api(
    `listings/${id}`,
    "PATCH",
    { version: 4, priceCents: 2000000 },
    seller,
  );
  assert.equal(update.result.data.version, 5);
  assert.equal((await api(`listings/${id}`)).result.data.priceCents, 1850000);
  await api(
    `listings/${id}/submit`,
    "POST",
    { version: 5, ownershipAttested: true },
    seller,
  );
  await api(
    `admin/revisions/${id}/decision`,
    "POST",
    { version: 6, decision: "reject", reason: "Photo à revoir" },
    moderator,
  );
  assert.equal((await api(`listings/${id}`)).result.data.priceCents, 1850000);
});
test("conversation privée, message idempotent et visite versionnée vendeur", async () => {
  const buyer = await persona("buyer"),
    seller = await persona("seller"),
    moderator = await persona("moderator");
  const listingId = "10000000-0000-4000-8000-000000000001";
  const c = await api("conversations", "POST", { listingId }, buyer);
  assert.equal(c.response.status, 201);
  const id = c.result.data.id;
  assert.equal(
    (await api(`conversations/${id}/messages`, "GET", undefined, moderator))
      .response.status,
    404,
  );
  const payload = {
    body: "Bonjour, je souhaite visiter.",
    clientRequestId: randomUUID(),
  };
  const first = await api(
      `conversations/${id}/messages`,
      "POST",
      payload,
      buyer,
    ),
    duplicate = await api(
      `conversations/${id}/messages`,
      "POST",
      payload,
      buyer,
    );
  assert.equal(first.result.data.id, duplicate.result.data.id);
  assert.equal(
    (await api(`conversations/${id}/messages`, "GET", undefined, seller)).result
      .data.length,
    1,
  );
  const v = await api(
    `conversations/${id}/visits`,
    "POST",
    { clientRequestId: randomUUID() },
    buyer,
  );
  assert.equal(v.result.data.status, "requested");
  assert.equal(
    (
      await api(
        `visits/${v.result.data.id}/decision`,
        "POST",
        { version: 1, action: "accept" },
        buyer,
      )
    ).response.status,
    403,
  );
  const accepted = await api(
    `visits/${v.result.data.id}/decision`,
    "POST",
    { version: 1, action: "accept" },
    seller,
  );
  assert.equal(accepted.result.data.status, "accepted");
  assert.equal(accepted.result.data.confirmedAt, null);
  assert.equal(
    (
      await api(
        `visits/${v.result.data.id}/decision`,
        "POST",
        { version: 1, action: "accept" },
        seller,
      )
    ).response.status,
    409,
  );
});
test("retrait immédiat et historique conversation conservé", async () => {
  const buyer = await persona("buyer"),
    seller = await persona("seller");
  const id = "10000000-0000-4000-8000-000000000001";
  const c = await api("conversations", "POST", { listingId: id }, buyer);
  const closed = await api(
    `listings/${id}/lifecycle`,
    "POST",
    { action: "sold", version: 1 },
    seller,
  );
  assert.equal(closed.response.status, 200);
  assert.equal((await api(`listings/${id}`)).response.status, 404);
  assert.equal(
    (await api("conversations", "POST", { listingId: id }, buyer)).response
      .status,
    409,
  );
  assert.equal(
    (
      await api(
        `conversations/${c.result.data.id}/messages`,
        "GET",
        undefined,
        buyer,
      )
    ).response.status,
    200,
  );
});
