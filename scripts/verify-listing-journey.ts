/** Local dedicated-fixture journey. Never starts a server, builds, calls Supabase or sends email.
 * --prepare creates a private disposable SQLite runtime and three synthetic PNG inputs.
 * The coordinator starts the production build on loopback with the runtime environment.
 * --run exercises the actual HTTP routes; --cleanup removes only this folder after both QA ports close.
 */
import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import {
  mkdir,
  mkdtemp,
  readFile,
  writeFile,
  rm,
  access,
} from "node:fs/promises";
import { resolve, join, dirname } from "node:path";
import sharp from "sharp";
import { emptyCommercialDetails } from "../src/lib/commercial-details";
import type { Listing } from "../src/lib/types";
import {
  locationFromSuggestion,
  type AddressSuggestion,
} from "../src/lib/address-search";
type Runtime = {
  runId: string;
  folder: string;
  origin: string;
  fixtureGuard: { id: string; email: string; password: string };
  password: string;
  environment: Record<string, string>;
  photos: string[];
};
type Reply = { status: number; data: any; raw: any; code?: string };
const runtimeFile = resolve(".data/listing-journey-current.json");
const reportFile = resolve("docs/qa/listing-journey-http.json");
const checks: {
  name: string;
  passed: boolean;
  status?: number;
  code?: string;
}[] = [];
function check(name: string, value: unknown, reply?: Reply) {
  checks.push({
    name,
    passed: !!value,
    ...(reply
      ? { status: reply.status, ...(reply.code ? { code: reply.code } : {}) }
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
async function privateJson(path: string, value: unknown) {
  await writeFile(path, JSON.stringify(value, null, 2) + "\n", { mode: 0o600 });
}
function validateRuntime(runtime: Runtime) {
  assert.match(runtime.origin, /^http:\/\/(127\.0\.0\.1|localhost):\d+$/);
  assert.ok(
    runtime.folder.startsWith(resolve(".data/listing-journey-")) &&
      !runtime.folder.includes(".."),
  );
  assert.equal(runtime.environment.GP_FORCE_LOCAL_DEMO, "true");
  assert.equal(
    runtime.environment.GP_DATABASE_PATH,
    join(runtime.folder, "qa.sqlite"),
  );
  assert.match(
    runtime.fixtureGuard.email,
    /^qa-journey-guard-.+@test\.invalid$/,
  );
  assert.equal(runtime.photos.length, 3);
  assert.ok(
    runtime.photos.every(
      (path) => dirname(path) === join(runtime.folder, "photos"),
    ),
  );
}
async function prepare() {
  const alreadyPrepared = await access(runtimeFile).then(
    () => true,
    () => false,
  );
  assert.equal(
    alreadyPrepared,
    false,
    "Clean up the previous dedicated runtime before preparing another one",
  );
  await mkdir(resolve(".data"), { recursive: true });
  const folder = await mkdtemp(resolve(".data/listing-journey-"));
  const runId = randomUUID();
  const origin = `http://127.0.0.1:${Number(process.env.GP_JOURNEY_PORT || 3002)}`;
  const password = randomBytes(28).toString("base64url") + "Aa1!";
  const runtime: Runtime = {
    runId,
    folder,
    origin,
    password,
    fixtureGuard: {
      id: randomUUID(),
      email: `qa-journey-guard-${runId}@test.invalid`,
      password: randomBytes(28).toString("base64url") + "Aa1!",
    },
    environment: {
      GP_FORCE_LOCAL_DEMO: "true",
      GP_LOCAL_DEMO: "true",
      GP_DATABASE_PATH: join(folder, "qa.sqlite"),
      GP_MEDIA_PATH: join(folder, "media"),
      GP_EXPORT_PATH: join(folder, "exports"),
      NEXT_PUBLIC_SITE_URL: origin,
    },
    photos: ["01-contexte.png", "02-acces.png", "03-place.png"].map((name) =>
      join(folder, "photos", name),
    ),
  };
  validateRuntime(runtime);
  await mkdir(join(folder, "photos"), { recursive: true });
  for (let index = 0; index < runtime.photos.length; index++) {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1280" height="800" viewBox="0 0 1280 800">
<rect width="1280" height="800" fill="#dedad3"/><rect x="0" y="0" width="1280" height="170" fill="#3d4147"/>
<path d="M0 800 L260 210 L1020 210 L1280 800Z" fill="#73777b"/>
<path d="M560 800 L610 210 M740 800 L670 210" stroke="#ead9a2" stroke-width="7" stroke-dasharray="35 22"/>
${[0, 1, 2].map((n) => `<path d="M${80 + n * 135} 680 L${300 + n * 80} 280 L${380 + n * 80} 280 L${210 + n * 135} 680Z" fill="none" stroke="white" stroke-width="5"/>`).join("")}
<rect x="850" y="285" width="95" height="230" fill="#aaa59c"/><rect x="873" y="305" width="49" height="120" fill="#cd8f57"/>
<path d="M965 400 L1090 680 L1190 680 L1025 400Z" fill="none" stroke="white" stroke-width="5"/>
<rect x="35" y="28" width="1210" height="100" rx="8" fill="#faf7f0"/>
<text x="65" y="70" font-family="Arial,sans-serif" font-size="29" font-weight="bold" fill="#333">RECETTE FICTIVE — ${["VUE GENERALE", "ACCES ET MANOEUVRE", "PLACE ET DIMENSIONS"][index]}</text>
<text x="65" y="106" font-family="Arial,sans-serif" font-size="20" fill="#555">Image synthetique de test : aucun bien reel, aucune plaque, aucune personne.</text>
<rect x="35" y="720" width="1210" height="52" fill="#faf7f0"/><text x="58" y="755" font-family="Arial,sans-serif" font-size="24" fill="#333">Vue ${index + 1}/3 — Paris 12e — dossier local jetable</text>
</svg>`;
    await sharp(Buffer.from(svg)).png().toFile(runtime.photos[index]);
  }
  // Matches the existing verify-local-http fixture pattern, in this new folder only.
  Object.assign(process.env, runtime.environment);
  const { db, resetDbForTests } = await import("../src/server/db");
  const { passwordHash } = await import("../src/server/security");
  db()
    .prepare(
      "INSERT INTO users(id,name,email,password,role,verified,status,created_at) VALUES(?,?,?,?, 'member',1,'active',?)",
    )
    .run(
      runtime.fixtureGuard.id,
      "Garde de recette locale fictive",
      runtime.fixtureGuard.email,
      passwordHash(runtime.fixtureGuard.password),
      new Date().toISOString(),
    );
  resetDbForTests();
  await privateJson(runtimeFile, runtime);
  console.info(
    JSON.stringify({
      status: "prepared_only",
      origin,
      database: runtime.environment.GP_DATABASE_PATH,
      media: runtime.environment.GP_MEDIA_PATH,
      exports: runtime.environment.GP_EXPORT_PATH,
      photos: runtime.photos,
      privateRuntime: runtimeFile,
      serverStarted: false,
      credentialsPrinted: false,
    }),
  );
}
class Client {
  cookies = new Map<string, string>();
  constructor(readonly runtime: Runtime) {}
  async api(path: string, method = "GET", body?: unknown): Promise<Reply> {
    const form = body instanceof FormData;
    const response = await fetch(`${this.runtime.origin}/api/${path}`, {
      method,
      redirect: "manual",
      cache: "no-store",
      signal: AbortSignal.timeout(30000),
      headers: {
        Origin: this.runtime.origin,
        Cookie: [...this.cookies]
          .map(([name, value]) => `${name}=${value}`)
          .join("; "),
        ...(body && !form ? { "Content-Type": "application/json" } : {}),
      },
      ...(body ? { body: form ? body : JSON.stringify(body) } : {}),
    });
    for (const cookie of response.headers.getSetCookie()) {
      const pair = cookie.split(";")[0],
        index = pair.indexOf("=");
      if (pair.slice(index + 1))
        this.cookies.set(pair.slice(0, index), pair.slice(index + 1));
      else this.cookies.delete(pair.slice(0, index));
    }
    const raw = await response.json().catch(() => null);
    return { status: response.status, data: raw?.data, code: raw?.code, raw };
  }
  async file(path: string) {
    return fetch(this.runtime.origin + path, {
      cache: "no-store",
      signal: AbortSignal.timeout(30000),
      headers: {
        Cookie: [...this.cookies]
          .map(([name, value]) => `${name}=${value}`)
          .join("; "),
      },
    });
  }
}
async function run(runtime: Runtime) {
  let failure: string | null = null;
  const listingIds: string[] = [];
  const identities: {
    client: Client;
    id: string;
    email: string;
    persona: string;
  }[] = [];
  const keepPublished = process.argv.includes("--keep-published");
  let retainedPublished = false;
  let reviewUrl: string | null = null;
  let conversationId: string | null = null;
  const uploadedPhotos: string[] = [];
  const guest = new Client(runtime),
    seller = new Client(runtime),
    buyer = new Client(runtime),
    outsider = new Client(runtime),
    admin = new Client(runtime),
    moderator = new Client(runtime);
  let localMfaSupported: boolean | null = null;
  try {
    const mode = await guest.api("session");
    status("local_http_session", mode, 200);
    check("local_demo_only", mode.raw?.mode === "demo");
    const guard = new Client(runtime);
    const checked = await guard.api("auth/login", "POST", {
      email: runtime.fixtureGuard.email,
      password: runtime.fixtureGuard.password,
    });
    status("dedicated_database_guard_login", checked, 200);
    check(
      "dedicated_database_identity_matches",
      checked.data.id === runtime.fixtureGuard.id,
    );
    await guard.api("auth/logout", "POST", {});
    const register = async (client: Client, persona: string) => {
      const policy = await client.api("auth/commands/policy");
      status(`${persona}_versioned_policy`, policy, 200);
      const email = `qa-journey-${persona}-${randomUUID()}@test.invalid`;
      const result = await client.api("auth/commands/register", "POST", {
        name: `Recette ${persona} fictive`,
        email,
        password: runtime.password,
        sellerType: "private",
        termsAccepted: true,
        termsVersion: policy.data.termsVersion,
        privacyVersion: policy.data.privacyVersion,
        next: "/deposer",
      });
      status(`${persona}_normal_registration`, result, 201);
      const session = await client.api("session");
      check(
        `${persona}_member_without_admin_rights`,
        session.data?.role === "member",
      );
      check(
        `${persona}_email_initially_unconfirmed`,
        session.data?.emailVerified === false,
      );
      identities.push({ client, id: session.data.id, email, persona });
    };
    const verify = async (client: Client, persona: string) => {
      const mailbox = await client.api("local-mailbox");
      status(`${persona}_private_local_mailbox`, mailbox, 200);
      const token = mailbox.data.find(
        (item: any) => item.type === "verify",
      )?.token;
      check(
        `${persona}_own_local_verification_token`,
        typeof token === "string",
      );
      status(
        `${persona}_confirm_local_email`,
        await client.api("auth/verify", "POST", { token }),
        200,
      );
      check(
        `${persona}_verified_member`,
        (await client.api("session")).data?.emailVerified === true,
      );
    };
    await register(seller, "vendeur");
    const created = await seller.api("listings", "POST", {
      pricingMode: "per_space",
      spaces: Array.from({ length: 5 }, (_, index) => ({
        id: randomUUID(),
        number: String(18 + index),
        level: -1,
        areaM2: null,
        lengthM: null,
        widthM: null,
        clearanceM: null,
        offer: {
          transactionType: index < 3 ? "sale" : "rent",
          priceCents: 0,
          status: "available",
        },
      })),
    });
    status("seller_creates_private_draft", created, 201);
    let draft = created.data as Listing;
    listingIds.push(draft.id);
    status(
      "unverified_seller_submission_refused",
      await seller.api(`listings/${draft.id}/submit`, "POST", {
        version: draft.version,
        ownershipAttested: true,
      }),
      403,
    );
    status(
      "guest_cannot_read_draft",
      await guest.api(`listings/${draft.id}`),
      404,
    );
    await verify(seller, "vendeur");
    for (const [client, persona] of [
      [buyer, "acheteur"],
      [outsider, "tiers"],
    ] as const) {
      await register(client, persona);
      await verify(client, persona);
    }
    status(
      "named_demo_admin_login",
      await admin.api("auth/demo", "POST", { persona: "admin" }),
      200,
    );
    check(
      "demo_admin_is_actually_admin",
      (await admin.api("session")).data.role === "admin",
    );
    status(
      "moderator_login",
      await moderator.api("auth/demo", "POST", { persona: "moderator" }),
      200,
    );
    status(
      "member_admin_queue_refused",
      await buyer.api("admin/revisions"),
      403,
    );
    status(
      "moderator_registry_refused",
      await moderator.api("admin/parking-registry"),
      403,
    );
    const mfa = await admin.api("mfa");
    status("admin_mfa_policy_read", mfa, 200);
    localMfaSupported = mfa.data.supported;
    check(
      "demo_does_not_fake_aal2",
      mfa.data.supported === false && mfa.data.currentLevel === null,
    );
    status(
      "demo_mfa_enrollment_explicitly_unavailable",
      await admin.api("mfa/enroll", "POST", {}),
      503,
    );
    status(
      "outsider_cannot_read_draft",
      await outsider.api(`listings/${draft.id}?draft=1`),
      404,
    );
    status(
      "outsider_cannot_edit_draft",
      await outsider.api(`listings/${draft.id}`, "PATCH", {
        version: draft.version,
        title: "Modification étrangère interdite",
      }),
      404,
    );
    const photos: string[] = [];
    for (let i = 0; i < runtime.photos.length; i++) {
      const bytes = await readFile(runtime.photos[i]);
      const form = new FormData();
      form.set("listingId", draft.id);
      form.set(
        "file",
        new Blob([new Uint8Array(bytes)], { type: "image/png" }),
        `recette-fictive-${i + 1}.png`,
      );
      const uploaded = await seller.api("uploads", "POST", form);
      status(`documentary_synthetic_photo_${i + 1}_uploaded`, uploaded, 201);
      photos.push(uploaded.data.url);
      uploadedPhotos.push(uploaded.data.url);
      check(
        `photo_${i + 1}_private_before_publication`,
        [401, 403, 404].includes((await guest.file(uploaded.data.url)).status),
      );
    }
    const suggestions = await seller.api("geocode?q=75012");
    status(
      "address_search_or_municipality_fallback_available",
      suggestions,
      200,
    );
    const sector =
      (suggestions.data as AddressSuggestion[]).find(
        (item) =>
          item.city === "Paris" &&
          item.postalCode === "75012" &&
          item.kind === "municipality",
      ) ||
      (suggestions.data as AddressSuggestion[]).find(
        (item) => item.city === "Paris" && item.postalCode === "75012",
      );
    check("coherent_paris_sector_selected_from_autocomplete", !!sector);
    const { sceneAvailable: _sceneAvailability, ...selectedLocation } =
      locationFromSuggestion(sector!, false, draft);
    check(
      "approximate_selection_contains_no_exact_address",
      selectedLocation.locationPrecision === "area" &&
        selectedLocation.address === "" &&
        JSON.stringify(selectedLocation.coordinates) ===
          JSON.stringify(selectedLocation.publicCoordinates),
    );
    const saved = await seller.api(`listings/${draft.id}`, "PATCH", {
      version: draft.version,
      title: "RECETTE FICTIVE — 5 places à vendre et louer Paris 12e",
      description:
        "Annonce synthétique réservée à la recette locale du parcours de dépôt. Les trois images, l’adresse et les caractéristiques constituent une fixture fictive. Aucun bien réel n’est proposé ni aucune expertise immobilière revendiquée.",
      ...selectedLocation,
      pricingMode: "per_space",
      type: "covered",
      occupancy: "vacant",
      annualChargesCents: 12000,
      propertyTaxCents: null,
      spaces: draft.spaces.map((space, index) => ({
        ...space,
        areaM2: 12,
        lengthM: 5,
        widthM: 2.4,
        clearanceM: 2.1,
        offer: {
          transactionType: index < 3 ? "sale" : "rent",
          priceCents: [2800000, 2900000, 3000000, 15000, 16000][index],
          status: "available",
        },
      })),
      quality: {
        floor: "Sol synthétique de recette, aucun constat terrain",
        lighting: "Éclairage déclaré de recette",
        humidity: "Non évaluée",
        access: "Badge — scénario fictif",
        maneuver: "Aucun essai réel",
        observations: "Informations fictives, non expertisées.",
      },
      photos: photos.slice(0, 2),
    });
    status("complete_idf_details_saved_with_two_photos", saved, 200);
    draft = saved.data;
    const insufficientPhotos = await seller.api(
      `listings/${draft.id}/submit`,
      "POST",
      {
        version: draft.version,
        ownershipAttested: true,
      },
    );
    status("minimum_three_photos_enforced", insufficientPhotos, 400);
    check(
      "minimum_photo_refusal_explains_documentary_requirement",
      /trois photos/i.test(insufficientPhotos.raw?.error || ""),
    );
    const third = await seller.api(`listings/${draft.id}`, "PATCH", {
      version: draft.version,
      photos,
    });
    status("three_photos_saved", third, 200);
    draft = third.data;
    const modelingNote =
      "RECETTE FICTIVE — note privée pour la préparation manuelle de cinq places.";
    const modelingPath = `listings/${draft.id}/modeling-request`;
    const initialModeling = await seller.api(modelingPath);
    status("owner_has_no_modeling_request_initially", initialModeling, 200);
    check(
      "optional_modeling_request_initially_null",
      initialModeling.data === null,
    );
    const requestedModeling = await seller.api(modelingPath, "POST", {
      note: modelingNote,
    });
    status("owner_requests_manual_modeling", requestedModeling, 200);
    check(
      "manual_modeling_request_starts_requested_with_private_note",
      requestedModeling.data.status === "requested" &&
        requestedModeling.data.note === modelingNote,
    );
    const repeatedModeling = await seller.api(modelingPath, "POST", {
      note: "Texte de réessai qui ne doit pas remplacer la note initiale.",
    });
    status(
      "manual_modeling_request_retry_is_idempotent",
      repeatedModeling,
      200,
    );
    check(
      "modeling_retry_preserves_note_status_and_version",
      JSON.stringify(repeatedModeling.data) ===
        JSON.stringify(requestedModeling.data),
    );
    for (const [client, persona] of [
      [buyer, "buyer"],
      [outsider, "outsider"],
    ] as const) {
      status(
        `${persona}_cannot_read_private_modeling_request`,
        await client.api(modelingPath),
        404,
      );
      status(
        `${persona}_cannot_request_modeling_for_foreign_listing`,
        await client.api(modelingPath, "POST", {}),
        404,
      );
    }
    status(
      "guest_cannot_read_private_modeling_request",
      await guest.api(modelingPath),
      401,
    );
    const modelingQueue = await admin.api("admin/modeling-requests?limit=100");
    status("admin_reads_manual_modeling_queue", modelingQueue, 200);
    check(
      "exactly_one_modeling_request_after_retry",
      modelingQueue.data.requests.filter(
        (item: any) => item.listingId === draft.id,
      ).length === 1,
    );
    check(
      "admin_queue_contains_owners_private_note",
      modelingQueue.data.requests.find(
        (item: any) => item.listingId === draft.id,
      )?.note === modelingNote,
    );
    for (const [client, persona] of [
      [seller, "owner"],
      [moderator, "moderator"],
    ] as const) {
      status(
        `${persona}_cannot_read_admin_modeling_queue`,
        await client.api("admin/modeling-requests"),
        403,
      );
      status(
        `${persona}_cannot_decide_manual_modeling_status`,
        await client.api("admin/modeling-requests", "PATCH", {
          listingId: draft.id,
          status: "ready",
          version: requestedModeling.data.version,
        }),
        403,
      );
    }
    const inProgressModeling = await admin.api(
      "admin/modeling-requests",
      "PATCH",
      {
        listingId: draft.id,
        status: "in_progress",
        version: requestedModeling.data.version,
      },
    );
    status("admin_starts_manual_modeling", inProgressModeling, 200);
    check(
      "admin_modeling_update_increments_own_version",
      inProgressModeling.data.status === "in_progress" &&
        inProgressModeling.data.version === requestedModeling.data.version + 1,
    );
    status(
      "stale_manual_modeling_decision_refused",
      await admin.api("admin/modeling-requests", "PATCH", {
        listingId: draft.id,
        status: "ready",
        version: requestedModeling.data.version,
      }),
      409,
    );
    const ownerModeling = await seller.api(modelingPath);
    status("owner_reads_manual_modeling_followup", ownerModeling, 200);
    check(
      "owner_sees_in_progress_without_internal_actor_or_owner_identifiers",
      ownerModeling.data.status === "in_progress" &&
        ownerModeling.data.actorId === undefined &&
        ownerModeling.data.ownerId === undefined,
    );
    const preview = await seller.api(`listings/${draft.id}/preview`);
    status("private_public_projection_preview", preview, 200);
    check(
      "private_address_absent_from_area_preview",
      preview.data.address === undefined,
    );
    check(
      "private_modeling_note_absent_from_public_projection_preview",
      !JSON.stringify(preview.data).includes(modelingNote),
    );
    check(
      "preview_uses_authorized_public_sector",
      JSON.stringify(preview.data.coordinates) ===
        JSON.stringify(selectedLocation.publicCoordinates),
    );
    const confirmed = await seller.api(`listings/${draft.id}`, "PATCH", {
      version: draft.version,
      locationConfirmedAt: new Date().toISOString(),
    });
    status("location_confirmed_after_saved_preview", confirmed, 200);
    draft = confirmed.data;
    status(
      "ownership_attestation_required",
      await seller.api(`listings/${draft.id}/submit`, "POST", {
        version: draft.version,
      }),
      400,
    );
    const submitted = await seller.api(`listings/${draft.id}/submit`, "POST", {
      version: draft.version,
      ownershipAttested: true,
    });
    status("seller_submission_enters_review", submitted, 200);
    draft = submitted.data;
    check("submission_is_pending", draft.status === "pending");
    status(
      "pending_listing_still_not_public",
      await guest.api(`listings/${draft.id}`),
      404,
    );
    status(
      "buyer_cannot_approve",
      await buyer.api(`admin/revisions/${draft.id}/decision`, "POST", {
        version: draft.version,
        decision: "approve",
      }),
      403,
    );
    const queue = await admin.api("admin/revisions");
    status("admin_review_queue", queue, 200);
    check(
      "admin_sees_exact_pending_version",
      queue.data.some(
        (row: any) => row.id === draft.id && row.version === draft.version,
      ),
    );
    status(
      "physical_registry_required_before_approval",
      await admin.api(`admin/revisions/${draft.id}/decision`, "POST", {
        version: draft.version,
        decision: "approve",
      }),
      [400, 409],
    );
    const site = await admin.api("admin/parking-registry", "POST", {
      action: "create_site",
      publicName: "Parking fictif de recette Paris",
      internalReference: `${runtime.runId}-${randomUUID()}`,
      exactAddress: "Adresse fictive privée — recette locale",
      coordinates: draft.coordinates,
    });
    status("admin_creates_fictional_physical_site", site, 200);
    const level = await admin.api("admin/parking-registry", "POST", {
      action: "add_level",
      siteId: site.data.id,
      code: "QA-SS1",
      label: "Niveau fictif -1",
      number: -1,
      sortOrder: 0,
    });
    status("admin_adds_physical_level", level, 200);
    const registryUnits: { unitId: string; spaceId: string }[] = [];
    for (const unit of draft.spaces) {
      const physical = await admin.api("admin/parking-registry", "POST", {
        action: "add_space",
        levelId: level.data.id,
        number: unit.number,
        privateLotReference: "LOT-FICTIF-QA",
        areaM2: unit.areaM2,
        lengthM: unit.lengthM,
        widthM: unit.widthM,
        clearanceM: unit.clearanceM,
      });
      status(
        `admin_adds_physical_unit_${registryUnits.length + 1}`,
        physical,
        200,
      );
      registryUnits.push({ unitId: unit.id, spaceId: physical.data.id });
    }
    const linked = await admin.api("admin/parking-registry", "POST", {
      action: "link_listing",
      listingId: draft.id,
      version: draft.version,
      siteId: site.data.id,
      units: registryUnits,
      reason:
        "Rapprochement fictif réservé à la recette locale ; aucune propriété réelle attestée.",
    });
    status("admin_links_pending_listing", linked, 200);
    const readyModeling = await admin.api("admin/modeling-requests", "PATCH", {
      listingId: draft.id,
      status: "ready",
      version: inProgressModeling.data.version,
    });
    status("admin_marks_manual_modeling_ready", readyModeling, 200);
    const followedModeling = await seller.api(modelingPath);
    status("owner_reads_ready_manual_modeling_followup", followedModeling, 200);
    check(
      "owner_sees_manual_modeling_ready",
      followedModeling.data.status === "ready",
    );
    const repeatedReadyModeling = await seller.api(modelingPath, "POST", {});
    status(
      "owner_retry_after_manual_modeling_ready",
      repeatedReadyModeling,
      200,
    );
    check(
      "owner_retry_cannot_reset_ready_status_or_private_note",
      repeatedReadyModeling.data.status === "ready" &&
        repeatedReadyModeling.data.note === modelingNote &&
        repeatedReadyModeling.data.version === readyModeling.data.version,
    );
    status(
      "manual_modeling_ready_does_not_publish_pending_listing",
      await guest.api(`listings/${draft.id}`),
      404,
    );
    const afterModeling = await seller.api(`listings/${draft.id}?draft=1`);
    status(
      "manual_modeling_independent_listing_version_read",
      afterModeling,
      200,
    );
    check(
      "manual_modeling_ready_keeps_pending_revision_and_no_scene",
      afterModeling.data.version === linked.data.version &&
        afterModeling.data.status === "pending" &&
        afterModeling.data.sceneAvailable === false,
    );
    const afterModelingRegistry = await admin.api(
      `admin/parking-registry?listingId=${draft.id}`,
    );
    status("manual_modeling_ready_registry_read", afterModelingRegistry, 200);
    const unchangedLevel = afterModelingRegistry.data.sites
      .find((item: any) => item.id === site.data.id)
      ?.levels.find((item: any) => item.id === level.data.id);
    check(
      "manual_modeling_ready_creates_no_common_level_plan",
      unchangedLevel?.planVersion === 0 && !unchangedLevel.planState,
    );
    status(
      "stale_prelink_moderation_version_refused",
      await admin.api(`admin/revisions/${draft.id}/decision`, "POST", {
        version: draft.version,
        decision: "approve",
      }),
      409,
    );
    const approved = await admin.api(
      `admin/revisions/${draft.id}/decision`,
      "POST",
      { version: linked.data.version, decision: "approve" },
    );
    status("admin_approves_and_publishes", approved, 200);
    draft = approved.data;
    const published = await guest.api(`listings/${draft.id}`);
    status("buyer_can_consult_published_offer", published, 200);
    check(
      "public_listing_contains_no_private_modeling_request",
      !JSON.stringify(published.data).includes(modelingNote) &&
        published.data.modelingRequest === undefined &&
        published.data.sceneAvailable === false,
    );
    check(
      "sale_price_and_idf_postal_persist",
      published.data.pricingMode === "per_space" &&
        published.data.spaces.length === 5 &&
        published.data.spaces.filter(
          (space: any) => space.offer?.transactionType === "sale",
        ).length === 3 &&
        published.data.spaces.filter(
          (space: any) => space.offer?.transactionType === "rent",
        ).length === 2 &&
        published.data.spaces[0].offer.priceCents === 2800000 &&
        published.data.spaces[4].offer.priceCents === 16000 &&
        published.data.commercialDetails.postalCode === "75012",
    );
    check(
      "private_location_and_owner_identifiers_hidden",
      published.data.address === undefined &&
        published.data.sellerId === undefined &&
        published.data.email === undefined &&
        !JSON.stringify(published.data).includes("LOT-FICTIF-QA"),
    );
    for (const [name, query, expected] of [
      [
        "mixed_listing_once_in_sale_search",
        "transactionType=sale&priceMax=2850000",
        1,
      ],
      [
        "mixed_listing_once_in_rental_search",
        "transactionType=rent&priceMax=15500",
        1,
      ],
      [
        "sale_budget_uses_a_matching_individual_price",
        "transactionType=sale&priceMin=2850000&priceMax=2950000",
        1,
      ],
      [
        "sale_budget_too_low_excludes_listing",
        "transactionType=sale&priceMax=2700000",
        0,
      ],
      [
        "rent_budget_too_low_excludes_listing",
        "transactionType=rent&priceMax=14900",
        0,
      ],
    ] as const) {
      const result = await guest.api(`listings?ids=${draft.id}&${query}`);
      status(`${name}_http`, result, 200);
      check(
        name,
        result.data.length === expected &&
          result.data.filter((item: any) => item.id === draft.id).length ===
            expected,
      );
    }
    const image = await guest.file(photos[0]);
    check("approved_photo_publicly_readable", image.status === 200);
    const metadata = await sharp(
      Buffer.from(await image.arrayBuffer()),
    ).metadata();
    check(
      "approved_photo_webp_and_exif_free",
      metadata.format === "webp" && !metadata.exif,
    );
    const conversation = await buyer.api("conversations", "POST", {
      listingId: draft.id,
    });
    status("buyer_can_contact_published_seller", conversation, [200, 201]);
    conversationId = conversation.data.id;
    status(
      "buyer_message_sent_once",
      await buyer.api(
        `conversations/${conversation.data.id}/messages`,
        "POST",
        {
          body: "Message fictif de recette locale : aucun engagement commercial réel.",
          clientRequestId: randomUUID(),
        },
      ),
      201,
    );
    status(
      "outsider_private_conversation_refused",
      await outsider.api(`conversations/${conversation.data.id}/messages`),
      [403, 404],
    );
    const edited = await seller.api(`listings/${draft.id}`, "PATCH", {
      version: draft.version,
      spaces: draft.spaces.map((space, index) =>
        index === 0
          ? { ...space, offer: { ...space.offer!, priceCents: 3100000 } }
          : space,
      ),
    });
    status("seller_changes_published_private_revision", edited, 200);
    check(
      "old_approved_price_visible_until_review",
      (await guest.api(`listings/${draft.id}`)).data.spaces[0].offer
        .priceCents === 2800000,
    );
    const resubmitted = await seller.api(
      `listings/${draft.id}/submit`,
      "POST",
      { version: edited.data.version, ownershipAttested: true },
    );
    status("seller_resubmits_revision", resubmitted, 200);
    const rejected = await admin.api(
      `admin/revisions/${draft.id}/decision`,
      "POST",
      {
        version: resubmitted.data.version,
        decision: "reject",
        reason:
          "Recette fictive : nouvelle information à préciser avant validation.",
      },
    );
    status("admin_requests_revision_with_reason", rejected, 200);
    check(
      "rejected_revision_keeps_approved_public_price",
      (await guest.api(`listings/${draft.id}`)).data.spaces[0].offer
        .priceCents === 2800000,
    );
    const retried = await seller.api(`listings/${draft.id}/submit`, "POST", {
      version: rejected.data.version,
      ownershipAttested: true,
    });
    status("seller_can_resubmit_after_moderation_refusal", retried, 200);
    const revised = await admin.api(
      `admin/revisions/${draft.id}/decision`,
      "POST",
      { version: retried.data.version, decision: "approve" },
    );
    status("admin_approves_changed_price", revised, 200);
    draft = revised.data;
    check(
      "new_price_visible_after_review",
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
    const availability = await seller.api(`listings/${draft.id}`, "PATCH", {
      version: draft.version,
      spaces: draft.spaces.map((space, index) => ({
        ...space,
        offer: { ...space.offer!, status: statuses[index] },
      })),
    });
    status(
      "seller_updates_individual_availability_without_closing_listing",
      availability,
      200,
    );
    check(
      "approved_statuses_remain_visible_until_review",
      (await guest.api(`listings/${draft.id}`)).data.spaces.every(
        (space: any) => space.offer.status === "available",
      ),
    );
    const availabilitySubmitted = await seller.api(
      `listings/${draft.id}/submit`,
      "POST",
      { version: availability.data.version, ownershipAttested: true },
    );
    status("availability_revision_submitted", availabilitySubmitted, 200);
    const availabilityApproved = await admin.api(
      `admin/revisions/${draft.id}/decision`,
      "POST",
      { version: availabilitySubmitted.data.version, decision: "approve" },
    );
    status("admin_approves_individual_availability", availabilityApproved, 200);
    draft = availabilityApproved.data;
    const withStatuses = await guest.api(`listings/${draft.id}`);
    status(
      "listing_stays_public_with_remaining_available_units",
      withStatuses,
      200,
    );
    check(
      "individual_reserved_sold_rented_states_persist",
      withStatuses.data.spaces
        .map((space: any) => space.offer.status)
        .join(",") === statuses.join(","),
    );
    for (const [name, query, expected] of [
      [
        "reserved_and_sold_sales_are_excluded_from_budget",
        "transactionType=sale&priceMax=3000000",
        0,
      ],
      [
        "available_sale_keeps_listing_visible",
        "transactionType=sale&priceMax=3200000",
        1,
      ],
      [
        "rented_unit_is_excluded_from_rental_budget",
        "transactionType=rent&priceMax=15500",
        0,
      ],
      [
        "available_rental_keeps_same_listing_visible",
        "transactionType=rent&priceMax=16000",
        1,
      ],
    ] as const) {
      const result = await guest.api(`listings?ids=${draft.id}&${query}`);
      status(`${name}_http`, result, 200);
      check(name, result.data.length === expected);
    }
    const adminDraft = await admin.api("listings", "POST", {});
    status("admin_can_create_own_ordinary_draft", adminDraft, 201);
    listingIds.push(adminDraft.data.id);
    status(
      "seller_cannot_edit_admin_owned_draft",
      await seller.api(`listings/${adminDraft.data.id}`, "PATCH", {
        version: adminDraft.data.version,
        title: "Usurpation interdite",
      }),
      404,
    );
    const adminPhotos: string[] = [];
    for (let index = 0; index < runtime.photos.length; index++) {
      const bytes = await readFile(runtime.photos[index]);
      const form = new FormData();
      form.set("listingId", adminDraft.data.id);
      form.set(
        "file",
        new Blob([new Uint8Array(bytes)], { type: "image/png" }),
        `recette-admin-location-${index + 1}.png`,
      );
      const uploaded = await admin.api("uploads", "POST", form);
      status(`admin_own_photo_${index + 1}_uploaded`, uploaded, 201);
      adminPhotos.push(uploaded.data.url);
    }
    const adminSaved = await admin.api(
      `listings/${adminDraft.data.id}`,
      "PATCH",
      {
        version: adminDraft.data.version,
        pricingMode: "lot",
        title: "RECETTE FICTIVE — location mensuelle Paris 12e",
        description:
          "Annonce de location fictive pour vérifier le dépôt ordinaire avec le rôle administrateur. Les images et les caractéristiques sont synthétiques, sans parking réel ni engagement commercial.",
        city: "Paris",
        district: "Bercy",
        address: "Adresse fictive privée de recette admin",
        coordinates: [2.3739, 48.8446],
        publicCoordinates: [2.38, 48.85],
        locationPrecision: "area",
        commercialDetails: { ...emptyCommercialDetails(), postalCode: "75012" },
        transactionType: "rent",
        priceCents: 15000,
        type: "covered",
        photos: adminPhotos,
        spaces: [
          {
            id: randomUUID(),
            number: "QA-RENT",
            level: -1,
            areaM2: 12,
            lengthM: 5,
            widthM: 2.4,
            clearanceM: 2.1,
          },
        ],
      },
    );
    status("admin_completes_own_monthly_rent_offer", adminSaved, 200);
    status(
      "admin_consults_own_public_preview",
      await admin.api(`listings/${adminDraft.data.id}/preview`),
      200,
    );
    const adminConfirmed = await admin.api(
      `listings/${adminDraft.data.id}`,
      "PATCH",
      {
        version: adminSaved.data.version,
        locationConfirmedAt: new Date().toISOString(),
      },
    );
    status("admin_confirms_own_public_location", adminConfirmed, 200);
    const adminSubmitted = await admin.api(
      `listings/${adminDraft.data.id}/submit`,
      "POST",
      {
        version: adminConfirmed.data.version,
        ownershipAttested: true,
      },
    );
    status(
      "admin_submits_own_offer_through_ordinary_workflow",
      adminSubmitted,
      200,
    );
    const rentQueue = await moderator.api("admin/revisions");
    status("moderator_reads_pending_admin_offer", rentQueue, 200);
    check(
      "pending_offer_preserves_monthly_total_rent",
      rentQueue.data.some(
        (row: any) =>
          row.id === adminDraft.data.id &&
          row.transactionType === "rent" &&
          row.priceCents === 15000,
      ),
    );
    const rentRefused = await moderator.api(
      `admin/revisions/${adminDraft.data.id}/decision`,
      "POST",
      {
        version: adminSubmitted.data.version,
        decision: "reject",
        reason:
          "Recette fictive terminée : cette location ne sera pas publiée.",
      },
    );
    status("moderator_can_refuse_synthetic_admin_offer", rentRefused, 200);
    status(
      "admin_withdraws_own_fixture_offer",
      await admin.api(`listings/${adminDraft.data.id}/lifecycle`, "POST", {
        version: rentRefused.data.version,
        action: "withdraw",
      }),
      200,
    );
    if (keepPublished) {
      check(
        "published_fixture_retained_for_coordinator_review",
        (await guest.api(`listings/${draft.id}`)).status === 200,
      );
      retainedPublished = true;
      reviewUrl = `${runtime.origin}/annonces/${draft.id}/${encodeURIComponent(draft.slug)}`;
    } else {
      status(
        "seller_withdraws_published_offer",
        await seller.api(`listings/${draft.id}/lifecycle`, "POST", {
          version: draft.version,
          action: "withdraw",
        }),
        200,
      );
      status(
        "withdrawn_offer_not_public",
        await guest.api(`listings/${draft.id}`),
        404,
      );
      check(
        "withdrawn_photo_no_longer_public",
        [401, 403, 404].includes((await guest.file(photos[0])).status),
      );
      status(
        "buyer_conversation_preserved_after_withdrawal",
        await buyer.api(`conversations/${conversation.data.id}/messages`),
        200,
      );
    }
  } catch (error) {
    failure =
      checks.findLast((item) => !item.passed)?.name ||
      "configuration_or_transport_failure";
    process.exitCode = 1;
  } finally {
    await privateJson(join(runtime.folder, "http-inventory.json"), {
      runId: runtime.runId,
      listingIds,
      userIds: identities.map((item) => item.id),
      identities: identities.map(({ id, email, persona }) => ({
        id,
        email,
        persona,
      })),
      conversationId,
      photos: uploadedPhotos,
      retainedPublished,
      cleanup:
        "discard_only_this_disposable_folder_after_coordinator_stops_servers",
    });
    await mkdir(dirname(reportFile), { recursive: true });
    const report = {
      checkedAt: new Date().toISOString(),
      status: failure
        ? "failed"
        : retainedPublished
          ? "passed_with_published_fixture_retained"
          : "passed",
      scope:
        "isolated-loopback-http-five-mixed-unit-offers-address-search-manual-modeling-publication-availability-legacy-lot",
      origin: runtime.origin,
      serverMode:
        process.env.GP_JOURNEY_SERVER_MODE || "coordinator_unspecified",
      passed: checks.filter((item) => item.passed).length,
      failedCheck: failure,
      checks,
      localMfaSupported,
      withdrawalDeferred: retainedPublished,
      retainedFixture: retainedPublished
        ? { listingId: listingIds[0], url: reviewUrl }
        : null,
      browserUiExercised: false,
      publicationContract:
        "one listing / five spaces / three sale offers / two monthly rental offers / individually versioned availability",
      browserAddressTypingExercised: false,
      publicDeployment: false,
      supabaseTouched: false,
      externalEmailSent: false,
      syntheticImages:
        "Three explicit fictional parking images, generated as SVG and uploaded as genuine PNG inputs through the application",
      cleanup: failure
        ? "incomplete journey; inspect failed checks before disposing this local-only fixture"
        : retainedPublished
          ? "published fixture retained for coordinator review; --withdraw required before final acceptance"
          : "withdrawal tested; disposable database folder removal awaits coordinator shutdown",
      limitations: [
        "HTTP route journey is separate from the browser UI recipe",
        "Local MFA explicitly unsupported; real AAL2 is not claimed by this run",
        ...(retainedPublished
          ? [
              "Final withdrawal deferred until coordinator finishes inspecting the retained fixture",
            ]
          : []),
        "No real property, personal account or external email",
      ],
    };
    await writeFile(reportFile, JSON.stringify(report, null, 2) + "\n");
    console.info(
      JSON.stringify({
        status: report.status,
        passed: report.passed,
        failedCheck: failure,
        report: reportFile,
        ...(retainedPublished
          ? {
              listingId: listingIds[0],
              reviewUrl: report.retainedFixture?.url,
              withdrawalDeferred: true,
            }
          : {}),
      }),
    );
  }
}
async function withdraw(runtime: Runtime) {
  const inventory = JSON.parse(
    await readFile(join(runtime.folder, "http-inventory.json"), "utf8"),
  );
  assert.equal(inventory.runId, runtime.runId);
  assert.equal(
    inventory.retainedPublished,
    true,
    "No successfully retained publication belongs to this runtime",
  );
  const report = JSON.parse(await readFile(reportFile, "utf8"));
  assert.equal(report.status, "passed_with_published_fixture_retained");
  const sellerIdentity = inventory.identities.find(
      (identity: any) => identity.persona === "vendeur",
    ),
    buyerIdentity = inventory.identities.find(
      (identity: any) => identity.persona === "acheteur",
    );
  for (const identity of [sellerIdentity, buyerIdentity])
    assert.match(identity.email, /^qa-journey-.+@test\.invalid$/);
  const seller = new Client(runtime),
    buyer = new Client(runtime),
    guest = new Client(runtime);
  const mode = await guest.api("session");
  check("deferred_withdrawal_local_demo_only", mode.raw?.mode === "demo");
  for (const [client, identity] of [
    [seller, sellerIdentity],
    [buyer, buyerIdentity],
  ] as const) {
    const login = await client.api("auth/login", "POST", {
      email: identity.email,
      password: runtime.password,
    });
    status(`deferred_${identity.persona}_login`, login, 200);
    check(
      `deferred_${identity.persona}_identity_matches`,
      login.data.id === identity.id,
    );
  }
  const id = inventory.listingIds[0];
  assert.match(id, /^[0-9a-f-]{36}$/);
  const current = await seller.api(`listings/${id}?draft=1`);
  status("deferred_seller_owns_retained_draft", current, 200);
  status(
    "retained_publication_visible_before_withdrawal",
    await guest.api(`listings/${id}`),
    200,
  );
  status(
    "seller_withdraws_published_offer",
    await seller.api(`listings/${id}/lifecycle`, "POST", {
      version: current.data.version,
      action: "withdraw",
    }),
    200,
  );
  status("withdrawn_offer_not_public", await guest.api(`listings/${id}`), 404);
  check(
    "withdrawn_photo_no_longer_public",
    [401, 403, 404].includes((await guest.file(inventory.photos[0])).status),
  );
  status(
    "buyer_conversation_preserved_after_withdrawal",
    await buyer.api(`conversations/${inventory.conversationId}/messages`),
    200,
  );
  report.checks.push(...checks);
  report.passed = report.checks.filter((item: any) => item.passed).length;
  report.status = "passed";
  report.withdrawalDeferred = false;
  report.retainedFixture = null;
  report.withdrawnAt = new Date().toISOString();
  report.cleanup =
    "withdrawal tested; disposable database folder removal awaits coordinator shutdown";
  report.limitations = report.limitations.filter(
    (value: string) => !value.startsWith("Final withdrawal deferred"),
  );
  await writeFile(reportFile, JSON.stringify(report, null, 2) + "\n");
  inventory.retainedPublished = false;
  await privateJson(join(runtime.folder, "http-inventory.json"), inventory);
  console.info(
    JSON.stringify({
      status: "published_fixture_withdrawn",
      passed: report.passed,
      report: reportFile,
    }),
  );
}
async function cleanup(runtime: Runtime) {
  for (const port of new Set([new URL(runtime.origin).port, "3000", "3002"])) {
    let live = false;
    try {
      await fetch(`http://127.0.0.1:${port}/api/health`, {
        signal: AbortSignal.timeout(500),
      });
      live = true;
    } catch {}
    assert.ok(
      !live,
      "Coordinator must stop the QA loopback servers before removing the disposable folder",
    );
  }
  const report = JSON.parse(
    await readFile(reportFile, "utf8").catch(() => "{}"),
  );
  assert.equal(
    report.withdrawalDeferred === true,
    false,
    "Withdraw the retained publication before discarding acceptance evidence",
  );
  await rm(runtime.folder, { recursive: true });
  await rm(runtimeFile);
  report.disposableDatabaseRemoved = true;
  report.qaServersStoppedBeforeCleanup = true;
  await writeFile(reportFile, JSON.stringify(report, null, 2) + "\n");
  console.info(
    JSON.stringify({ status: "local_fixture_removed", report: reportFile }),
  );
}
async function main() {
  if (process.argv.includes("--prepare")) return prepare();
  if (
    !process.argv.includes("--run") &&
    !process.argv.includes("--cleanup") &&
    !process.argv.includes("--withdraw")
  ) {
    console.info(
      "Prepared only. --prepare creates a private runtime; coordinator starts loopback server; --run [--keep-published] exercises HTTP; --withdraw completes deferred withdrawal; --cleanup requires stopped QA ports.",
    );
    return;
  }
  const runtime = JSON.parse(await readFile(runtimeFile, "utf8")) as Runtime;
  validateRuntime(runtime);
  if (process.argv.includes("--cleanup")) return cleanup(runtime);
  if (process.argv.includes("--withdraw")) return withdraw(runtime);
  await run(runtime);
}
void main().catch(() => {
  console.error(
    "Listing journey stopped; inspect local runtime/report without exposing credentials.",
  );
  process.exitCode = 1;
});
