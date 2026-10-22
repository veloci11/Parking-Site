/** Opt-in HTTP/GoTrue/PostgREST/Storage recipe for030/031. Never starts a server,
 * signs up a user, sends email, changes a role/policy or applies SQL. Coordinator
 * provisions exactly five .invalid fixtures in the private0600 QA configuration.
 * Run: npx tsx scripts/verify-connected-offers-modeling.ts --run
 * Exact objects/IDs are persisted before the next request for scoped cleanup.
 */
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile, chmod, stat } from "node:fs/promises";
import { createServerClient } from "@supabase/ssr";
import sharp from "sharp";
import { emptyCommercialDetails } from "../src/lib/commercial-details";
import type { Listing } from "../src/lib/types";
import {
  QaStrongSession,
  confirmQaLocation,
  linkQaPublication,
  type QaAdmin,
} from "./qa-publication-contract";
type Persona = "seller" | "buyer" | "outsider" | "moderator" | "admin";
type Config = {
  origin: string;
  supabaseUrl: string;
  publishableKey: string;
  users: Record<Persona, QaAdmin>;
};
type Reply = {
  status: number;
  data: any;
  raw?: any;
  code?: string;
  cache?: string | null;
};
const reportFile = "docs/qa/connected-offers-modeling.json";
const inventoryFile = ".data/connected-offers-modeling-artifacts.json";
const checks: {
  name: string;
  passed: boolean;
  httpStatus?: number;
  code?: string;
}[] = [];
const artifacts = {
  runId: randomUUID(),
  userIds: [] as string[],
  listingIds: [] as string[],
  media: [] as { id: string; listingId: string; objectKey: string }[],
  registrySiteIds: [] as string[],
  registryLevelIds: [] as string[],
  registrySpaceIds: [] as string[],
  mfaFactorIds: [] as string[],
  conversationIds: [] as string[],
  messageIds: [] as string[],
  visitIds: [] as string[],
  withdrawn: false,
  status: "prepared",
  cleanup: "not-yet-performed",
};
let config: Config;
async function privateJson(path: string, value: unknown) {
  await writeFile(path, JSON.stringify(value, null, 2) + "\n", { mode: 0o600 });
  await chmod(path, 0o600);
}
async function saveArtifacts() {
  await mkdir(".data", { recursive: true });
  await privateJson(inventoryFile, artifacts);
  // Existing exact cleanup tool accepts this current five-user manifest.
  await privateJson(".data/supabase-qa-result.json", artifacts);
}
async function record(kind: string, id: string) {
  const ids = (artifacts as any)[kind] as string[];
  assert.ok(Array.isArray(ids) && typeof id === "string");
  if (!ids.includes(id)) ids.push(id);
  await saveArtifacts();
}
function check(name: string, value: unknown, reply?: Reply) {
  checks.push({
    name,
    passed: !!value,
    ...(reply
      ? {
          httpStatus: reply.status,
          ...(reply.code ? { code: reply.code } : {}),
        }
      : {}),
  });
  assert.ok(value, name);
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
        ...this.headers(),
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
        i = pair.indexOf("="),
        name = pair.slice(0, i),
        value = pair.slice(i + 1);
      if (value) this.cookies.set(name, value);
      else this.cookies.delete(name);
    }
    const raw = await response.json().catch(() => null);
    return {
      status: response.status,
      data: raw?.data,
      code: raw?.code,
      raw,
      cache: response.headers.get("cache-control"),
    };
  }
  headers(): Record<string, string> {
    return this.cookies.size
      ? { Cookie: [...this.cookies].map(([k, v]) => `${k}=${v}`).join("; ") }
      : {};
  }
  async file(path: string) {
    assert.ok(
      path.startsWith("/api/"),
      "Media URL must stay on reviewed application origin",
    );
    return fetch(config.origin + path, {
      headers: this.headers(),
      signal: AbortSignal.timeout(40000),
    });
  }
  sdk() {
    return createServerClient(config.supabaseUrl, config.publishableKey, {
      cookies: {
        getAll: () =>
          [...this.cookies].map(([name, value]) => ({
            name,
            value: decodeURIComponent(value),
          })),
        setAll: (values) => {
          for (const { name, value } of values)
            if (value) this.cookies.set(name, value);
            else this.cookies.delete(name);
        },
      },
    });
  }
}
async function direct(
  client: Client | null,
  path: string,
  method = "GET",
  payload?: unknown,
): Promise<Reply> {
  const token = client
    ? (await client.sdk().auth.getSession()).data.session?.access_token
    : undefined;
  if (client) assert.ok(token, "Fixture direct request needs its own session");
  const response = await fetch(config.supabaseUrl + path, {
    method,
    signal: AbortSignal.timeout(40000),
    headers: {
      apikey: config.publishableKey,
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(payload ? { "Content-Type": "application/json" } : {}),
    },
    body: payload ? JSON.stringify(payload) : undefined,
  });
  const raw = await response.json().catch(() => null);
  return { status: response.status, data: raw, code: raw?.code };
}
async function uploadPhotos(
  owner: Client,
  ownerId: string,
  listingId: string,
  guest: Client,
  outsider: Client,
) {
  const photos: string[] = [];
  for (let i = 0; i < 3; i++) {
    const image = await sharp(
      Buffer.from(
        `<svg xmlns="http://www.w3.org/2000/svg" width="900" height="600"><rect width="900" height="600" fill="#ddd5c5"/><path d="M0 600L210 180H690L900 600Z" fill="#64676c"/><path d="M180 550L310 230H380L300 550ZM570 550L520 230H600L700 550Z" fill="none" stroke="white" stroke-width="6"/><rect x="20" y="20" width="860" height="110" fill="white"/><text x="40" y="62" font-family="Arial" font-size="27">RECETTE FICTIVE — VUE ${i + 1}/3</text><text x="40" y="100" font-family="Arial" font-size="20">Image synthetique : aucun parking reel</text></svg>`,
      ),
    )
      .withExif({ IFD0: { Artist: "GP synthetic fixture" } })
      .jpeg()
      .toBuffer();
    const form = new FormData();
    form.set("listingId", listingId);
    form.set(
      "file",
      new Blob([new Uint8Array(image)], { type: "image/jpeg" }),
      `recette-fictive-${i + 1}.jpg`,
    );
    const uploaded = await owner.api("uploads", "POST", form);
    status(`photo_${artifacts.media.length + 1}_upload_http`, uploaded, 201);
    const id = uploaded.data.id,
      url = uploaded.data.url;
    assert.match(id, /^[a-f0-9-]{36}$/);
    photos.push(url);
    artifacts.media.push({
      id,
      listingId,
      objectKey: `${ownerId}/${listingId}/${id}.webp`,
    });
    await saveArtifacts();
    const n = artifacts.media.length;
    check(
      `photo_${n}_guest_denied_before_publication`,
      [401, 403, 404].includes((await guest.file(url)).status),
    );
    check(
      `photo_${n}_outsider_denied_before_publication`,
      [401, 403, 404].includes((await outsider.file(url)).status),
    );
    const own = await owner.file(url);
    check(`photo_${n}_owner_read`, own.status === 200);
    const meta = await sharp(Buffer.from(await own.arrayBuffer())).metadata();
    check(`photo_${n}_webp_without_exif`, meta.format === "webp" && !meta.exif);
    const otherStorage = await outsider
      .sdk()
      .storage.from("private-uploads")
      .download(artifacts.media.at(-1)!.objectKey);
    check(
      `photo_${n}_direct_storage_ownership_enforced`,
      !!otherStorage.error && !otherStorage.data,
    );
  }
  return photos;
}
const note =
  "RECETTE FICTIVE — note strictement privée pour préparation manuelle, aucun plan réel.";
