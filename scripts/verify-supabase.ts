/**
 * Opt-in integration verification against the configured, dedicated Supabase project.
 * Run only after the coordinator has created confirmed test identities and reviewed migrations:
 *   npx tsx scripts/verify-supabase.ts --run
 * Configuration (ignored, chmod 600): .data/supabase-qa.json
 * { origin, supabaseUrl, publishableKey, users: { seller, buyer, outsider, moderator } }
 * Each identity contains { id, email, password }. No signup, email sending, service key or deployment.
 * Coordinator owns setup and cleanup. IDs needed for cleanup are written to the ignored result file.
 */
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile, mkdir, writeFile } from "node:fs/promises";
import sharp from "sharp";
type Persona = "seller" | "buyer" | "outsider" | "moderator";
type Identity = { id: string; email: string; password: string };
type Config = {
  origin: string;
  supabaseUrl: string;
  publishableKey: string;
  users: Record<Persona, Identity>;
};
type Reply = { status: number; data: any; code?: string; raw: any };
type Check = {
  name: string;
  passed: boolean;
  httpStatus?: number;
  code?: string;
};
const checks: Check[] = [];
const artifacts = {
  runId: randomUUID(),
  userIds: [] as string[],
  listingIds: [] as string[],
  media: [] as { id: string; listingId: string; objectKey: string }[],
  conversationIds: [] as string[],
  messageIds: [] as string[],
  visitIds: [] as string[],
  status: "prepared",
  cleanup: "coordinator_required",
};
let config: Config;
async function saveArtifacts() {
  await mkdir(".data", { recursive: true });
  await writeFile(
    ".data/supabase-qa-result.json",
    JSON.stringify(artifacts, null, 2) + "\n",
    { mode: 0o600 },
  );
}
function check(name: string, passed: unknown, reply?: Reply) {
  checks.push({
    name,
    passed: !!passed,
    ...(reply
      ? {
          httpStatus: reply.status,
          ...(reply.code ? { code: reply.code } : {}),
        }
      : {}),
  });
  if (!passed) throw new Error(name);
}
function status(name: string, reply: Reply, expected: number | number[]) {
  check(
    name,
    (Array.isArray(expected) ? expected : [expected]).includes(reply.status),
    reply,
  );
}
class Client {
  cookies = new Map<string, string>();
  async api(path: string, method = "GET", payload?: unknown): Promise<Reply> {
    const multipart = payload instanceof FormData;
    const response = await fetch(`${config.origin}/api/${path}`, {
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
        ...(payload && !multipart
          ? { "Content-Type": "application/json" }
          : {}),
      },
      body: payload
        ? multipart
          ? payload
          : JSON.stringify(payload)
        : undefined,
    });
    for (const cookie of response.headers.getSetCookie()) {
      const pair = cookie.split(";")[0],
        index = pair.indexOf("=");
      const name = pair.slice(0, index),
        value = pair.slice(index + 1);
      if (value) this.cookies.set(name, value);
      else this.cookies.delete(name);
    }
    const raw = await response.json().catch(() => null);
    return { status: response.status, data: raw?.data, code: raw?.code, raw };
  }
  async media(path: string) {
    return fetch(`${config.origin}${path}`, {
      signal: AbortSignal.timeout(40000),
      headers: {
        ...(this.cookies.size
          ? {
              Cookie: [...this.cookies].map(([k, v]) => `${k}=${v}`).join("; "),
            }
          : {}),
      },
    });
  }
}
const tokens: Partial<Record<Persona, string>> = {};
async function direct(
  path: string,
  persona: Persona | null,
  method = "GET",
  payload?: unknown,
): Promise<Reply> {
  const headers: Record<string, string> = {
    apikey: config.publishableKey,
    ...(persona ? { Authorization: `Bearer ${tokens[persona]}` } : {}),
    ...(payload ? { "Content-Type": "application/json" } : {}),
  };
  const response = await fetch(`${config.supabaseUrl}${path}`, {
    method,
    headers,
    body: payload ? JSON.stringify(payload) : undefined,
    signal: AbortSignal.timeout(40000),
  });
  const raw = await response.json().catch(() => null);
  return { status: response.status, data: raw, code: raw?.code, raw };
}
async function rpc(name: string, persona: Persona | null, payload: unknown) {
  return direct(`/rest/v1/rpc/${name}`, persona, "POST", payload);
}
async function main() {
  if (!process.argv.includes("--run")) {
    console.log(
      "Prepared. Coordinator may run: npx tsx scripts/verify-supabase.ts --run",
    );
    return;
  }
  let failed: string | null = null,
    configReady = false;
  try {
    config = JSON.parse(await readFile(".data/supabase-qa.json", "utf8"));
    assert.match(config.origin, /^http:\/\/(127\.0\.0\.1|localhost):\d+$/);
    assert.ok(
      config.supabaseUrl.startsWith("https://") ||
        /^http:\/\/(localhost|127\.0\.0\.1):\d+$/.test(config.supabaseUrl),
    );
    config.origin = config.origin.replace(/\/$/, "");
    config.supabaseUrl = config.supabaseUrl.replace(/\/$/, "");
    assert.ok(
      config.publishableKey && !config.publishableKey.startsWith("sb_secret_"),
    );
    if (config.publishableKey.startsWith("ey"))
      assert.equal(
        JSON.parse(
          Buffer.from(
            config.publishableKey.split(".")[1],
            "base64url",
          ).toString(),
        ).role,
        "anon",
      );
    for (const name of ["seller", "buyer", "outsider", "moderator"] as const) {
      assert.ok(
        config.users[name]?.id &&
          config.users[name]?.email &&
          config.users[name]?.password,
      );
      artifacts.userIds.push(config.users[name].id);
    }
    try {
      const prior = JSON.parse(
        await readFile(".data/supabase-qa-result.json", "utf8"),
      );
      if (
        Array.isArray(prior.userIds) &&
        prior.userIds.every((id: string) => artifacts.userIds.includes(id))
      ) {
        for (const key of [
          "listingIds",
          "conversationIds",
          "messageIds",
          "visitIds",
        ] as const)
          for (const id of prior[key] || [])
            if (typeof id === "string" && !artifacts[key].includes(id))
              artifacts[key].push(id);
        for (const item of prior.media || [])
          if (
            typeof item?.id === "string" &&
            !artifacts.media.some((x) => x.id === item.id)
          )
            artifacts.media.push(item);
      }
    } catch {
      /* Fresh fixture run. */
    }
    configReady = true;
    await saveArtifacts();
    const guest = new Client();
    const clients = {
      seller: new Client(),
      buyer: new Client(),
      outsider: new Client(),
      moderator: new Client(),
    };
    const mode = await guest.api("session");
    status("supabase_session_http", mode, 200);
    check("supabase_mode_selected", mode.raw.mode === "supabase");
    check("anonymous_session_empty", mode.data === null);
    status(
      "demo_personas_unavailable",
      await guest.api("auth/demo", "POST", { persona: "moderator" }),
      404,
    );
    status("local_mailbox_unavailable", await guest.api("local-mailbox"), 404);
    for (const persona of [
      "seller",
      "buyer",
      "outsider",
      "moderator",
    ] as const) {
      const identity = config.users[persona];
      const login = await clients[persona].api("auth/login", "POST", {
        email: identity.email,
        password: identity.password,
      });
      status(`${persona}_next_gotrue_login`, login, 200);
      check(`${persona}_identity_matches`, login.data?.id === identity.id);
      check(`${persona}_confirmed_email`, login.data?.emailVerified === true);
      const session = await clients[persona].api("session");
      status(`${persona}_cookie_session`, session, 200);
      check(
        `${persona}_http_only_cookie_identity`,
        session.data?.id === identity.id,
      );
      const token = await direct(
        "/auth/v1/token?grant_type=password",
        null,
        "POST",
        { email: identity.email, password: identity.password },
      );
      status(`${persona}_direct_gotrue_login`, token, 200);
      check(
        `${persona}_direct_token_received`,
        typeof token.data?.access_token === "string",
      );
      tokens[persona] = token.data.access_token;
    }
    check(
      "moderator_server_role",
      (await clients.moderator.api("session")).data?.role === "moderator",
    );
    const limitArgs = { p_kind: "qa-probe", p_limit: 1, p_seconds: 60 };
    const anonLimit = await rpc("gp_limit", null, limitArgs);
    status("anon_gp_limit_not_callable", anonLimit, [401, 403, 404]);
    check(
      "anon_gp_limit_permission_or_hidden",
      ["42501", "PGRST202"].includes(anonLimit.code || ""),
      anonLimit,
    );
    const memberLimit = await rpc("gp_limit", "buyer", limitArgs);
    status("member_gp_limit_not_callable", memberLimit, [401, 403, 404]);
    check(
      "member_gp_limit_permission_or_hidden",
      ["42501", "PGRST202"].includes(memberLimit.code || ""),
      memberLimit,
    );
    const created = await clients.seller.api("listings", "POST", {});
    status("draft_creation", created, 201);
    const id = created.data.id;
    artifacts.listingIds.push(id);
    await saveArtifacts();
    const own = await direct(
      `/rest/v1/listings?id=eq.${id}&select=id,draft`,
      "seller",
    );
    status("direct_rest_owner_can_read", own, 200);
    check(
      "direct_rest_owner_row_visible",
      Array.isArray(own.data) && own.data.length === 1,
    );
    const hidden = await direct(
      `/rest/v1/listings?id=eq.${id}&select=id,draft`,
      "outsider",
    );
    status("direct_rest_other_member_query", hidden, 200);
    check(
      "rls_other_member_has_no_draft",
      Array.isArray(hidden.data) && hidden.data.length === 0,
    );
    status(
      "api_draft_other_owner_hidden",
      await clients.outsider.api(`listings/${id}?draft=1`),
      404,
    );
    const anonymousDraft = await direct(
      `/rest/v1/listings?id=eq.${id}&select=id,draft`,
      null,
    );
    status("anon_private_table_denied", anonymousDraft, [401, 403]);
    const initial = await clients.seller.api(`listings/${id}`, "PATCH", {
      version: created.data.version,
      type: "covered",
      spaces: created.data.spaces,
    });
    status("incomplete_draft_autosave", initial, 200);
    const mediaUrls: string[] = [];
    for (let i = 0; i < 3; i++) {
      const image = await sharp({
        create: {
          width: 16,
          height: 16,
          channels: 3,
          background: { r: 130 + i * 10, g: 145, b: 160 },
        },
      })
        .withExif({
          IFD0: {
            Artist: "GP inert integration fixture",
            ImageDescription: "No real parking",
          },
        })
        .jpeg()
        .toBuffer();
      const form = new FormData();
      form.set("listingId", id);
      form.set(
        "file",
        new Blob([new Uint8Array(image)], { type: "image/jpeg" }),
        `inert-fixture-${i}.jpg`,
      );
      const upload = await clients.seller.api("uploads", "POST", form);
      status(`private_upload_${i + 1}`, upload, 201);
      check(
        `upload_${i + 1}_url_contract`,
        typeof upload.data?.url === "string",
      );
      const mediaId = upload.data.id,
        url = upload.data.url;
      mediaUrls.push(url);
      artifacts.media.push({
        id: mediaId,
        listingId: id,
        objectKey: `${config.users.seller.id}/${id}/${mediaId}.webp`,
      });
      await saveArtifacts();
      const anonymous = await guest.media(url);
      check(
        `anonymous_unapproved_image_${i + 1}_denied`,
        [401, 403, 404].includes(anonymous.status),
      );
      const outsider = await clients.outsider.media(url);
      check(
        `other_member_private_image_${i + 1}_denied`,
        [403, 404].includes(outsider.status),
      );
      const owner = await clients.seller.media(url);
      check(`owner_private_image_${i + 1}_read`, owner.status === 200);
      const metadata = await sharp(
        Buffer.from(await owner.arrayBuffer()),
      ).metadata();
      check(`private_image_${i + 1}_exif_removed`, !metadata.exif);
      check(`private_image_${i + 1}_webp`, metadata.format === "webp");
    }
    const patch = {
      version: initial.data.version,
      title: "Parking fictif de recette Supabase",
      description:
        "Annonce de recette technique exclusivement. Les trois images sont des fixtures inertes et ne représentent aucun bien immobilier réel. Elle doit être retirée après les contrôles.",
      city: "Lyon",
      district: "Recette technique",
      type: "covered",
      priceCents: 3100000,
      spaces: [
        {
          id: randomUUID(),
          number: "QA-1",
          level: -1,
          areaM2: 12,
          lengthM: null,
          widthM: null,
          clearanceM: null,
        },
        {
          id: randomUUID(),
          number: "QA-2",
          level: -1,
          areaM2: null,
          lengthM: null,
          widthM: null,
          clearanceM: null,
        },
      ],
      photos: mediaUrls,
      quality: {
        floor: "Non renseigné",
        lighting: "Non renseigné",
        humidity: "Non renseignée",
        access: "Non renseigné",
        maneuver: "Non renseignée",
        observations: "Fixture technique sans donnée de parking réel.",
      },
      locationPrecision: "area",
      coordinates: [4.85321, 45.76321],
      address: "Adresse privée fictive QA",
      occupancy: "unknown",
      annualChargesCents: null,
      propertyTaxCents: null,
      observedAt: null,
    };
    const saved = await clients.seller.api(`listings/${id}`, "PATCH", patch);
    status("complete_draft_autosave", saved, 200);
    check(
      "unknown_dimensions_remain_null",
      saved.data.spaces[1].areaM2 === null,
    );
    check(
      "unknown_charges_remain_null",
      saved.data.annualChargesCents === null,
    );
    status(
      "stale_draft_version_refused",
      await clients.seller.api(`listings/${id}`, "PATCH", {
        version: created.data.version,
        title: "Obsolete change",
      }),
      409,
    );
    status(
      "draft_mutation_other_owner_refused",
      await clients.outsider.api(`listings/${id}`, "PATCH", {
        version: saved.data.version,
        title: "Forbidden change",
      }),
      [403, 404],
    );
    status(
      "attestation_required_by_server",
      await clients.seller.api(`listings/${id}/submit`, "POST", {
        version: saved.data.version,
      }),
      400,
    );
    const submitted = await clients.seller.api(
      `listings/${id}/submit`,
      "POST",
      { version: saved.data.version, ownershipAttested: true },
    );
    status("submission", submitted, 200);
    check("submission_pending", submitted.data.status === "pending");
    status(
      "not_public_before_approval",
      await guest.api(`listings/${id}`),
      404,
    );
    const nullVersion = await rpc("gp_moderate", "moderator", {
      p_id: id,
      p_decision: "approve",
      p_version: null,
      p_reason: null,
    });
    status("moderation_null_version_refused", nullVersion, 400);
    check(
      "moderation_null_version_conflict",
      String(nullVersion.data?.message || "").includes("VERSION_CONFLICT"),
      nullVersion,
    );
    status(
      "member_moderation_endpoint_denied",
      await clients.buyer.api(`admin/revisions/${id}/decision`, "POST", {
        version: submitted.data.version,
        decision: "approve",
      }),
      403,
    );
    const queue = await clients.moderator.api("admin/revisions");
    status("moderation_queue", queue, 200);
    check(
      "submitted_revision_in_queue",
      queue.data.some((x: any) => x.id === id),
    );
    const approved = await clients.moderator.api(
      `admin/revisions/${id}/decision`,
      "POST",
      { version: submitted.data.version, decision: "approve" },
    );
    status("approved_publication", approved, 200);
    check("approved_status", approved.data.status === "published");
    const published = await guest.api(`listings/${id}`);
    status("public_listing", published, 200);
    check("public_total_price", published.data.priceCents === 3100000);
    check("private_address_absent", !("address" in published.data));
    check("area_scene_unavailable", published.data.sceneAvailable === false);
    check(
      "no_private_owner_identifiers",
      !("sellerId" in published.data) && !("email" in published.data),
    );
    check("public_unknown_unit_area", published.data.spaces[1].areaM2 === null);
    const publicImage = await guest.media(mediaUrls[0]);
    check("public_approved_image_accessible", publicImage.status === 200);
    const publicMetadata = await sharp(
      Buffer.from(await publicImage.arrayBuffer()),
    ).metadata();
    check("public_image_exif_removed", !publicMetadata.exif);
    check("public_image_webp", publicMetadata.format === "webp");
    const publicStorage = await fetch(
      `${config.supabaseUrl}/storage/v1/object/public/public-approved/${artifacts.media[0].id}.webp`,
      { signal: AbortSignal.timeout(40000) },
    );
    check(
      "approved_bucket_has_no_unconditional_public_route",
      !publicStorage.ok,
    );
    const filtered = await guest.api("listings?areaMin=1");
    status("surface_filter", filtered, 200);
    check(
      "unknown_bundle_unit_excluded",
      !filtered.data.some((x: any) => x.id === id),
    );
    status(
      "favorite_first_put",
      await clients.buyer.api(`favorites/${id}`, "PUT"),
      200,
    );
    status(
      "favorite_repeated_put_idempotent",
      await clients.buyer.api(`favorites/${id}`, "PUT"),
      200,
    );
    const favorites = await clients.buyer.api("favorites");
    status("favorite_list", favorites, 200);
    check(
      "favorite_not_duplicated",
      favorites.data.filter((v: string) => v === id).length === 1,
    );
    const contact = await clients.buyer.api("conversations", "POST", {
      listingId: id,
    });
    status("contact_creation", contact, [200, 201]);
    const cid = contact.data.id;
    artifacts.conversationIds.push(cid);
    await saveArtifacts();
    const message = {
      body: "Bonjour, ceci est un message de recette technique, pas une demande immobilière réelle.",
      clientRequestId: randomUUID(),
    };
    const sent = await clients.buyer.api(
      `conversations/${cid}/messages`,
      "POST",
      message,
    );
    status("message_send", sent, 201);
    artifacts.messageIds.push(sent.data.id);
    await saveArtifacts();
    const repeat = await clients.buyer.api(
      `conversations/${cid}/messages`,
      "POST",
      message,
    );
    status("message_repeat", repeat, [200, 201]);
    check("message_idempotent", repeat.data.id === sent.data.id);
    const received = await clients.seller.api(`conversations/${cid}/messages`);
    status("seller_read_message", received, 200);
    check(
      "seller_received_message",
      received.data.some((x: any) => x.id === sent.data.id),
    );
    status(
      "outsider_conversation_api_denied",
      await clients.outsider.api(`conversations/${cid}/messages`),
      [403, 404],
    );
    const directHidden = await direct(
      `/rest/v1/messages?conversation_id=eq.${cid}&select=id,body`,
      "outsider",
    );
    status("direct_messages_other_query", directHidden, 200);
    check(
      "rls_other_member_cannot_read_messages",
      Array.isArray(directHidden.data) && directHidden.data.length === 0,
    );
    const visitRequest = await clients.buyer.api(
      `conversations/${cid}/visits`,
      "POST",
      { proposedAt: null, clientRequestId: randomUUID() },
    );
    status("visit_request", visitRequest, 201);
    const vid = visitRequest.data.id;
    artifacts.visitIds.push(vid);
    await saveArtifacts();
    const nullAction = await rpc("gp_visit_decision", "buyer", {
      p_id: vid,
      p_action: null,
      p_version: visitRequest.data.version,
      p_confirmed_at: null,
    });
    status("visit_null_action_refused", nullAction, 400);
    check(
      "visit_null_action_validation",
      String(nullAction.data?.message || "").includes("VALIDATION_ERROR"),
      nullAction,
    );
    status(
      "buyer_cannot_accept_own_visit",
      await clients.buyer.api(`visits/${vid}/decision`, "POST", {
        version: visitRequest.data.version,
        action: "accept",
        confirmedAt: null,
      }),
      403,
    );
    const accepted = await clients.seller.api(
      `visits/${vid}/decision`,
      "POST",
      {
        version: visitRequest.data.version,
        action: "accept",
        confirmedAt: null,
      },
    );
    status("seller_accepts_without_time", accepted, 200);
    check(
      "accepted_is_not_confirmed",
      accepted.data.status === "accepted" && accepted.data.confirmedAt === null,
    );
    const confirmedAt = new Date(Date.now() + 86400000).toISOString();
    const confirmed = await clients.seller.api(
      `visits/${vid}/decision`,
      "POST",
      { version: accepted.data.version, action: "accept", confirmedAt },
    );
    status("seller_confirms_time", confirmed, 200);
    check(
      "visit_confirmed_with_time",
      confirmed.data.status === "confirmed" &&
        new Date(confirmed.data.confirmedAt).getTime() ===
          new Date(confirmedAt).getTime(),
    );
    status(
      "stale_visit_version_refused",
      await clients.seller.api(`visits/${vid}/decision`, "POST", {
        version: accepted.data.version,
        action: "cancel",
      }),
      409,
    );
    const cancelled = await clients.buyer.api(
      `visits/${vid}/decision`,
      "POST",
      { version: confirmed.data.version, action: "cancel" },
    );
    status("participant_cancels", cancelled, 200);
    check("visit_cancelled", cancelled.data.status === "cancelled");
    const withdrawn = await clients.seller.api(
      `listings/${id}/lifecycle`,
      "POST",
      { version: approved.data.version, action: "withdraw" },
    );
    status("seller_withdraws_listing", withdrawn, 200);
    status(
      "withdrawn_listing_not_public",
      await guest.api(`listings/${id}`),
      404,
    );
    status(
      "private_history_preserved",
      await clients.buyer.api(`conversations/${cid}/messages`),
      200,
    );
    const removedMedia = await guest.media(mediaUrls[0]);
    check(
      "withdrawn_image_not_anonymously_readable",
      [401, 403, 404].includes(removedMedia.status),
    );
    status(
      "remove_favorite",
      await clients.buyer.api(`favorites/${id}`, "DELETE"),
      200,
    );
    for (const persona of ["seller", "buyer", "outsider", "moderator"] as const)
      status(
        `${persona}_logout`,
        await clients[persona].api("auth/logout", "POST", {}),
        200,
      );
    artifacts.status = "passed";
  } catch (error) {
    failed =
      error instanceof Error && checks.some((c) => c.name === error.message)
        ? error.message
        : "configuration_or_transport_failure";
    artifacts.status = "failed";
  }
  if (configReady) await saveArtifacts();
  await mkdir("docs/qa", { recursive: true });
  const report = {
    timestamp: new Date().toISOString(),
    scope:
      "Next HTTP + confirmed GoTrue accounts + direct PostgREST/Storage with publishable key",
    status: failed ? "failed" : "passed",
    checks,
    passed: checks.filter((c) => c.passed).length,
    failedCheck: failed,
    credentialsIncluded: false,
    fixtures:
      "Ignored .data/supabase-qa-result.json; coordinator must clean up exact IDs",
    emailsSent: false,
    limitations: [
      "No signup/confirmation/recovery email delivery test",
      "No production deployment",
      "No verification of a real parking model",
    ],
    sources: [
      "https://supabase.com/docs/reference/javascript/auth-signinwithpassword",
      "https://supabase.com/docs/guides/database/postgres/row-level-security",
      "https://supabase.com/changelog/45329-breaking-change-tables-not-exposed-to-data-and-graphql-api-automatically",
    ],
  };
  await writeFile(
    "docs/qa/supabase-integration.json",
    JSON.stringify(report, null, 2) + "\n",
  );
  console.log(
    JSON.stringify({
      status: report.status,
      passed: report.passed,
      failedCheck: failed,
      report: "docs/qa/supabase-integration.json",
      cleanupInventory: ".data/supabase-qa-result.json",
    }),
  );
  if (failed) process.exitCode = 1;
}
void main().catch(() => {
  console.error("Supabase verification could not write its sanitized report.");
  process.exitCode = 1;
});
