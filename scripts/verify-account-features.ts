import {
  QaStrongSession,
  qaTotp,
  confirmQaLocation,
  linkQaPublication,
  type QaAdmin,
} from "./qa-publication-contract";
/**
 * Targeted connected-service QA, only for the five coordinator-created identities.
 * Wait for the coordinator's migration/setup approval, then run:
 *   npx tsx scripts/verify-account-features.ts --run
 * Reads ignored .data/supabase-qa.json. Never signs up users, sends emails,
 * changes global MFA policy, logs QR/secret/codes, or deploys anything.
 * New fixture IDs append to .data/supabase-qa-result.json for exact coordinator cleanup.
 * RFC 6238 TOTP is computed ONLY for a factor this script enrolls on the QA moderator.
 */
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import sharp from "sharp";
import { createClient } from "@supabase/supabase-js";
type Persona = "seller" | "buyer" | "outsider" | "moderator";
type Config = {
  origin: string;
  supabaseUrl: string;
  publishableKey: string;
  users: Record<Persona, { id: string; email: string; password: string }> & {
    admin?: QaAdmin;
  };
};
type Reply = {
  status: number;
  data: any;
  code?: string;
  raw?: any;
  retryAfter?: string | null;
};
type Check = {
  name: string;
  passed: boolean;
  httpStatus?: number;
  code?: string;
};
let config: Config;
const checks: Check[] = [];
let failure: string | null = null;
const context = {
  mfaGlobalPolicyChanged: false,
  requiredForAdmin: null as boolean | null,
  totpFactorRevoked: false,
  emailsSent: false,
  verificationAttempts: 0,
  fixtureScope: "five coordinator-created QA identities only",
};
let inventory: any = null;
function check(name: string, value: unknown, r?: Reply) {
  checks.push({
    name,
    passed: !!value,
    ...(r ? { httpStatus: r.status, ...(r.code ? { code: r.code } : {}) } : {}),
  });
  if (!value) throw new Error(name);
}
function status(name: string, r: Reply, expected: number | number[]) {
  check(
    name,
    (Array.isArray(expected) ? expected : [expected]).includes(r.status),
    r,
  );
}
async function saveInventory() {
  if (inventory)
    await writeFile(
      ".data/supabase-qa-result.json",
      JSON.stringify(inventory, null, 2) + "\n",
      { mode: 0o600 },
    );
}
function append(kind: string, value: unknown) {
  inventory[kind] ||= [];
  if (typeof value === "string" && !inventory[kind].includes(value))
    inventory[kind].push(value);
}
class Client {
  cookies = new Map<string, string>();
  async api(path: string, method = "GET", payload?: unknown): Promise<Reply> {
    const form = payload instanceof FormData;
    const r = await fetch(`${config.origin}/api/${path}`, {
      method,
      redirect: "manual",
      signal: AbortSignal.timeout(40000),
      headers: {
        Origin: config.origin,
        ...(this.cookies.size
          ? {
              Cookie: [...this.cookies].map(([k, v]) => `${k}=${v}`).join("; "),
            }
          : {}),
        ...(payload && !form ? { "Content-Type": "application/json" } : {}),
      },
      body: payload ? (form ? payload : JSON.stringify(payload)) : undefined,
    });
    for (const c of r.headers.getSetCookie()) {
      const first = c.split(";")[0],
        i = first.indexOf("=");
      if (first.slice(i + 1))
        this.cookies.set(first.slice(0, i), first.slice(i + 1));
      else this.cookies.delete(first.slice(0, i));
    }
    const raw = await r.json().catch(() => null);
    return {
      status: r.status,
      data: raw?.data,
      code: raw?.code,
      raw,
      retryAfter: r.headers.get("retry-after"),
    };
  }
  async media(path: string) {
    return fetch(`${config.origin}${path}`, {
      headers: {
        ...(this.cookies.size
          ? {
              Cookie: [...this.cookies].map(([k, v]) => `${k}=${v}`).join("; "),
            }
          : {}),
      },
      signal: AbortSignal.timeout(40000),
    });
  }
}
async function main() {
  if (!process.argv.includes("--run")) {
    console.log(
      "Prepared. Coordinator may run: npx tsx scripts/verify-account-features.ts --run",
    );
    return;
  }
  const clients = {
      seller: new Client(),
      buyer: new Client(),
      outsider: new Client(),
      moderator: new Client(),
    },
    guest = new Client();
  let moderatorMfa: QaStrongSession | undefined,
    adminMfa: QaStrongSession | undefined;
  try {
    config = JSON.parse(await readFile(".data/supabase-qa.json", "utf8"));
    assert.ok(
      config.users.admin?.id,
      "Current019 recipe needs a separately provisioned dedicated QA admin identity",
    );
    assert.match(config.origin, /^http:\/\/(127\.0\.0\.1|localhost):\d+$/);
    config.origin = config.origin.replace(/\/$/, "");
    assert.ok(
      config.publishableKey && !config.publishableKey.startsWith("sb_secret_"),
    );
    for (const p of ["seller", "buyer", "outsider", "moderator"] as const)
      assert.ok(
        config.users[p]?.id &&
          config.users[p]?.email &&
          config.users[p]?.password,
      );
    inventory = JSON.parse(
      await readFile(".data/supabase-qa-result.json", "utf8").catch(() =>
        JSON.stringify({
          userIds: Object.values(config.users).map((u) => u.id),
        }),
      ),
    );
    assert.ok(
      (inventory.userIds || []).every((id: string) =>
        Object.values(config.users).some((u) => u.id === id),
      ),
    );
    inventory.featureRunId = randomUUID();
    inventory.featureStatus = "running";
    await saveInventory();
    check(
      "totp_rfc6238_known_test_vector",
      qaTotp("GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ", 59000, 8) === "94287082",
    );
    const mode = await guest.api("session");
    status("connected_session_http", mode, 200);
    check("connected_supabase_mode", mode.raw.mode === "supabase");
    for (const p of ["seller", "buyer", "outsider", "moderator"] as const) {
      const identity = config.users[p];
      const login = await clients[p].api("auth/login", "POST", {
        email: identity.email,
        password: identity.password,
      });
      status(`${p}_login`, login, 200);
      check(`${p}_identity`, login.data.id === identity.id);
    }
    const mfa = await clients.moderator.api("mfa");
    status("mfa_service_available", mfa, 200);
    check("mfa_real_service_supported", mfa.data.supported === true);
    context.requiredForAdmin = !!mfa.data.requiredForAdmin;
    check("moderator_initial_aal1", mfa.data.currentLevel === "aal1");
    if (context.requiredForAdmin)
      status(
        "admin_requires_strong_session",
        await clients.moderator.api("admin/revisions"),
        403,
      );
    moderatorMfa = new QaStrongSession(
      clients.moderator.api.bind(clients.moderator),
      config.users.moderator,
      "moderator",
      async (kind, value) => {
        append(kind, value);
        await saveInventory();
      },
      check,
    );
    await moderatorMfa.establish("moderator");
    context.verificationAttempts = moderatorMfa.verificationAttempts;
    status(
      "moderation_access_after_mfa",
      await clients.moderator.api("admin/revisions"),
      200,
    );
    const created = await clients.seller.api("listings", "POST", {});
    status("gallery_draft_created", created, 201);
    const id = created.data.id;
    append("listingIds", id);
    await saveInventory();
    const firstSpace = created.data.spaces[0],
      secondSpace = { ...firstSpace, id: randomUUID(), number: "QA-2" };
    firstSpace.number = "QA-1";
    const urls: string[] = [];
    for (let i = 0; i < 4; i++) {
      const image = await sharp({
        create: {
          width: 16,
          height: 16,
          channels: 3,
          background: { r: 145, g: 135 + i * 10, b: 155 },
        },
      })
        .png()
        .toBuffer();
      const form = new FormData();
      form.set("listingId", id);
      form.set(
        "file",
        new Blob([new Uint8Array(image)], { type: "image/png" }),
        `inert-unit-${i}.png`,
      );
      const upload = await clients.seller.api("uploads", "POST", form);
      status(`gallery_upload_${i + 1}`, upload, 201);
      urls.push(upload.data.url);
      inventory.media ||= [];
      inventory.media.push({
        id: upload.data.id,
        listingId: id,
        objectKey: `${config.users.seller.id}/${id}/${upload.data.id}.webp`,
      });
      await saveInventory();
    }
    const patch = {
      version: created.data.version,
      title: "Lot fictif de recette des galeries",
      description:
        "Recette technique du rattachement des photos aux places. Les quatre images sont des fixtures inertes, sans représentation d’un parking réel. Ce dossier doit être retiré à la fin des contrôles.",
      city: "Lyon",
      district: "Recette des galeries",
      priceCents: 12500,
      transactionType: "rent",
      type: "covered",
      spaces: [firstSpace, secondSpace],
      photos: urls.slice(0, 3),
      spacePhotos: { [firstSpace.id]: [urls[3]], [secondSpace.id]: [urls[3]] },
      quality: created.data.quality,
      locationPrecision: "area",
      coordinates: created.data.coordinates,
    };
    const invalidUnit = await clients.seller.api(`listings/${id}`, "PATCH", {
      ...patch,
      spacePhotos: { [randomUUID()]: [urls[3]] },
    });
    status("unknown_unit_gallery_refused", invalidUnit, 400);
    const excessive = await clients.seller.api(`listings/${id}`, "PATCH", {
      ...patch,
      spacePhotos: { [firstSpace.id]: Array(7).fill(urls[3]) },
    });
    status("more_than_six_unit_photos_refused", excessive, 400);
    const saved = await clients.seller.api(`listings/${id}`, "PATCH", patch);
    status("unit_gallery_saved", saved, 200);
    check(
      "unit_gallery_private_mapping",
      saved.data.spacePhotos[firstSpace.id]?.[0] === urls[3],
    );
    check(
      "shared_image_mapping_allowed",
      saved.data.spacePhotos[secondSpace.id]?.[0] === urls[3],
    );
    const other = await clients.seller.api("listings", "POST", {});
    status("second_own_draft_created", other, 201);
    append("listingIds", other.data.id);
    await saveInventory();
    const borrowed = await clients.seller.api(
      `listings/${other.data.id}`,
      "PATCH",
      { version: other.data.version, photos: [urls[0]] },
    );
    status("photo_from_another_listing_refused", borrowed, 400);
    status(
      "unused_second_draft_withdrawn",
      await clients.seller.api(`listings/${other.data.id}/lifecycle`, "POST", {
        version: other.data.version,
        action: "withdraw",
      }),
      200,
    );
    saved.data = await confirmQaLocation(
      clients.seller.api.bind(clients.seller),
      saved.data,
    );
    const submitted = await clients.seller.api(
      `listings/${id}/submit`,
      "POST",
      { version: saved.data.version, ownershipAttested: true },
    );
    status("gallery_listing_submitted", submitted, 200);
    const qaAdmin = new Client();
    adminMfa = new QaStrongSession(
      qaAdmin.api.bind(qaAdmin),
      config.users.admin!,
      "admin",
      async (kind, value) => {
        append(kind, value);
        await saveInventory();
      },
      check,
    );
    await adminMfa.establish("admin");
    const quotaBefore = await clients.seller.api("entitlements");
    status("real_storage_usage_readable", quotaBefore, 200);
    check(
      "real_storage_objects_charged_once",
      quotaBefore.data.usage.uploads.used >= 4 &&
        quotaBefore.data.usage.uploadBytes.used > 0,
    );
    const quotaUser = config.users.outsider.id;
    const beforeOverride = await qaAdmin.api(
      `admin/entitlements?userId=${quotaUser}`,
    );
    status("admin_read_qa_override", beforeOverride, 200);
    check(
      "qa_override_not_preexisting_active",
      !beforeOverride.data.user.override?.active,
    );
    const quotaDraft = await clients.outsider.api("listings", "POST", {});
    status("quota_fixture_draft_created", quotaDraft, 201);
    append("listingIds", quotaDraft.data.id);
    await saveInventory();
    const overridden = await qaAdmin.api("admin/entitlements", "POST", {
      action: "set_user_override",
      userId: quotaUser,
      version: beforeOverride.data.user.override?.version ?? 0,
      limits: { uploadsPerHour: 0, uploadBytesPerDay: 0 },
      expiresAt: new Date(Date.now() + 600000).toISOString(),
      reason:
        "Recette limitée au compte fictif : refus Storage sans modifier le forfait gratuit.",
    });
    status("qa_only_zero_upload_override", overridden, 200);
    const quotaForm = new FormData();
    quotaForm.set("listingId", quotaDraft.data.id);
    const quotaBytes = await sharp({
      create: { width: 16, height: 16, channels: 3, background: "#999999" },
    })
      .png()
      .toBuffer();
    quotaForm.set(
      "file",
      new Blob([new Uint8Array(quotaBytes)], { type: "image/png" }),
      "quota-inert.png",
    );
    try {
      const refused = await clients.outsider.api("uploads", "POST", quotaForm);
      status("real_storage_quota_http_refused", refused, 429);
      check("real_storage_quota_code", refused.code === "RATE_LIMITED");
      check("real_storage_retry_after", Number(refused.retryAfter) > 0);
      const directStorage = createClient(
        config.supabaseUrl,
        config.publishableKey,
        { auth: { persistSession: false, autoRefreshToken: false } },
      );
      const authenticated = await directStorage.auth.signInWithPassword({
        email: config.users.outsider.email,
        password: config.users.outsider.password,
      });
      check("direct_storage_fixture_login", !authenticated.error);
      const objectKey = `${quotaUser}/${quotaDraft.data.id}/${randomUUID()}.webp`;
      const allowedPath = await directStorage.rpc("gp_storage_allowed", {
        p_name: objectKey,
      });
      check(
        "direct_storage_path_authorized_before_quota",
        !allowedPath.error && allowedPath.data === true,
      );
      const directUpload = await directStorage.storage
        .from("private-uploads")
        .upload(objectKey, await sharp(quotaBytes).webp().toBuffer(), {
          contentType: "image/webp",
          upsert: false,
        });
      if (!directUpload.error) {
        inventory.media ||= [];
        inventory.media.push({
          listingId: quotaDraft.data.id,
          objectKey,
          unexpectedQuotaBypass: true,
        });
        await saveInventory();
        await directStorage.storage.from("private-uploads").remove([objectKey]);
      }
      check("direct_storage_trigger_refused", !!directUpload.error);
      const missing = await directStorage.storage
        .from("private-uploads")
        .download(objectKey);
      check(
        "direct_storage_rejected_object_absent",
        !!missing.error && !missing.data,
      );
      await directStorage.auth.signOut({ scope: "local" });
      const usage = await clients.outsider.api("entitlements");
      check(
        "rejected_upload_not_charged",
        usage.data.usage.uploads.used === 0 &&
          usage.data.usage.uploadBytes.used === 0,
      );
    } finally {
      const cleared = await qaAdmin.api("admin/entitlements", "POST", {
        action: "clear_user_override",
        userId: quotaUser,
        version: overridden.data.user.override.version,
        reason: "Fin de recette du refus de dépôt sur le compte fictif dédié.",
      });
      status("qa_upload_override_cleared", cleared, 200);
      check(
        "qa_upload_override_inactive",
        cleared.data.user.override.active === false,
      );
    }
    status(
      "quota_fixture_withdrawn",
      await clients.outsider.api(
        `listings/${quotaDraft.data.id}/lifecycle`,
        "POST",
        { version: quotaDraft.data.version, action: "withdraw" },
      ),
      200,
    );
    const registryVersion = await linkQaPublication(
      qaAdmin.api.bind(qaAdmin),
      config.users.admin,
      submitted.data,
      append,
    );
    await saveInventory();
    const approved = await clients.moderator.api(
      `admin/revisions/${id}/decision`,
      "POST",
      { version: registryVersion, decision: "approve" },
    );
    status("gallery_listing_approved", approved, 200);
    const published = await guest.api(`listings/${id}`);
    status("gallery_public_listing", published, 200);
    check(
      "rent_published_monthly_amount",
      published.data.transactionType === "rent" &&
        published.data.priceCents === 12500,
    );
    const rents = await guest.api("listings?transactionType=rent&limit=50");
    status("rent_catalog_filter", rents, 200);
    check(
      "rent_catalog_includes_fixture",
      rents.data.some((l: any) => l.id === id) &&
        rents.data.every((l: any) => l.transactionType === "rent"),
    );
    const sales = await guest.api("listings?transactionType=sale&limit=50");
    status("sale_catalog_filter", sales, 200);
    check(
      "sale_catalog_excludes_rent",
      !sales.data.some((l: any) => l.id === id) &&
        sales.data.every((l: any) => l.transactionType === "sale"),
    );
    check(
      "unit_photos_present_in_public_projection",
      Object.keys(published.data.spacePhotos || {}).length === 2,
    );
    check(
      "public_gallery_keys_are_public_space_aliases",
      Object.keys(published.data.spacePhotos).every((key) =>
        published.data.spaces.some((s: any) => s.id === key),
      ),
    );
    check(
      "private_unit_ids_not_leaked_in_gallery",
      !Object.keys(published.data.spacePhotos).includes(firstSpace.id) &&
        !Object.keys(published.data.spacePhotos).includes(secondSpace.id),
    );
    check(
      "shared_unit_asset_not_duplicated",
      new Set([
        ...published.data.photos,
        ...Object.values(published.data.spacePhotos).flat(),
      ]).size === 4,
    );
    const unitImage = await guest.media(urls[3]);
    check("approved_unit_photo_anonymously_readable", unitImage.status === 200);
    const metadata = await sharp(
      Buffer.from(await unitImage.arrayBuffer()),
    ).metadata();
    check(
      "approved_unit_photo_webp_without_exif",
      metadata.format === "webp" && !metadata.exif,
    );
    const contact = await clients.buyer.api("conversations", "POST", {
      listingId: id,
    });
    status("notification_contact", contact, [200, 201]);
    const cid = contact.data.id;
    append("conversationIds", cid);
    await saveInventory();
    const sent = await clients.buyer.api(
      `conversations/${cid}/messages`,
      "POST",
      {
        body: "Message technique pour vérifier la notification interne et la lecture.",
        clientRequestId: randomUUID(),
      },
    );
    status("notification_message_send", sent, 201);
    append("messageIds", sent.data.id);
    await saveInventory();
    const unreadConversations = await clients.seller.api("conversations");
    status("seller_conversation_list", unreadConversations, 200);
    check(
      "conversation_unread_count_real",
      unreadConversations.data.find((c: any) => c.id === cid)?.unread >= 1,
    );
    const notifications = await clients.seller.api("notifications");
    status("seller_notifications", notifications, 200);
    const ownNotice = notifications.data.find(
      (n: any) => n.url?.includes(cid) || n.url?.includes(id),
    );
    check("notification_exists_for_recorded_event", !!ownNotice);
    check(
      "notification_unread_count_present",
      Number.isInteger(notifications.raw.unread) &&
        notifications.raw.unread >= 1,
    );
    status(
      "mark_own_notification_read",
      await clients.seller.api("notifications/read", "POST", {
        ids: [ownNotice.id],
      }),
      200,
    );
    const afterRead = await clients.seller.api("notifications");
    check(
      "notification_read_persisted",
      !!afterRead.data.find((n: any) => n.id === ownNotice.id)?.readAt,
    );
    const outsiderNotices = await clients.outsider.api("notifications");
    status("outsider_notifications_query", outsiderNotices, 200);
    check(
      "notification_not_visible_to_other_member",
      !outsiderNotices.data.some((n: any) => n.id === ownNotice.id),
    );
    status(
      "reading_messages_marks_seen",
      await clients.seller.api(`conversations/${cid}/messages`),
      200,
    );
    const seenConversations = await clients.seller.api("conversations");
    check(
      "conversation_unread_cleared_after_read",
      seenConversations.data.find((c: any) => c.id === cid)?.unread === 0,
    );
    const preference = await clients.seller.api("me/notification-settings");
    status("email_preference_read", preference, 200);
    const previous = preference.data.emailEnabled;
    const changed = await clients.seller.api(
      "me/notification-settings",
      "PATCH",
      { emailEnabled: !previous },
    );
    status("email_preference_save", changed, 200);
    check(
      "email_preference_really_saved",
      (await clients.seller.api("me/notification-settings")).data
        .emailEnabled === !previous,
    );
    status(
      "email_preference_restored",
      await clients.seller.api("me/notification-settings", "PATCH", {
        emailEnabled: previous,
      }),
      200,
    );
    const report = await clients.buyer.api("reports", "POST", {
      listingId: id,
      reason: "Signalement de recette technique, sans accusation réelle.",
    });
    status("report_created", report, 201);
    append("reportIds", report.data.id);
    await saveInventory();
    status(
      "member_report_admin_denied",
      await clients.outsider.api("admin/reports"),
      403,
    );
    const reportQueue = await clients.moderator.api("admin/reports");
    status("moderator_report_queue", reportQueue, 200);
    const item = reportQueue.data.find((r: any) => r.id === report.data.id);
    check("new_report_in_queue", !!item);
    const decision = await clients.moderator.api(
      `admin/reports/${item.id}/decision`,
      "POST",
      {
        status: "reviewed",
        reason: "Dossier fictif relu uniquement pour la recette technique.",
        version: item.version,
      },
    );
    status("report_review_decision", decision, 200);
    check("report_review_persisted", decision.data.status === "reviewed");
    status(
      "report_stale_version_refused",
      await clients.moderator.api(`admin/reports/${item.id}/decision`, "POST", {
        status: "dismissed",
        reason: "Tentative avec une version périmée.",
        version: item.version,
      }),
      409,
    );
    status(
      "feature_fixture_withdrawn",
      await clients.seller.api(`listings/${id}/lifecycle`, "POST", {
        action: "withdraw",
        version: approved.data.version,
      }),
      200,
    );
    const hiddenUnit = await guest.media(urls[3]);
    check(
      "withdrawn_unit_photo_no_longer_public",
      [401, 403, 404].includes(hiddenUnit.status),
    );
    await moderatorMfa.cleanup();
    context.totpFactorRevoked = moderatorMfa.factorRevoked;
    await adminMfa.cleanup();
    inventory.featureStatus = "passed";
  } catch (error) {
    failure =
      error instanceof Error && checks.some((c) => c.name === error.message)
        ? error.message
        : "configuration_or_transport_failure";
    if (inventory) inventory.featureStatus = "failed";
  }
  for (const strong of [moderatorMfa, adminMfa]) {
    try {
      await strong?.cleanup();
    } catch {
      failure ||= "qa_factor_cleanup_failed";
      if (inventory) inventory.featureStatus = "failed";
    }
  }
  context.totpFactorRevoked = moderatorMfa?.factorRevoked ?? false;
  // No global logout or account deletion: another specialist may use a distinct QA session.
  await saveInventory();
  await mkdir("docs/qa", { recursive: true });
  const report = {
    timestamp: new Date().toISOString(),
    status: failure ? "failed" : "passed",
    passed: checks.filter((c) => c.passed).length,
    failedCheck: failure,
    context,
    checks,
    credentialsIncluded: false,
    qrSecretOrTotpIncluded: false,
    cleanupInventory: ".data/supabase-qa-result.json",
    adminFactorRevoked: adminMfa?.factorRevoked ?? false,
    limitations: [
      "Email delivery not exercised",
      "No global MFA policy toggle",
      "Administrator/moderator AAL2 established through real TOTP; AAL1 gate asserted when configured as required",
      "No real parking or production deployment",
    ],
    sources: [
      "https://www.rfc-editor.org/rfc/rfc6238",
      "https://supabase.com/docs/guides/auth/auth-mfa/totp",
    ],
  };
  await writeFile(
    "docs/qa/account-features.json",
    JSON.stringify(report, null, 2) + "\n",
  );
  console.log(
    JSON.stringify({
      status: report.status,
      passed: report.passed,
      failedCheck: failure,
      factorRevoked: context.totpFactorRevoked,
      report: "docs/qa/account-features.json",
    }),
  );
  if (failure) process.exitCode = 1;
}
void main().catch(() => {
  console.error("Feature verification could not write its sanitized report.");
  process.exitCode = 1;
});
