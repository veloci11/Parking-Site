/**
 * Black-box HTTP acceptance flow. Opt-in against the LOCAL demonstration only:
 * GP_ACCOUNT_TEST_URL=http://127.0.0.1:3000 npm test
 * Creates distinct @test.invalid accounts and withdraws their test inventory.
 * Does not send external emails or interact with Supabase/production accounts.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import sharp from "sharp";
const base = process.env.GP_ACCOUNT_TEST_URL;
class Client {
  cookie = "";
  async request(path: string, method = "GET", body?: unknown) {
    const multipart = body instanceof FormData;
    const response = await fetch(`${base}/api/${path}`, {
      method,
      headers: {
        Origin: base!,
        ...(this.cookie ? { Cookie: this.cookie } : {}),
        ...(body && !multipart ? { "Content-Type": "application/json" } : {}),
      },
      body: body ? (multipart ? body : JSON.stringify(body)) : undefined,
      redirect: "manual",
    });
    const setCookie = response.headers.get("set-cookie");
    if (setCookie) this.cookie = setCookie.split(";")[0];
    const json = await response.json().catch(() => null);
    return {
      status: response.status,
      data: json?.data,
      error: json?.error,
      code: json?.code,
      raw: json,
      response,
    };
  }
}
test(
  "HTTP account journey: registration to moderated publication, private media, buyer contact and versioned visit",
  { skip: !base },
  async (t) => {
    assert.ok(
      /^http:\/\/(127\.0\.0\.1|localhost):\d+$/.test(base!),
      "Refusing a non-loopback test destination",
    );
    const guest = new Client();
    const mode = await guest.request("session");
    assert.equal(
      mode.raw.mode,
      "demo",
      "This flow is restricted to the isolated local demonstration",
    );
    const seller = new Client(),
      buyer = new Client(),
      moderator = new Client();
    const suffix = randomUUID(),
      password = "Acceptance Test Password 2026!",
      sellerEmail = `seller-${suffix}@test.invalid`,
      buyerEmail = `buyer-${suffix}@test.invalid`;
    const register = async (client: Client, email: string, name: string) => {
      const result = await client.request("auth/register", "POST", {
        name,
        email,
        password,
      });
      assert.equal(result.status, 201, result.error);
      const mailbox = await client.request("local-mailbox");
      assert.equal(mailbox.status, 200, mailbox.error);
      const own = mailbox.data.find(
        (m: { type: string }) => m.type === "verify",
      );
      assert.ok(own?.token);
      assert.equal(
        (await client.request("auth/verify", "POST", { token: own.token }))
          .status,
        200,
      );
    };
    t.after(async () => {
      for (const client of [seller, buyer]) {
        try {
          await client.request("me/delete", "POST", {
            password,
            confirmation: "SUPPRIMER",
          });
        } catch {
          /* Report original flow failure, never delete another user's fixtures. */
        }
      }
    });
    await register(seller, sellerEmail, "Recette vendeur HTTP");
    await register(buyer, buyerEmail, "Recette acheteur HTTP");
    assert.equal(
      (await moderator.request("auth/demo", "POST", { persona: "moderator" }))
        .status,
      200,
    );
    // A fresh login must work with the cookie issued by the actual Next route handler.
    assert.equal((await seller.request("auth/logout", "POST", {})).status, 200);
    assert.equal(
      (
        await seller.request("auth/login", "POST", {
          email: sellerEmail,
          password,
        })
      ).status,
      200,
    );
    const created = await seller.request("listings", "POST", {});
    assert.equal(created.status, 201, created.error);
    const draft = created.data;
    const initialSave = await seller.request(`listings/${draft.id}`, "PATCH", {
      version: draft.version,
      type: "box",
      spaces: draft.spaces,
    });
    assert.equal(
      initialSave.status,
      200,
      "Incomplete draft must save before place references are filled: " +
        initialSave.error,
    );
    assert.equal(
      (await buyer.request(`listings/${draft.id}?draft=1`)).status,
      404,
    );
    const photoUrls: string[] = [];
    for (let i = 0; i < 3; i++) {
      const image = await sharp({
        create: {
          width: 8,
          height: 8,
          channels: 3,
          background: { r: 130 + i * 8, g: 140, b: 150 },
        },
      })
        .png()
        .toBuffer();
      const form = new FormData();
      form.set("listingId", draft.id);
      form.set(
        "file",
        new Blob([new Uint8Array(image)], { type: "image/png" }),
        `inert-fixture-${i}.png`,
      );
      const upload = await seller.request("uploads", "POST", form);
      assert.equal(upload.status, 201, upload.error);
      assert.equal(typeof upload.data.url, "string");
      photoUrls.push(upload.data.url);
      const privateMedia = await fetch(`${base}${upload.data.url}`);
      assert.equal(
        privateMedia.status,
        404,
        "Unapproved source must not be anonymous-public",
      );
    }
    const patch = {
      version: initialSave.data.version,
      title: "Parking de recette HTTP fictif",
      description:
        "Annonce fictive créée uniquement pour vérifier le parcours technique complet. Les images jointes sont des fixtures inertes et ne représentent aucun parking réel.",
      city: "Lyon",
      district: "Recette locale",
      type: "covered",
      priceCents: 3100000,
      spaces: [
        {
          id: randomUUID(),
          number: "T1",
          level: -1,
          areaM2: 12,
          lengthM: null,
          widthM: null,
          clearanceM: null,
        },
        {
          id: randomUUID(),
          number: "T2",
          level: -1,
          areaM2: null,
          lengthM: null,
          widthM: null,
          clearanceM: null,
        },
      ],
      photos: photoUrls,
      quality: {
        floor: "Non renseigné",
        lighting: "Non renseigné",
        humidity: "Non renseignée",
        access: "Non renseigné",
        maneuver: "Non renseignée",
        observations: "Fixture technique, aucune expertise.",
      },
      locationPrecision: "area",
      coordinates: [4.85321, 45.76321],
      address: "Adresse privée test",
      occupancy: "unknown",
      annualChargesCents: null,
      propertyTaxCents: null,
      observedAt: null,
    };
    const saved = await seller.request(`listings/${draft.id}`, "PATCH", patch);
    assert.equal(saved.status, 200, saved.error);
    assert.equal(saved.data.spaces[1].areaM2, null);
    assert.equal(saved.data.annualChargesCents, null);
    const conflict = await seller.request(`listings/${draft.id}`, "PATCH", {
      version: draft.version,
      title: "Saisie périmée",
    });
    assert.equal(conflict.status, 409);
    const revised = await seller.request(`listings/${draft.id}`, "PATCH", {
      version: saved.data.version,
      title: "Parking de recette HTTP · sauvegardé",
    });
    assert.equal(revised.status, 200, revised.error);
    assert.equal(
      (
        await seller.request(`listings/${draft.id}/submit`, "POST", {
          version: revised.data.version,
        })
      ).status,
      400,
      "Attestation must be enforced on server",
    );
    const submitted = await seller.request(
      `listings/${draft.id}/submit`,
      "POST",
      { version: revised.data.version, ownershipAttested: true },
    );
    assert.equal(submitted.status, 200, submitted.error);
    assert.equal(submitted.data.status, "pending");
    assert.equal((await guest.request(`listings/${draft.id}`)).status, 404);
    const queue = await moderator.request("admin/revisions");
    assert.ok(queue.data.some((l: { id: string }) => l.id === draft.id));
    const approved = await moderator.request(
      `admin/revisions/${draft.id}/decision`,
      "POST",
      { version: submitted.data.version, decision: "approve" },
    );
    assert.equal(approved.status, 200, approved.error);
    const published = await guest.request(`listings/${draft.id}`);
    assert.equal(published.status, 200, published.error);
    assert.equal(published.data.priceCents, 3100000);
    assert.equal(published.data.address, undefined);
    assert.equal(published.data.sceneAvailable, false);
    assert.equal(published.data.spaces[1].areaM2, null);
    const publicMedia = await fetch(`${base}${photoUrls[0]}`);
    assert.equal(publicMedia.status, 200);
    assert.equal(publicMedia.headers.get("content-type"), "image/webp");
    const filtered = await guest.request("listings?areaMin=1");
    assert.ok(
      !filtered.data.some((l: { id: string }) => l.id === draft.id),
      "Unknown area of one bundle unit must exclude bundle from active minimum-area filter",
    );
    const contact = await buyer.request("conversations", "POST", {
      listingId: draft.id,
    });
    assert.equal(contact.status, 201, contact.error);
    const conversationId = contact.data.id;
    const message = {
      body: "Bonjour, pouvons-nous convenir d’une visite de ce bien de test ?",
      clientRequestId: randomUUID(),
    };
    const sent = await buyer.request(
      `conversations/${conversationId}/messages`,
      "POST",
      message,
    );
    assert.equal(sent.status, 201, sent.error);
    const duplicate = await buyer.request(
      `conversations/${conversationId}/messages`,
      "POST",
      message,
    );
    assert.equal(duplicate.data.id, sent.data.id);
    const received = await seller.request(
      `conversations/${conversationId}/messages`,
    );
    assert.ok(received.data.some((m: { id: string }) => m.id === sent.data.id));
    assert.equal(
      (await moderator.request(`conversations/${conversationId}/messages`))
        .status,
      404,
    );
    const request = await buyer.request(
      `conversations/${conversationId}/visits`,
      "POST",
      { proposedAt: null, clientRequestId: randomUUID() },
    );
    assert.equal(request.status, 201, request.error);
    const accepted = await seller.request(
      `visits/${request.data.id}/decision`,
      "POST",
      { version: request.data.version, action: "accept", confirmedAt: null },
    );
    assert.equal(accepted.data.status, "accepted");
    assert.equal(accepted.data.confirmedAt, null);
    const date = new Date(Date.now() + 86400000).toISOString();
    const confirmed = await seller.request(
      `visits/${request.data.id}/decision`,
      "POST",
      { version: accepted.data.version, action: "accept", confirmedAt: date },
    );
    assert.equal(confirmed.data.status, "confirmed");
    assert.equal(confirmed.data.confirmedAt, date);
    const stale = await seller.request(
      `visits/${request.data.id}/decision`,
      "POST",
      { version: accepted.data.version, action: "cancel" },
    );
    assert.equal(stale.status, 409);
    const cancelled = await buyer.request(
      `visits/${request.data.id}/decision`,
      "POST",
      { version: confirmed.data.version, action: "cancel" },
    );
    assert.equal(cancelled.data.status, "cancelled");
    const withdrawn = await seller.request(
      `listings/${draft.id}/lifecycle`,
      "POST",
      { version: approved.data.version, action: "withdraw" },
    );
    assert.equal(withdrawn.status, 200, withdrawn.error);
    assert.equal((await guest.request(`listings/${draft.id}`)).status, 404);
    assert.equal(
      (await buyer.request(`conversations/${conversationId}/messages`)).status,
      200,
      "Participants retain their history after listing withdrawal",
    );
    assert.equal(
      (await buyer.request("conversations", "POST", { listingId: draft.id }))
        .status,
      409,
      "No new contact on withdrawn inventory",
    );
  },
);
test(
  "HTTP account documents expose exactly one primary heading and skip target",
  { skip: !base },
  async () => {
    for (const path of [
      "/connexion",
      "/inscription",
      "/deposer",
      "/compte",
      "/admin",
    ]) {
      const response = await fetch(`${base}${path}`);
      assert.equal(response.status, 200, path);
      const html = await response.text();
      assert.equal(
        (html.match(/id="main"/g) || []).length,
        1,
        `${path}: skip target must be unique`,
      );
      if (["/connexion", "/inscription", "/deposer"].includes(path))
        assert.equal(
          (html.match(/<h1[\s>]/g) || []).length,
          path === "/deposer" ? 0 : 1,
          `${path}: headings must not duplicate`,
        );
    }
  },
);
