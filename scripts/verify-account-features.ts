/**
 * Targeted connected-service QA, only for the four coordinator-created identities.
 * Wait for the coordinator's migration/setup approval, then run:
 *   npx tsx scripts/verify-account-features.ts --run
 * Reads ignored .data/supabase-qa.json. Never signs up users, sends emails,
 * changes global MFA policy, logs QR/secret/codes, or deploys anything.
 * New fixture IDs append to .data/supabase-qa-result.json for exact coordinator cleanup.
 * RFC 6238 TOTP is computed ONLY for a factor this script enrolls on the QA moderator.
 */
import assert from "node:assert/strict";
import { createHmac, randomUUID } from "node:crypto";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import sharp from "sharp";
type Persona = "seller" | "buyer" | "outsider" | "moderator";
type Config = {
  origin: string;
  supabaseUrl: string;
  publishableKey: string;
  users: Record<Persona, { id: string; email: string; password: string }>;
};
type Reply = { status: number; data: any; code?: string; raw: any };
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
  fixtureScope: "four coordinator-created QA identities only",
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
    return { status: r.status, data: raw?.data, code: raw?.code, raw };
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
function totp(secret: string, time = Date.now(), digits = 6) {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  let bits = "";
  for (const char of secret.toUpperCase().replace(/=+$/, "")) {
    const index = alphabet.indexOf(char);
    if (index < 0) throw new Error("totp_invalid_private_encoding");
    bits += index.toString(2).padStart(5, "0");
  }
  const bytes = Buffer.alloc(Math.floor(bits.length / 8));
  for (let i = 0; i < bytes.length; i++)
    bytes[i] = parseInt(bits.slice(i * 8, i * 8 + 8), 2);
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(Math.floor(time / 30000)));
  const digest = createHmac("sha1", bytes).update(counter).digest();
  const offset = digest[digest.length - 1] & 15;
  const value = digest.readUInt32BE(offset) & 0x7fffffff;
  return String(value % 10 ** digits).padStart(digits, "0");
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
  let factorId: string | null = null,
    factorCleanupAttempted = false;
  try {
    config = JSON.parse(await readFile(".data/supabase-qa.json", "utf8"));
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
      totp("GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ", 59000, 8) === "94287082",
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
    const enrolled = await clients.moderator.api("mfa/enroll", "POST", {});
    status("mfa_factor_enrolled", enrolled, 200);
    factorId = enrolled.data.factorId;
    check(
      "mfa_private_qr_contract",
      typeof enrolled.data.qrCode === "string" &&
        enrolled.data.qrCode.length > 20,
    );
    check(
      "mfa_private_secret_contract",
      typeof enrolled.data.secret === "string" &&
        enrolled.data.secret.length >= 16,
    );
    append("mfaFactorIds", factorId);
    await saveInventory();
    let verified: Reply | undefined;
    for (let attempt = 0; attempt < 2; attempt++) {
      const challenge = await clients.moderator.api("mfa/challenge", "POST", {
        factorId,
      });
      status(`mfa_challenge_${attempt + 1}`, challenge, 200);
      const code = totp(enrolled.data.secret);
      verified = await clients.moderator.api("mfa/verify", "POST", {
        factorId,
        challengeId: challenge.data.challengeId,
        code,
      });
      context.verificationAttempts++;
      if (verified.status === 200) break;
      if (verified.code !== "MFA_INVALID" || attempt === 1) break;
      await new Promise((r) => setTimeout(r, 1100));
    }
    status("mfa_code_verified", verified!, 200);
    const strong = await clients.moderator.api("mfa");
    status("mfa_assurance_after_verify", strong, 200);
    check("mfa_session_is_aal2", strong.data.currentLevel === "aal2");
    check(
      "mfa_factor_confirmed",
      strong.data.factors.some(
        (f: any) => f.id === factorId && f.status === "verified",
      ),
    );
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
      priceCents: 3100000,
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
    const submitted = await clients.seller.api(
      `listings/${id}/submit`,
      "POST",
      { version: saved.data.version, ownershipAttested: true },
    );
    status("gallery_listing_submitted", submitted, 200);
    const approved = await clients.moderator.api(
      `admin/revisions/${id}/decision`,
      "POST",
      { version: submitted.data.version, decision: "approve" },
    );
    status("gallery_listing_approved", approved, 200);
    const published = await guest.api(`listings/${id}`);
    status("gallery_public_listing", published, 200);
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
    factorCleanupAttempted = true;
    const removed = await clients.moderator.api("mfa/unenroll", "POST", {
      factorId,
      password: config.users.moderator.password,
    });
    status("qa_mfa_factor_removed_after_reauthentication", removed, 200);
    context.totpFactorRevoked = true;
    const factors = await clients.moderator.api("mfa");
    status("mfa_state_after_removal", factors, 200);
    check(
      "qa_factor_absent_after_removal",
      !factors.data.factors.some((f: any) => f.id === factorId),
    );
    inventory.featureStatus = "passed";
  } catch (error) {
    failure =
      error instanceof Error && checks.some((c) => c.name === error.message)
        ? error.message
        : "configuration_or_transport_failure";
    if (inventory) inventory.featureStatus = "failed";
  }
  if (factorId && !context.totpFactorRevoked && !factorCleanupAttempted) {
    factorCleanupAttempted = true;
    try {
      const cleanup = await clients.moderator.api("mfa/unenroll", "POST", {
        factorId,
        password: config.users.moderator.password,
      });
      context.totpFactorRevoked = cleanup.status === 200;
    } catch {
      /* Coordinator can remove the exact QA factor from the ignored inventory. */
    }
  }
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
    limitations: [
      "Email delivery not exercised",
      "No global MFA policy toggle",
      "Administrator mandatory-MFA gate asserted only when configured as required",
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
