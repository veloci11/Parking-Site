import { emptyCommercialDetails } from "../src/lib/commercial-details";
/**
 * Black-box HTTP acceptance flow. Opt-in against the LOCAL demonstration only:
 * GP_ACCOUNT_TEST_URL=http://127.0.0.1:3000 GP_ACCOUNT_ADMIN_EMAIL=... GP_ACCOUNT_ADMIN_PASSWORD=... npm test
 * The admin must be an explicitly provisioned fixture in that isolated local database.
 * Creates distinct @test.invalid accounts and withdraws their test inventory.
 * Does not send external emails or interact with Supabase/production accounts.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import sharp from "sharp";
import {
  processLocalExport,
  purgeLocalExport,
} from "../src/server/privacy-export-local-worker";
import { EXPORT_POLICY } from "../src/server/privacy-archive";
import { db, resetDbForTests } from "../src/server/db";
const base = process.env.GP_ACCOUNT_TEST_URL;
const adminEmail = process.env.GP_ACCOUNT_ADMIN_EMAIL,
  adminPassword = process.env.GP_ACCOUNT_ADMIN_PASSWORD;
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
    const isArchive =
      response.headers.get("content-type") === "application/zip";
    const archive = isArchive
      ? Buffer.from(await response.arrayBuffer())
      : null;
    const json = isArchive ? null : await response.json().catch(() => null);
    return {
      status: response.status,
      data: json?.data,
      error: json?.error,
      code: json?.code,
      raw: json,
      response,
      archive,
    };
  }
}
test(
  "HTTP account journey: registration to moderated publication, private media, buyer contact and versioned visit",
  {
    skip: !base
      ? "Local HTTP origin not configured"
      : !adminEmail || !adminPassword
        ? "Isolated admin fixture credentials required for physical registry approval"
        : false,
  },
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
      moderator = new Client(),
      admin = new Client();
    const suffix = randomUUID(),
      password = "Acceptance Test Password 2026!",
      sellerEmail = `seller-${suffix}@test.invalid`,
      buyerEmail = `buyer-${suffix}@test.invalid`;
    const register = async (client: Client, email: string, name: string) => {
      const policy = await client.request("auth/commands/policy");
      assert.equal(policy.status, 200, policy.error);
      const result = await client.request("auth/commands/register", "POST", {
        name,
        email,
        password,
        termsAccepted: true,
        ...policy.data,
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
          await client.request("privacy/delete", "POST", {
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
    const adminLogin = await admin.request("auth/login", "POST", {
      email: adminEmail,
      password: adminPassword,
    });
    assert.equal(adminLogin.status, 200, adminLogin.error);
    assert.equal(
      adminLogin.data.role,
      "admin",
      "Refusing to elevate the moderator or a normal fixture",
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
      city: "Paris",
      commercialDetails: { ...emptyCommercialDetails(), postalCode: "75012" },
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
      coordinates: [2.3739, 48.8446],
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
    let revised = await seller.request(`listings/${draft.id}`, "PATCH", {
      version: saved.data.version,
      title: "Parking de recette HTTP · sauvegardé",
      locationConfirmedAt: new Date().toISOString(),
    });
    assert.equal(revised.status, 200, revised.error);
    const areaPreview = await seller.request(`listings/${draft.id}/preview`);
    assert.equal(areaPreview.status, 200, areaPreview.error);
    assert.equal(areaPreview.data.address, undefined);
    assert.notDeepEqual(
      areaPreview.data.coordinates,
      patch.coordinates,
      "Area preview must not expose exact source point",
    );
    const exactPreviewDraft = await seller.request(
      `listings/${draft.id}`,
      "PATCH",
      { version: revised.data.version, locationPrecision: "exact_opt_in" },
    );
    assert.equal(exactPreviewDraft.status, 200, exactPreviewDraft.error);
    const exactPreview = await seller.request(`listings/${draft.id}/preview`);
    assert.equal(exactPreview.status, 200, exactPreview.error);
    assert.deepEqual(exactPreview.data.coordinates, patch.coordinates);
    assert.equal(
      (await guest.request(`listings/${draft.id}`)).status,
      404,
      "Private preview does not publish the draft",
    );
    const restoredArea = await seller.request(`listings/${draft.id}`, "PATCH", {
      version: exactPreviewDraft.data.version,
      locationPrecision: "area",
    });
    assert.equal(restoredArea.status, 200, restoredArea.error);
    assert.equal(
      restoredArea.data.locationConfirmedAt,
      null,
      "Changing precision clears the old confirmation",
    );
    revised = await seller.request(`listings/${draft.id}`, "PATCH", {
      version: restoredArea.data.version,
      locationConfirmedAt: new Date().toISOString(),
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
    const site = await admin.request("admin/parking-registry", "POST", {
      action: "create_site",
      publicName: "Site de recette HTTP",
      internalReference: suffix,
      exactAddress: "Adresse privée de recette",
    });
    assert.equal(site.status, 200, site.error);
    assert.equal(site.data.status, "saved");
    const level = await admin.request("admin/parking-registry", "POST", {
      action: "add_level",
      siteId: site.data.id,
      code: "N-1",
      label: "Sous-sol de recette",
      number: -1,
      sortOrder: 0,
    });
    assert.equal(level.status, 200, level.error);
    const units = [];
    for (const unit of patch.spaces) {
      const physical = await admin.request("admin/parking-registry", "POST", {
        action: "add_space",
        levelId: level.data.id,
        number: unit.number,
        privateLotReference: unit.number,
        areaM2: unit.areaM2,
        lengthM: null,
        widthM: null,
        clearanceM: null,
      });
      assert.equal(physical.status, 200, physical.error);
      units.push({ unitId: unit.id, spaceId: physical.data.id });
    }
    const linked = await admin.request("admin/parking-registry", "POST", {
      action: "link_listing",
      listingId: draft.id,
      version: submitted.data.version,
      siteId: site.data.id,
      units,
      reason:
        "Rattachement des deux places à la fixture physique de recette HTTP.",
    });
    assert.equal(linked.status, 200, linked.error);
    assert.equal(linked.data.status, "saved");
    assert.ok(linked.data.version > submitted.data.version);
    const approved = await moderator.request(
      `admin/revisions/${draft.id}/decision`,
      "POST",
      { version: linked.data.version, decision: "approve" },
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

    const identity = await seller.request("session");
    const limits = await seller.request("entitlements");
    assert.equal(limits.status, 200, limits.error);
    assert.equal(limits.data.billingEnabled, false);
    assert.equal((await buyer.request("admin/entitlements")).status, 403);
    const override = await admin.request("admin/entitlements", "POST", {
      action: "set_user_override",
      userId: identity.data.id,
      version: 0,
      limits: { draftsPerDay: 0 },
      expiresAt: new Date(Date.now() + 3600000).toISOString(),
      reason: "Quota temporaire de la fixture de recette HTTP isolée.",
    });
    assert.equal(override.status, 200, override.error);
    const deniedDraft = await seller.request("listings", "POST", {});
    assert.equal(deniedDraft.status, 429, deniedDraft.error);
    assert.ok(deniedDraft.response.headers.get("retry-after"));
    const clearOverride = await admin.request("admin/entitlements", "POST", {
      action: "clear_user_override",
      userId: identity.data.id,
      version: override.data.user.override.version,
      reason: "Fin du contrôle de quota sur cette fixture HTTP isolée.",
    });
    assert.equal(clearOverride.status, 200, clearOverride.error);
    assert.equal(
      (await seller.request("me/export")).status,
      405,
      "Legacy export cannot skip reauthentication",
    );
    assert.equal(
      (
        await seller.request("privacy/exports", "POST", {
          password: "incorrect",
        })
      ).status,
      403,
    );
    const exportJob = await seller.request("privacy/exports", "POST", {
      password,
    });
    assert.equal(exportJob.status, 201, exportJob.error);
    assert.equal(exportJob.data.state, "queued");
    assert.ok(
      process.env.GP_DATABASE_PATH?.includes("http-acceptance-"),
      "Archive maintenance must target only the launcher's disposable QA database",
    );
    assert.equal(process.env.GP_FORCE_LOCAL_DEMO, "true");
    const builtArchive = await processLocalExport(
      exportJob.data.id,
      EXPORT_POLICY,
    );
    assert.equal(builtArchive.state, "ready");
    assert.equal(builtArchive.files, 3);
    const privateDownload = await seller.request(
      `privacy/exports/${exportJob.data.id}/download`,
      "POST",
      { password },
    );
    assert.equal(privateDownload.status, 200, privateDownload.error);
    assert.equal(
      privateDownload.response.headers.get("content-type"),
      "application/zip",
    );
    assert.equal(privateDownload.archive?.subarray(0, 2).toString(), "PK");
    assert.equal(
      (
        await buyer.request(
          `privacy/exports/${exportJob.data.id}/download`,
          "POST",
          { password },
        )
      ).status,
      404,
    );
    db()
      .prepare("UPDATE export_jobs SET expires_at=? WHERE id=? AND user_id=?")
      .run(
        new Date(Date.now() - 1000).toISOString(),
        exportJob.data.id,
        identity.data.id,
      );
    assert.equal(
      (await purgeLocalExport(exportJob.data.id, EXPORT_POLICY)).state,
      "expired",
    );
    resetDbForTests();
    assert.equal(
      (
        await seller.request(
          `privacy/exports/${exportJob.data.id}/download`,
          "POST",
          { password },
        )
      ).status,
      409,
    );
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