async function main() {
  if (!process.argv.includes("--run")) {
    console.info(
      "Prepared only. Coordinator provisions five dedicated fixtures, then runs: npx tsx scripts/verify-connected-offers-modeling.ts --run. Never starts a server or sends email.",
    );
    return;
  }
  let failure: string | null = null;
  const deferredFailures: string[] = [];
  let inventoryOwned = false;
  let adminMfa: QaStrongSession | undefined,
    moderatorMfa: QaStrongSession | undefined;
  const guest = new Client(),
    clients = {
      seller: new Client(),
      buyer: new Client(),
      outsider: new Client(),
      moderator: new Client(),
      admin: new Client(),
    };
  try {
    assert.equal(
      (await stat(".data/supabase-qa.json")).mode & 0o077,
      0,
      "QA configuration must be private",
    );
    config = JSON.parse(await readFile(".data/supabase-qa.json", "utf8"));
    assert.equal(config.origin, "http://127.0.0.1:3001");
    assert.equal(
      new URL(config.supabaseUrl).hostname,
      "srrmysturoloovpuuojp.supabase.co",
    );
    assert.ok(
      config.publishableKey && !config.publishableKey.startsWith("sb_secret_"),
    );
    for (const [persona, user] of Object.entries(config.users)) {
      assert.match(
        user.email,
        new RegExp(`^qa-${persona}-[a-f0-9]+@parking-test\\.invalid$`),
      );
      assert.ok(user.id && user.password);
      artifacts.userIds.push(user.id);
    }
    assert.equal(new Set(artifacts.userIds).size, 5);
    const prior = await readFile(inventoryFile, "utf8").then(
      (value) => JSON.parse(value),
      (error) => {
        if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
        throw error;
      },
    );
    if (prior?.listingIds?.length || prior?.media?.length) {
      assert.fail(
        "Clean up the recorded prior fixture graph before rerunning; its inventory must never be overwritten",
      );
    }
    inventoryOwned = true;
    await saveArtifacts();
    const mode = await guest.api("session");
    status("connected_session_http", mode, 200);
    check(
      "real_supabase_backend_selected",
      mode.raw.mode === "supabase" && mode.data === null,
    );
    status(
      "demo_login_unavailable",
      await guest.api("auth/demo", "POST", { persona: "admin" }),
      404,
    );
    status("local_mailbox_unavailable", await guest.api("local-mailbox"), 404);
    for (const persona of Object.keys(clients) as Persona[]) {
      const login = await clients[persona].api("auth/login", "POST", {
        email: config.users[persona].email,
        password: config.users[persona].password,
      });
      status(`${persona}_real_gotrue_cookie_login`, login, 200);
      check(
        `${persona}_verified_identity`,
        login.data?.id === config.users[persona].id &&
          login.data?.emailVerified === true,
      );
      check(
        `${persona}_server_role`,
        login.data.role ===
          (persona === "moderator" || persona === "admin" ? persona : "member"),
      );
      check(
        `${persona}_session_cookie_persisted`,
        (await clients[persona].api("session")).data?.id ===
          config.users[persona].id,
      );
    }
    for (const actor of [
      "seller",
      "buyer",
      "outsider",
      "moderator",
      "admin",
    ] as const)
      status(
        `${actor}_aal1_modeling_queue_refused`,
        await clients[actor].api("admin/modeling-requests"),
        403,
      );
    adminMfa = new QaStrongSession(
      clients.admin.api.bind(clients.admin),
      config.users.admin,
      "admin_mfa",
      record,
      check,
    );
    moderatorMfa = new QaStrongSession(
      clients.moderator.api.bind(clients.moderator),
      config.users.moderator,
      "moderator_mfa",
      record,
      check,
    );
    await adminMfa.establish("admin");
    await moderatorMfa.establish("moderator");
    status(
      "moderator_aal2_still_cannot_read_modeling_queue",
      await clients.moderator.api("admin/modeling-requests"),
      403,
    );
    status(
      "admin_queue_limit_bounded",
      await clients.admin.api("admin/modeling-requests?limit=101"),
      400,
    );
    const created = await clients.seller.api("listings", "POST", {
      pricingMode: "per_space",
      spaces: Array.from({ length: 5 }, (_, i) => ({
        id: randomUUID(),
        number: String(18 + i),
        level: i === 2 || i === 4 ? -2 : -1,
        areaM2: null,
        lengthM: null,
        widthM: null,
        clearanceM: null,
        offer: {
          transactionType: i < 3 ? "sale" : "rent",
          priceCents: 0,
          status: "available",
        },
      })),
    });
    status("mixed_zero_price_private_draft_created", created, 201);
    let draft = created.data as Listing;
    await record("listingIds", draft.id);
    check(
      "five_zero_prices_allowed_in_draft",
      draft.spaces.length === 5 &&
        draft.spaces.every((s) => s.offer?.priceCents === 0),
    );
    status(
      "outsider_private_draft_hidden",
      await clients.outsider.api(`listings/${draft.id}?draft=1`),
      404,
    );
    const directDraft = await direct(
      clients.outsider,
      `/rest/v1/listings?id=eq.${draft.id}&select=id`,
    );
    status("direct_draft_rls_query", directDraft, 200);
    check("direct_draft_rls_no_rows", directDraft.data.length === 0);
    status(
      "offer_owner_injection_refused",
      await clients.seller.api(`listings/${draft.id}`, "PATCH", {
        version: draft.version,
        spaces: [
          {
            ...draft.spaces[0],
            offer: { ...draft.spaces[0].offer, ownerId: config.users.admin.id },
          },
        ],
      }),
      400,
    );
    const path = `listings/${draft.id}/modeling-request`;
    const initial = await clients.seller.api(path);
    status("own_initial_modeling_followup", initial, 200);
    check("modeling_initially_optional_null", initial.data === null);
    status(
      "modeling_status_injection_refused",
      await clients.seller.api(path, "POST", { note, status: "ready" }),
      400,
    );
    status(
      "modeling_note_length_bounded",
      await clients.seller.api(path, "POST", { note: "a".repeat(2001) }),
      400,
    );
    const requested = await clients.seller.api(path, "POST", { note });
    status("owner_requests_manual_modeling", requested, 200);
    check(
      "request_private_dto",
      requested.data.note === note &&
        requested.data.status === "requested" &&
        requested.data.version === 1 &&
        requested.data.ownerId === undefined &&
        requested.data.actorId === undefined &&
        requested.cache?.includes("no-store"),
    );
    const repeated = await clients.seller.api(path, "POST", {
      note: "Do not replace the first note",
    });
    status("request_replay_http", repeated, 200);
    check(
      "request_replay_immutable",
      JSON.stringify(repeated.data) === JSON.stringify(requested.data),
    );
    for (const actor of ["buyer", "outsider"] as const) {
      status(
        `${actor}_private_request_hidden`,
        await clients[actor].api(path),
        404,
      );
      status(
        `${actor}_foreign_request_creation_refused`,
        await clients[actor].api(path, "POST", {}),
        404,
      );
    }
    status("guest_request_read_refused", await guest.api(path), 401);
    const columns =
      "listing_id,note,status,requested_at,updated_at,row_version";
    const ownRest = await direct(
      clients.seller,
      `/rest/v1/parking_modeling_requests?listing_id=eq.${draft.id}&select=${columns}`,
    );
    status("own_request_direct_read", ownRest, 200);
    check(
      "own_request_direct_scope",
      ownRest.data.length === 1 && ownRest.data[0].note === note,
    );
    const hiddenRest = await direct(
      clients.outsider,
      `/rest/v1/parking_modeling_requests?listing_id=eq.${draft.id}&select=${columns}`,
    );
    status("other_request_rls_read", hiddenRest, 200);
    check("other_request_rls_empty", hiddenRest.data.length === 0);
    status(
      "private_actor_columns_not_selectable",
      await direct(
        clients.seller,
        "/rest/v1/parking_modeling_requests?select=owner_id,actor_id",
      ),
      [401, 403],
    );
    status(
      "direct_owner_status_write_denied",
      await direct(
        clients.seller,
        `/rest/v1/parking_modeling_requests?listing_id=eq.${draft.id}`,
        "PATCH",
        { status: "ready" },
      ),
      [401, 403],
    );
    status(
      "anonymous_request_table_denied",
      await direct(
        null,
        `/rest/v1/parking_modeling_requests?select=${columns}`,
      ),
      [401, 403],
    );
    const queue = await clients.admin.api("admin/modeling-requests?limit=25");
    status("admin_aal2_queue_read", queue, 200);
    check(
      "queue_single_private_request",
      queue.data.requests.filter(
        (r: any) => r.listingId === draft.id && r.note === note,
      ).length === 1 && queue.data.total === 1,
    );
    const started = await clients.admin.api(
      "admin/modeling-requests",
      "PATCH",
      {
        listingId: draft.id,
        version: requested.data.version,
        status: "in_progress",
      },
    );
    status("admin_starts_manual_preparation", started, 200);
    check("status_version_increment", started.data.version === 2);
    for (const actor of ["seller", "moderator"] as const)
      status(
        `${actor}_status_change_denied`,
        await clients[actor].api("admin/modeling-requests", "PATCH", {
          listingId: draft.id,
          version: 2,
          status: "ready",
        }),
        403,
      );
    status(
      "stale_modeling_version_refused",
      await clients.admin.api("admin/modeling-requests", "PATCH", {
        listingId: draft.id,
        version: 1,
        status: "ready",
      }),
      409,
    );
    const noOp = await clients.admin.api("admin/modeling-requests", "PATCH", {
      listingId: draft.id,
      version: 2,
      status: "in_progress",
    });
    status("same_status_retry_http", noOp, 200);
    check("same_status_no_new_version", noOp.data.version === 2);
    check(
      "owner_sees_in_progress",
      (await clients.seller.api(path)).data.status === "in_progress",
    );
    const photos = await uploadPhotos(
      clients.seller,
      config.users.seller.id,
      draft.id,
      guest,
      clients.outsider,
    );
    const saved = await clients.seller.api(`listings/${draft.id}`, "PATCH", {
      version: draft.version,
      title: "RECETTE FICTIVE — cinq offres mixtes Paris 12e",
      description:
        "Annonce synthétique exclusivement réservée à la recette HTTP connectée. Images, caractéristiques, prix et adresse sont fictifs. Aucun bien réel, aucune propriété ni expertise terrain ne sont revendiqués.",
      city: "Paris",
      district: "Bercy",
      address: "Adresse fictive privée de recette",
      coordinates: [2.3739, 48.8446],
      publicCoordinates: [2.38, 48.85],
      locationPrecision: "area",
      commercialDetails: { ...emptyCommercialDetails(), postalCode: "75012" },
      type: "covered",
      occupancy: "vacant",
      photos,
      quality: {
        floor: "Fictif",
        lighting: "Non évalué",
        humidity: "Non évaluée",
        access: "Fictif",
        maneuver: "Aucun essai réel",
        observations: "Recette synthétique uniquement",
      },
      spaces: draft.spaces.map((s, i) => ({
        ...s,
        areaM2: [12, 15, 16, 11, 20][i],
        lengthM: 5,
        widthM: [12, 15, 16, 11, 20][i] / 5,
        clearanceM: 2.1,
        offer: {
          ...s.offer!,
          priceCents: [2800000, 2900000, 4000000, 15000, 16000][i],
        },
      })),
    });
    status("idf_mixed_draft_saved", saved, 200);
    draft = saved.data;
    draft = await confirmQaLocation(
      clients.seller.api.bind(clients.seller),
      draft,
    );
    check(
      "separate_location_preview_confirmation",
      !!draft.locationConfirmedAt,
    );
    const submitted = await clients.seller.api(
      `listings/${draft.id}/submit`,
      "POST",
      { version: draft.version, ownershipAttested: true },
    );
    status("mixed_submission_pending", submitted, 200);
    draft = submitted.data;
    status(
      "registry_required_before_publication",
      await clients.admin.api(`admin/revisions/${draft.id}/decision`, "POST", {
        version: draft.version,
        decision: "approve",
      }),
      409,
    );
    const linkedVersion = await linkQaPublication(
      clients.admin.api.bind(clients.admin),
      config.users.admin,
      draft,
      record,
    );
    check(
      "all_five_places_physically_mapped",
      artifacts.registrySpaceIds.length === 5,
    );
    const ready = await clients.admin.api("admin/modeling-requests", "PATCH", {
      listingId: draft.id,
      version: 2,
      status: "ready",
    });
    status("manual_preparation_ready", ready, 200);
    check(
      "owner_reads_ready",
      (await clients.seller.api(path)).data.status === "ready",
    );
    const replayReady = await clients.seller.api(path, "POST", {});
    check(
      "owner_cannot_reset_ready_or_note",
      replayReady.data.status === "ready" &&
        replayReady.data.note === note &&
        replayReady.data.version === ready.data.version,
    );
    status(
      "ready_does_not_publish_listing",
      await guest.api(`listings/${draft.id}`),
      404,
    );
    const pending = await clients.seller.api(`listings/${draft.id}?draft=1`);
    check(
      "ready_preserves_pending_commercial_revision",
      pending.data.status === "pending" &&
        pending.data.version === linkedVersion &&
        pending.data.sceneAvailable === false,
    );
    const scenes = await clients.seller.api("scenes?scope=mine");
    status("private_scene_inventory_read", scenes, 200);
    const sources = await clients.seller.api(
      `scenes/sources?listingId=${draft.id}`,
    );
    status("private_source_inventory_read", sources, 200);
    check(
      "ready_did_not_generate_scene",
      Array.isArray(scenes.data) &&
        scenes.data.length === 0 &&
        Array.isArray(sources.data) &&
        sources.data.length === 0,
    );
    const registry = await clients.admin.api(
      `admin/parking-registry?listingId=${draft.id}`,
    );
    check(
      "ready_did_not_generate_common_plan",
      registry.data.sites
        .filter((s: any) => artifacts.registrySiteIds.includes(s.id))
        .every((s: any) =>
          s.levels.every((l: any) => l.planVersion === 0 && !l.planState),
        ),
    );
    status(
      "prelink_version_stale",
      await clients.admin.api(`admin/revisions/${draft.id}/decision`, "POST", {
        version: draft.version,
        decision: "approve",
      }),
      409,
    );
    const approved = await clients.admin.api(
      `admin/revisions/${draft.id}/decision`,
      "POST",
      { version: linkedVersion, decision: "approve" },
    );
    status("mixed_listing_approved_normally", approved, 200);
    draft = approved.data;
    const published = await guest.api(`listings/${draft.id}`);
    status("published_mixed_public_read", published, 200);
    check(
      "public_five_individual_prices",
      published.data.pricingMode === "per_space" &&
        published.data.spaces.map((s: any) => s.offer.priceCents).join(",") ===
          "2800000,2900000,4000000,15000,16000",
    );
    check(
      "public_has_three_sales_two_monthly_rents",
      published.data.spaces.filter(
        (s: any) => s.offer.transactionType === "sale",
      ).length === 3 &&
        published.data.spaces.filter(
          (s: any) => s.offer.transactionType === "rent",
        ).length === 2,
    );
    check(
      "public_unit_aliases_hide_private_ids",
      published.data.spaces.every(
        (s: any) => !draft.spaces.some((unit) => unit.id === s.id),
      ),
    );
    check(
      "public_never_contains_private_request_or_location",
      !JSON.stringify(published.data).includes(note) &&
        published.data.sellerId === undefined &&
        published.data.address === undefined &&
        !JSON.stringify(published.data).includes(config.users.seller.id),
    );
    const publicPhoto = await guest.file(photos[0]);
    check("approved_photo_public_read", publicPhoto.status === 200);
    check(
      "approved_photo_real_webp",
      (await sharp(Buffer.from(await publicPhoto.arrayBuffer())).metadata())
        .format === "webp",
    );
    const approvedStorage = await clients.buyer
      .sdk()
      .storage.from("public-approved")
      .download(`${artifacts.media[0].id}.webp`);
    check(
      "approved_storage_sdk_read_allowed_by_publication",
      !approvedStorage.error && !!approvedStorage.data,
    );
    const cases: [string, string, number, number?][] = [
      [
        "sale_individual_budget",
        "transactionType=sale&priceMin=2850000&priceMax=2950000",
        1,
        2900000,
      ],
      [
        "rental_individual_budget",
        "transactionType=rent&priceMax=15500",
        1,
        15000,
      ],
      ["sale_budget_too_low", "transactionType=sale&priceMax=2700000", 0],
      [
        "same_space_price_area_required",
        "transactionType=sale&priceMax=3000000&areaMin=16",
        0,
      ],
      [
        "same_space_rent_area_required",
        "transactionType=rent&priceMax=15500&areaMin=20",
        0,
      ],
      [
        "same_space_matching_area_level",
        "transactionType=sale&priceMax=4100000&areaMin=16&level=-2",
        1,
        4000000,
      ],
    ];
    for (const [name, query, expected, price] of cases) {
      const result = await guest.api(`listings?ids=${draft.id}&${query}`);
      status(`${name}_http`, result, 200);
      check(
        name,
        result.data.length === expected &&
          result.data.filter((x: any) => x.id === draft.id).length === expected,
      );
      if (price)
        check(
          `${name}_contextual_price`,
          result.data[0].catalogMatch?.priceCents === price,
        );
    }
    // A separate legacy lot proves contextual sorting/keyset pagination against
    // another listing; its physical site is deliberately distinct from the five places.
    const legacyCreated = await clients.seller.api("listings", "POST", {
      pricingMode: "lot",
    });
    status("legacy_lot_created_without_conversion", legacyCreated, 201);
    let legacy = legacyCreated.data as Listing;
    await record("listingIds", legacy.id);
    const legacyPhotos = await uploadPhotos(
      clients.seller,
      config.users.seller.id,
      legacy.id,
      guest,
      clients.outsider,
    );
    const legacySaved = await clients.seller.api(
      `listings/${legacy.id}`,
      "PATCH",
      {
        version: legacy.version,
        pricingMode: "lot",
        transactionType: "sale",
        priceCents: 3200000,
        title: "RECETTE FICTIVE — ancien prix de lot Paris 12e",
        description:
          "Lot synthétique séparé, réservé à la recette de compatibilité et de pagination. Les images et caractéristiques sont fictives. Aucun bien réel, aucune transaction ni expertise ne sont revendiqués.",
        city: "Paris",
        district: "Bercy",
        address: "Adresse fictive privée du lot de recette",
        coordinates: [2.3739, 48.8446],
        publicCoordinates: [2.38, 48.85],
        locationPrecision: "area",
        commercialDetails: { ...emptyCommercialDetails(), postalCode: "75012" },
        type: "covered",
        occupancy: "vacant",
        photos: legacyPhotos,
        quality: draft.quality,
        spaces: [
          {
            ...legacy.spaces[0],
            number: "QA-LEGACY",
            level: -1,
            areaM2: 15,
            lengthM: 5,
            widthM: 3,
            clearanceM: 2.1,
          },
        ],
      },
    );
    status("legacy_total_price_saved", legacySaved, 200);
    legacy = await confirmQaLocation(
      clients.seller.api.bind(clients.seller),
      legacySaved.data,
    );
    const legacySubmitted = await clients.seller.api(
      `listings/${legacy.id}/submit`,
      "POST",
      { version: legacy.version, ownershipAttested: true },
    );
    status("legacy_lot_submitted", legacySubmitted, 200);
    const legacyLinked = await linkQaPublication(
      clients.admin.api.bind(clients.admin),
      config.users.admin,
      legacySubmitted.data,
      record,
    );
    const legacyApproved = await clients.admin.api(
      `admin/revisions/${legacy.id}/decision`,
      "POST",
      { version: legacyLinked, decision: "approve" },
    );
    status("legacy_lot_approved", legacyApproved, 200);
    legacy = legacyApproved.data;
    const legacyPublic = await guest.api(`listings/${legacy.id}`);
    check(
      "legacy_price_remains_whole_lot",
      legacyPublic.data.priceCents === 3200000 &&
        legacyPublic.data.pricingMode === "lot" &&
        legacyPublic.data.spaces.every((s: any) => s.offer === undefined),
    );
    const idsQuery = `ids=${draft.id},${legacy.id}&transactionType=sale&sort=price_asc&limit=1`;
    const firstPage = await guest.api(`listings?${idsQuery}`);
    status("price_sorted_first_page", firstPage, 200);
    check(
      "total_counts_two_listings_once_before_limit",
      firstPage.raw.total === 2 &&
        firstPage.data.length === 1 &&
        firstPage.data[0].id === draft.id &&
        !!firstPage.raw.nextCursor,
    );
    const nextPage = await guest.api(
      `listings?${idsQuery}&cursor=${encodeURIComponent(firstPage.raw.nextCursor)}`,
    );
    status("price_sorted_keyset_next_page", nextPage, 200);
    check(
      "cursor_has_no_duplicate_listing",
      nextPage.raw.total === 2 &&
        nextPage.data.length === 1 &&
        nextPage.data[0].id === legacy.id &&
        !nextPage.raw.nextCursor,
    );
    const contextualSort = await guest.api(
      `listings?${idsQuery}&priceMin=3000000`,
    );
    status("contextual_offer_price_sort_http", contextualSort, 200);
    check(
      "sort_uses_matching_offer_not_global_minimum",
      contextualSort.raw.total === 2 &&
        contextualSort.data[0].id === legacy.id &&
        contextualSort.data[0].priceCents === 3200000,
    );
    const areaPage = await guest.api(
      `listings?${idsQuery}&areaMin=16&priceMax=4100000`,
    );
    status("same_offer_filter_before_page_limit", areaPage, 200);
    check(
      "same_offer_total_and_price_before_limit",
      areaPage.raw.total === 1 &&
        areaPage.data.length === 1 &&
        areaPage.data[0].id === draft.id &&
        areaPage.data[0].catalogMatch.priceCents === 4000000 &&
        !areaPage.raw.nextCursor,
    );
    status(
      "sale_cursor_rejected_for_rental_context",
      await guest.api(
        `listings?ids=${draft.id},${legacy.id}&transactionType=rent&sort=price_asc&limit=1&cursor=${encodeURIComponent(firstPage.raw.nextCursor)}`,
      ),
      400,
    );
    const secondRequest = await clients.seller.api(
      `listings/${legacy.id}/modeling-request`,
      "POST",
      {
        note: "Autre demande synthétique privée pour vérifier le filtre de file.",
      },
    );
    status("second_optional_manual_request", secondRequest, 200);
    const declined = await clients.admin.api(
      "admin/modeling-requests",
      "PATCH",
      {
        listingId: legacy.id,
        status: "declined",
        version: secondRequest.data.version,
      },
    );
    status("admin_declines_second_manual_request", declined, 200);
    const readyQueue = await clients.admin.api(
      "admin/modeling-requests?status=ready&limit=1",
    );
    status("admin_queue_status_filter_http", readyQueue, 200);
    check(
      "admin_queue_status_filtered_total",
      readyQueue.data.total === 1 &&
        readyQueue.data.requests.length === 1 &&
        readyQueue.data.requests[0].listingId === draft.id &&
        !readyQueue.data.hasMore,
    );
    const ownerExport = await clients.seller.api("me/export", "POST", {
      password: config.users.seller.password,
    });
    status("reauthenticated_owner_export_includes_requests", ownerExport, 200);
    check(
      "own_manual_notes_exported_without_staff_attribution",
      ownerExport.data.modelingRequests.length === 2 &&
        ownerExport.data.modelingRequests.some(
          (r: any) => r.listingId === draft.id && r.note === note,
        ) &&
        ownerExport.data.modelingRequests.every(
          (r: any) =>
            r.ownerId === undefined &&
            r.actorId === undefined &&
            r.actor_id === undefined,
        ),
    );
    const contact = await clients.buyer.api("conversations", "POST", {
      listingId: draft.id,
    });
    status("buyer_contacts_public_seller", contact, [200, 201]);
    await record("conversationIds", contact.data.id);
    const message = await clients.buyer.api(
      `conversations/${contact.data.id}/messages`,
      "POST",
      {
        body: "RECETTE FICTIVE — aucun engagement réel",
        clientRequestId: randomUUID(),
      },
    );
    status("private_message_sent", message, 201);
    if (message.data.id) await record("messageIds", message.data.id);
    status(
      "third_party_conversation_hidden",
      await clients.outsider.api(`conversations/${contact.data.id}/messages`),
      [403, 404],
    );
    const edited = await clients.seller.api(`listings/${draft.id}`, "PATCH", {
      version: draft.version,
      spaces: draft.spaces.map((s, i) =>
        i === 0 ? { ...s, offer: { ...s.offer!, priceCents: 3100000 } } : s,
      ),
    });
    status("commercial_revision_saved", edited, 200);
    check(
      "previous_price_stays_public_before_review",
      (await guest.api(`listings/${draft.id}`)).data.spaces[0].offer
        .priceCents === 2800000,
    );
    const resubmitted = await clients.seller.api(
      `listings/${draft.id}/submit`,
      "POST",
      { version: edited.data.version, ownershipAttested: true },
    );
    status("commercial_revision_resubmitted", resubmitted, 200);
    const revised = await clients.admin.api(
      `admin/revisions/${draft.id}/decision`,
      "POST",
      { version: resubmitted.data.version, decision: "approve" },
    );
    status("price_change_approved_without_registry_rebind", revised, 200);
    draft = revised.data;
    check(
      "reviewed_price_now_public",
      (await guest.api(`listings/${draft.id}`)).data.spaces[0].offer
        .priceCents === 3100000,
    );
    const statuses = [
      "available",
      "reserved",
      "sold",
      "rented",
      "available",
    ] as const;
    const availability = await clients.seller.api(
      `listings/${draft.id}`,
      "PATCH",
      {
        version: draft.version,
        spaces: draft.spaces.map((s, i) => ({
          ...s,
          offer: { ...s.offer!, status: statuses[i] },
        })),
      },
    );
    status("individual_status_revision_saved", availability, 200);
    check(
      "previous_availability_until_review",
      (await guest.api(`listings/${draft.id}`)).data.spaces.every(
        (s: any) => s.offer.status === "available",
      ),
    );
    const pendingStatus = await clients.seller.api(
      `listings/${draft.id}/submit`,
      "POST",
      { version: availability.data.version, ownershipAttested: true },
    );
    status("status_revision_submitted", pendingStatus, 200);
    const approvedStatus = await clients.admin.api(
      `admin/revisions/${draft.id}/decision`,
      "POST",
      { version: pendingStatus.data.version, decision: "approve" },
    );
    status(
      "status_change_approved_without_registry_rebind",
      approvedStatus,
      200,
    );
    draft = approvedStatus.data;
    check(
      "published_reserved_sold_rented_states",
      (await guest.api(`listings/${draft.id}`)).data.spaces
        .map((s: any) => s.offer.status)
        .join(",") === statuses.join(","),
    );
    for (const [name, query, expected] of [
      ["reserved_sold_excluded", "transactionType=sale&priceMax=3000000", 0],
      ["remaining_sale_included", "transactionType=sale&priceMax=3200000", 1],
      ["rented_excluded", "transactionType=rent&priceMax=15500", 0],
      ["remaining_rental_included", "transactionType=rent&priceMax=16000", 1],
    ] as const) {
      const result = await guest.api(`listings?ids=${draft.id}&${query}`);
      status(`${name}_http`, result, 200);
      check(name, result.data.length === expected);
    }
    status(
      "legacy_lot_withdrawn",
      await clients.seller.api(`listings/${legacy.id}/lifecycle`, "POST", {
        version: legacy.version,
        action: "withdraw",
      }),
      200,
    );
    status(
      "legacy_lot_hidden_after_withdrawal",
      await guest.api(`listings/${legacy.id}`),
      404,
    );
    const withdrawal = await clients.seller.api(
      `listings/${draft.id}/lifecycle`,
      "POST",
      { version: draft.version, action: "withdraw" },
    );
    status("owner_withdraws_publication", withdrawal, 200);
    artifacts.withdrawn = true;
    await saveArtifacts();
    status(
      "withdrawn_listing_404",
      await guest.api(`listings/${draft.id}`),
      404,
    );
    const afterWithdrawal = await guest.api(
      `listings?ids=${draft.id}&transactionType=sale`,
    );
    status("withdrawn_catalog_http", afterWithdrawal, 200);
    check("withdrawn_catalog_empty", afterWithdrawal.data.length === 0);
    check(
      "withdrawn_photo_private_again",
      [401, 403, 404].includes((await guest.file(photos[0])).status),
    );
    const publicStorage = await direct(
      null,
      `/storage/v1/object/public/public-approved/${artifacts.media[0].id}.webp`,
    );
    check(
      "approved_bucket_has_no_unconditional_public_route",
      [400, 401, 403, 404].includes(publicStorage.status),
    );
    const withdrawnStorage = await clients.buyer
      .sdk()
      .storage.from("public-approved")
      .download(`${artifacts.media[0].id}.webp`);
    const freshOriginStorage = await clients.buyer
      .sdk()
      .storage.from("public-approved")
      .download(
        `${artifacts.media[0].id}.webp`,
        { cacheNonce: String(Date.now()) },
        { cache: "no-store" },
      );
    check(
      "withdrawn_fresh_origin_storage_sdk_read_denied",
      !!freshOriginStorage.error && !freshOriginStorage.data,
    );
    // Keep the immediate/default-URL revocation assertion: an origin denial
    // does not make previously cached CDN bytes inaccessible retroactively.
    const cachedReadDenied = !!withdrawnStorage.error && !withdrawnStorage.data;
    checks.push({
      name: "withdrawn_approved_storage_sdk_read_denied",
      passed: cachedReadDenied,
    });
    if (!cachedReadDenied)
      deferredFailures.push("withdrawn_approved_storage_sdk_read_denied");
    status(
      "conversation_preserved_after_withdrawal",
      await clients.buyer.api(`conversations/${contact.data.id}/messages`),
      200,
    );
    check(
      "private_modeling_followup_preserved_after_withdrawal",
      (await clients.seller.api(path)).data.status === "ready",
    );
    failure ||= deferredFailures[0] ?? null;
    artifacts.status = failure ? "failed" : "passed";
  } catch (error) {
    failure =
      error instanceof assert.AssertionError
        ? String(error.message).split("\n")[0]
        : "connected_recipe_failed_inspect_private_context_without_credentials";
    artifacts.status = "failed";
  } finally {
    for (const strong of [moderatorMfa, adminMfa]) {
      try {
        await strong?.cleanup();
      } catch {
        failure ||= "qa_factor_cleanup_failed";
      }
    }
    if (config)
      for (const persona of Object.keys(clients) as Persona[]) {
        try {
          const logout = await clients[persona].api("auth/logout", "POST", {});
          status(`${persona}_logged_out`, logout, 200);
        } catch {
          failure ||= "fixture_logout_failed";
        }
      }
    if (inventoryOwned) await saveArtifacts();
  }
  await mkdir("docs/qa", { recursive: true });
  await writeFile(
    reportFile,
    JSON.stringify(
      {
        checkedAt: new Date().toISOString(),
        status: failure ? "failed" : "passed-pending-exact-fixture-cleanup",
        scope: "real-connected-http-offers030-manual-modeling031",
        origin: config?.origin,
        project: "srrmysturoloovpuuojp",
        backend:
          "real Supabase GoTrue/PostgREST/Storage via loopback production build",
        passed: checks.filter((c) => c.passed).length,
        failedCheck: failure,
        deferredFailures,
        historicalBaseline: "docs/qa/connected-offers-modeling-221.json",
        checks,
        syntheticFixturesOnly: true,
        fixtureSetup:
          "Five coordinator-created .invalid identities, email confirmed directly for these fixtures only; no email sent. Signup delivery is not tested.",
        mfa: {
          realTotp:
            checks.some(
              (c) => c.name === "admin_mfa_session_aal2" && c.passed,
            ) &&
            checks.some(
              (c) => c.name === "moderator_mfa_session_aal2" && c.passed,
            ),
          adminAal2: checks.some(
            (c) => c.name === "admin_mfa_session_aal2" && c.passed,
          ),
          moderatorAal2: checks.some(
            (c) => c.name === "moderator_mfa_session_aal2" && c.passed,
          ),
          factorsRevoked:
            !!adminMfa?.factorRevoked && !!moderatorMfa?.factorRevoked,
        },
        withdrawn: artifacts.withdrawn,
        cleanup:
          "Exact DB dependency, Storage SDK and Auth cleanup still required",
        cleanupInventory: inventoryFile,
        automatedModeling: false,
        actualSceneGenerated: false,
        actualArchiveBuilt: false,
        externalEmailSent: false,
        humanAuthCreated: false,
        publicDeployment: false,
        sqlRollbackClaimedAsHttp: false,
      },
      null,
      2,
    ) + "\n",
  );
  console.info(
    JSON.stringify({
      status: failure ? "failed" : "passed-pending-exact-fixture-cleanup",
      passed: checks.filter((c) => c.passed).length,
      failedCheck: failure,
      report: reportFile,
      inventory: inventoryFile,
      withdrawn: artifacts.withdrawn,
      factorsRevoked:
        !!adminMfa?.factorRevoked && !!moderatorMfa?.factorRevoked,
    }),
  );
  if (failure) process.exitCode = 1;
}
void main().catch(() => {
  console.error(
    "Connected fixture recipe stopped; inspect private context without exposing credentials.",
  );
  process.exitCode = 1;
});
