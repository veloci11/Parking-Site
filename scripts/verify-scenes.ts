/** Opt-in connected scene QA. Reads ignored coordinator config. No signup, external emails, global signout, secrets in reports, or unrelated data changes. */
import assert from "node:assert/strict";
import { randomUUID, createHmac } from "node:crypto";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import sharp from "sharp";
import type { SceneManifest } from "../src/lib/scene-contract";
type Persona = "seller" | "buyer" | "outsider" | "moderator";
type Config = {
  origin: string;
  supabaseUrl: string;
  publishableKey: string;
  users: Record<Persona, { id: string; email: string; password: string }>;
};
type Reply = { status: number; data: any; code?: string; raw: any };
let config: Config;
const checks: {
  name: string;
  passed: boolean;
  status?: number;
  code?: string;
}[] = [];
const priorAttempts: {
  status: string;
  failure: string | null;
  passed: number;
  total: number;
}[] = [];
const inventory = {
  runId: randomUUID(),
  status: "prepared",
  userIds: [] as string[],
  listingIds: [] as string[],
  media: [] as { id: string; listingId: string; objectKey: string }[],
  sources: [] as { id: string; listingId: string; objectKey: string }[],
  sceneIds: [] as string[],
  keptForVisualQA: false,
  withdrawn: false,
};
const tokens: Partial<Record<Persona, string>> = {};
function check(name: string, value: unknown, reply?: Reply) {
  checks.push({
    name,
    passed: !!value,
    ...(reply
      ? { status: reply.status, ...(reply.code ? { code: reply.code } : {}) }
      : {}),
  });
  if (!value) throw new Error(name);
}
function status(name: string, reply: Reply, expected: number | number[]) {
  check(
    name,
    (Array.isArray(expected) ? expected : [expected]).includes(reply.status),
    reply,
  );
}
async function save() {
  await mkdir(".data", { recursive: true });
  await writeFile(
    ".data/supabase-scenes-qa-result.json",
    JSON.stringify(inventory, null, 2) + "\n",
    { mode: 0o600 },
  );
}
class Client {
  cookies = new Map<string, string>();
  async request(
    path: string,
    method = "GET",
    payload?: unknown,
  ): Promise<Reply> {
    const multipart = payload instanceof FormData;
    const response = await fetch(`${config.origin}/api/${path}`, {
      method,
      redirect: "manual",
      signal: AbortSignal.timeout(45000),
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
    for (const c of response.headers.getSetCookie()) {
      const first = c.split(";")[0],
        i = first.indexOf("=");
      if (first.slice(i + 1))
        this.cookies.set(first.slice(0, i), first.slice(i + 1));
      else this.cookies.delete(first.slice(0, i));
    }
    const raw = await response.json().catch(() => null);
    return { status: response.status, data: raw?.data, code: raw?.code, raw };
  }
  async file(path: string) {
    return fetch(`${config.origin}${path}`, {
      headers: this.cookies.size
        ? { Cookie: [...this.cookies].map(([k, v]) => `${k}=${v}`).join("; ") }
        : {},
      signal: AbortSignal.timeout(45000),
    });
  }
}
async function direct(
  path: string,
  persona: Persona | null,
  method = "GET",
  payload?: unknown,
): Promise<Reply> {
  const response = await fetch(`${config.supabaseUrl}${path}`, {
    method,
    signal: AbortSignal.timeout(45000),
    headers: {
      apikey: config.publishableKey,
      ...(persona ? { Authorization: `Bearer ${tokens[persona]}` } : {}),
      ...(payload ? { "Content-Type": "application/json" } : {}),
    },
    body: payload ? JSON.stringify(payload) : undefined,
  });
  const raw = await response.json().catch(() => null);
  return { status: response.status, data: raw, raw, code: raw?.code };
}
function totp(secret: string) {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  let bits = "";
  for (const c of secret.toUpperCase().replace(/=+$/, ""))
    bits += alphabet.indexOf(c).toString(2).padStart(5, "0");
  const bytes = Buffer.alloc(Math.floor(bits.length / 8));
  for (let i = 0; i < bytes.length; i++)
    bytes[i] = parseInt(bits.slice(i * 8, i * 8 + 8), 2);
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(Math.floor(Date.now() / 30000)));
  const h = createHmac("sha1", bytes).update(counter).digest(),
    offset = h[h.length - 1] & 15;
  return String((h.readUInt32BE(offset) & 0x7fffffff) % 1000000).padStart(
    6,
    "0",
  );
}
function manifest(spaces: any[]): SceneManifest {
  return {
    schemaVersion: "1.0",
    unit: "m",
    upAxis: "Y",
    level: -1,
    floor: {
      footprintXZ: [
        [0, 0],
        [14, 0],
        [14, 12],
        [0, 12],
      ],
      thicknessM: 0.2,
    },
    spaces: spaces.map((space, i) => ({
      spaceId: space.id,
      displayNumber: space.number,
      footprintXZ: [
        [1 + i * 3, 1],
        [3.4 + i * 3, 1],
        [3.4 + i * 3, 6],
        [1 + i * 3, 6],
      ],
      dimensions: { lengthM: 5, widthM: 2.4, clearanceM: 2.1 },
    })),
    contextSpaces: [
      {
        footprintXZ: [
          [1, 8],
          [3.4, 8],
          [3.4, 11],
          [1, 11],
        ],
      },
    ],
    obstacles: [
      {
        kind: "wall",
        footprintXZ: [
          [0, 0],
          [14, 0],
          [14, 0.3],
          [0, 0.3],
        ],
        baseM: 0,
        heightM: 2.5,
      },
      {
        kind: "column",
        footprintXZ: [
          [7, 3],
          [7.4, 3],
          [7.4, 3.4],
          [7, 3.4],
        ],
        baseM: 0,
        heightM: 2.5,
      },
      {
        kind: "ramp",
        footprintXZ: [
          [10, 1],
          [13, 1],
          [13, 11],
          [10, 11],
        ],
        baseM: 0,
        heightM: 0.2,
        endHeightM: 1.5,
      },
    ],
    provenance: {
      calibrated: true,
      accuracyM: 0.05,
      controlDistances: [
        { fromXZ: [0, 0], toXZ: [14, 0], measuredM: 14 },
        { fromXZ: [0, 0], toXZ: [0, 12], measuredM: 12 },
      ],
      observedAt: new Date().toISOString(),
      publicSummary:
        "RECETTE FICTIVE : modèle technique de test, aucune mesure d’un parking réel.",
    },
    observations: [
      {
        positionXZ: [7.2, 3.2],
        category: "obstacle",
        description: "Poteau de démonstration fictive.",
      },
    ],
  };
}
async function main() {
  if (
    !process.argv.includes("--run") &&
    !process.argv.includes("--withdraw") &&
    !process.argv.includes("--resume")
  ) {
    console.log(
      "Prepared. Coordinator may use --run [--keep-for-visual] or --resume [--keep-for-visual] or --withdraw.",
    );
    return;
  }
  let failure: string | null = null,
    factorId: string | null = null,
    moderator: Client | undefined,
    seller: Client | undefined;
  try {
    config = JSON.parse(await readFile(".data/supabase-qa.json", "utf8"));
    assert.match(config.origin, /^http:\/\/(127\.0\.0\.1|localhost):\d+$/);
    config.origin = config.origin.replace(/\/$/, "");
    assert.ok(config.supabaseUrl.startsWith("https://"));
    assert.ok(
      config.publishableKey && !config.publishableKey.startsWith("sb_secret_"),
    );
    const priorInventory = JSON.parse(
      await readFile(".data/supabase-scenes-qa-result.json", "utf8").catch(
        () => "null",
      ),
    );
    if (priorInventory) {
      if (priorInventory.userIds?.length)
        assert.ok(
          priorInventory.userIds.every((id: string) =>
            Object.values(config.users).some((user) => user.id === id),
          ),
        );
      Object.assign(inventory, priorInventory);
    }
    inventory.userIds = Object.values(config.users).map((user) => user.id);
    inventory.status = "running";
    if (
      process.argv.includes("--resume") ||
      process.argv.includes("--withdraw")
    ) {
      const prior = JSON.parse(
        await readFile("docs/qa/scenes-integration.json", "utf8"),
      );
      priorAttempts.push(...(prior.priorAttempts || []), {
        status: prior.status,
        failure: prior.failure,
        passed: prior.checks.filter((c: any) => c.passed).length,
        total: prior.checks.length,
      });
      checks.push(...prior.checks.filter((c: any) => c.passed));
    }
    const clients = {
        seller: new Client(),
        buyer: new Client(),
        outsider: new Client(),
        moderator: new Client(),
      },
      guest = new Client();
    seller = clients.seller;
    moderator = clients.moderator;
    const mode = await guest.request("session");
    status("supabase_mode_http", mode, 200);
    check("connected_supabase_mode", mode.raw.mode === "supabase");
    for (const persona of [
      "seller",
      "buyer",
      "outsider",
      "moderator",
    ] as const) {
      const identity = config.users[persona],
        login = await clients[persona].request("auth/login", "POST", {
          email: identity.email,
          password: identity.password,
        });
      status(`${persona}_login`, login, 200);
      check(`${persona}_identity`, login.data?.id === identity.id);
      const session = await direct(
        "/auth/v1/token?grant_type=password",
        null,
        "POST",
        { email: identity.email, password: identity.password },
      );
      status(`${persona}_direct_login`, session, 200);
      tokens[persona] = session.data.access_token;
    }
    if (process.argv.includes("--withdraw")) {
      const prior = JSON.parse(
        await readFile(".data/supabase-scenes-qa-result.json", "utf8"),
      );
      Object.assign(inventory, prior);
      for (const id of inventory.listingIds) {
        const own = await seller.request(`listings/${id}?draft=1`);
        if (
          own.status === 200 &&
          !["withdrawn", "sold"].includes(own.data.status)
        )
          status(
            "visual_fixture_withdrawn",
            await seller.request(`listings/${id}/lifecycle`, "POST", {
              version: own.data.version,
              action: "withdraw",
            }),
            200,
          );
        status(
          "scene_hidden_after_fixture_withdrawal",
          await guest.request(`scenes?listingId=${id}`),
          404,
        );
      }
      inventory.withdrawn = true;
      inventory.keptForVisualQA = false;
      inventory.status = "passed";
      await save();
      return;
    }
    await save();
    const assurance = await moderator.request("mfa");
    status("moderator_assurance_available", assurance, 200);
    if (assurance.data.requiredForAdmin) {
      const enrolled = await moderator.request("mfa/enroll", "POST", {});
      status("qa_private_factor_created", enrolled, 200);
      factorId = enrolled.data.factorId;
      const challenge = await moderator.request("mfa/challenge", "POST", {
        factorId,
      });
      status("qa_mfa_challenge", challenge, 200);
      status(
        "qa_mfa_verification",
        await moderator.request("mfa/verify", "POST", {
          factorId,
          challengeId: challenge.data.challengeId,
          code: totp(enrolled.data.secret),
        }),
        200,
      );
    }
    let listingId: string, spaces: any[], approved: Reply;
    if (process.argv.includes("--resume")) {
      listingId = inventory.listingIds[inventory.listingIds.length - 1];
      assert.ok(listingId);
      const current = await seller.request(`listings/${listingId}?draft=1`);
      status("resume_owned_fixture_available", current, 200);
      check(
        "resume_fixture_explicitly_fictional",
        current.data.title === "RECETTE 3D FICTIVE — aucun bien réel",
      );
      spaces = current.data.spaces;
      approved = current;
      status(
        "resume_approved_model_public",
        await guest.request(`scenes?listingId=${listingId}`),
        200,
      );
      const catalog = await guest.request("listings?scene=1&limit=50");
      status("resumed_scene_catalog_available", catalog, 200);
      check(
        "resumed_scene_filter_before_pagination",
        catalog.data.some((l: any) => l.id === listingId) &&
          catalog.data.every((l: any) => l.sceneAvailable),
      );
    } else {
      const created = await seller.request("listings", "POST", {});
      status("scene_listing_draft_created", created, 201);
      listingId = created.data.id;
      inventory.listingIds.push(listingId);
      await save();
      const photos: string[] = [];
      for (let i = 0; i < 3; i++) {
        const bytes = await sharp({
          create: {
            width: 32,
            height: 32,
            channels: 3,
            background: { r: 150 + i * 10, g: 145, b: 140 },
          },
        })
          .png()
          .toBuffer();
        const form = new FormData();
        form.set("listingId", listingId);
        form.set(
          "file",
          new Blob([new Uint8Array(bytes)], { type: "image/png" }),
          `inert-scene-photo-${i}.png`,
        );
        const upload = await seller.request("uploads", "POST", form);
        status(`scene_gallery_upload_${i + 1}`, upload, 201);
        photos.push(upload.data.url);
        inventory.media.push({
          id: upload.data.id,
          listingId,
          objectKey: `${config.users.seller.id}/${listingId}/${upload.data.id}.webp`,
        });
        await save();
      }
      spaces = [
        {
          id: created.data.spaces[0].id,
          number: "QA-1",
          level: -1,
          areaM2: 12,
          lengthM: 5,
          widthM: 2.4,
          clearanceM: 2.1,
        },
        {
          id: randomUUID(),
          number: "QA-2",
          level: -1,
          areaM2: 12,
          lengthM: 5,
          widthM: 2.4,
          clearanceM: 2.1,
        },
      ];
      const patched = await seller.request(`listings/${listingId}`, "PATCH", {
        version: created.data.version,
        title: "RECETTE 3D FICTIVE — aucun bien réel",
        description:
          "Annonce technique fictive réservée à la recette de la plateforme. Les images et le modèle ne représentent aucun parking réel, aucune propriété ni vente. Retrait prévu après les captures et tests d’accès.",
        city: "Lyon",
        district: "Recette 3D fictive",
        priceCents: 3100000,
        type: "covered",
        spaces,
        photos,
        quality: created.data.quality,
        locationPrecision: "exact_opt_in",
        coordinates: [4.85, 45.76],
        address: "Adresse technique fictive, aucun bien réel",
      });
      status("scene_listing_saved", patched, 200);
      const submitted = await seller.request(
        `listings/${listingId}/submit`,
        "POST",
        { version: patched.data.version, ownershipAttested: true },
      );
      status("scene_listing_submitted", submitted, 200);
      approved = await moderator.request(
        `admin/revisions/${listingId}/decision`,
        "POST",
        { version: submitted.data.version, decision: "approve" },
      );
      status("scene_listing_published", approved, 200);
      const sources = [
        {
          name: "inert-plan.pdf",
          type: "application/pdf",
          bytes: Buffer.from(
            "%PDF-1.4\n1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n2 0 obj\n<< /Type /Pages /Count 0 /Kids [] >>\nendobj\ntrailer\n<< /Root 1 0 R >>\n%%EOF\n",
          ),
        },
        {
          name: "inert-plan.png",
          type: "image/png",
          bytes: await sharp({
            create: {
              width: 32,
              height: 32,
              channels: 3,
              background: "#BDB9B1",
            },
          })
            .png()
            .toBuffer(),
        },
      ];
      for (const source of sources) {
        const form = new FormData();
        form.set("listingId", listingId);
        form.set(
          "file",
          new Blob([new Uint8Array(source.bytes)], { type: source.type }),
          source.name,
        );
        const uploaded = await seller.request("scenes/sources", "POST", form);
        status(`private_source_${source.type}_uploaded`, uploaded, 201);
        const id = uploaded.data.id;
        inventory.sources.push({
          id,
          listingId,
          objectKey: `${config.users.seller.id}/${listingId}/${id}.${uploaded.data.mime === "application/pdf" ? "pdf" : "webp"}`,
        });
        await save();
        const privateDownload = await seller.file(uploaded.data.url);
        check(
          "owner_source_attachment",
          privateDownload.status === 200 &&
            privateDownload.headers
              .get("content-disposition")
              ?.startsWith("attachment;"),
        );
        check(
          "guest_source_hidden",
          [401, 403, 404].includes(
            (await guest.file(uploaded.data.url)).status,
          ),
        );
        check(
          "outsider_source_hidden",
          [401, 403, 404].includes(
            (await clients.outsider.file(uploaded.data.url)).status,
          ),
        );
      }
      const evidenceIds = inventory.sources
          .filter((s) => s.listingId === listingId)
          .map((s) => s.id),
        geometry = manifest(spaces);
      const proposal = await seller.request("scenes", "POST", {
        listingId,
        manifest: geometry,
        evidenceIds,
        rightsAttested: true,
      });
      status("metric_model_proposed", proposal, 201);
      const sceneId = proposal.data.id;
      inventory.sceneIds.push(sceneId);
      await save();
      status(
        "pending_scene_not_public",
        await guest.request(`scenes?listingId=${listingId}`),
        404,
      );
      const privateRows = await direct(
        `/rest/v1/parking_scenes?listing_id=eq.${listingId}&select=id,manifest,evidence_ids`,
        "outsider",
      );
      status("direct_scene_other_user_query", privateRows, 200);
      check("rls_no_other_user_scene", privateRows.data.length === 0);
      const privateSources = await direct(
        `/rest/v1/parking_scene_sources?listing_id=eq.${listingId}&select=id,object_key`,
        "outsider",
      );
      status("direct_source_other_user_query", privateSources, 200);
      check("rls_no_other_user_sources", privateSources.data.length === 0);
      const controls = {
        geometryMatchesSources: true,
        numbersAndLevelChecked: true,
        conditionMatchesPhotos: true,
        locationConsentChecked: true,
      };
      const modProposal = await moderator.request("scenes", "POST", {
        listingId,
        manifest: geometry,
        evidenceIds,
        rightsAttested: true,
      });
      status("moderator_prepared_model_for_seller", modProposal, 201);
      inventory.sceneIds.push(modProposal.data.id);
      await save();
      status(
        "moderator_cannot_approve_own_model",
        await moderator.request(
          `scenes/${modProposal.data.id}/review`,
          "POST",
          { version: 1, decision: "approve", checks: controls },
        ),
        403,
      );
      status(
        "member_cannot_review",
        await clients.buyer.request(`scenes/${sceneId}/review`, "POST", {
          version: 1,
          decision: "approve",
          checks: controls,
        }),
        403,
      );
      const reviewed = await moderator.request(
        `scenes/${sceneId}/review`,
        "POST",
        { version: 1, decision: "approve", checks: controls },
      );
      status("model_review_approved", reviewed, 200);
      status(
        "stale_review_refused",
        await moderator.request(`scenes/${sceneId}/review`, "POST", {
          version: 1,
          decision: "approve",
          checks: controls,
        }),
        409,
      );
      const publicScene = await guest.request(`scenes?listingId=${listingId}`);
      status("approved_scene_public", publicScene, 200);
      check(
        "public_measured_manifest",
        publicScene.data.fidelity === "measured" &&
          publicScene.data.manifest.spaces.length === 2,
      );
      check(
        "public_unit_aliases_only",
        publicScene.data.manifest.spaces.every(
          (s: any, i: number) => s.id === `${listingId}:unit:${i + 1}`,
        ),
      );
      const serialized = JSON.stringify(publicScene.data);
      for (const hidden of [
        ...spaces.map((s) => s.id),
        ...evidenceIds,
        ...inventory.sources.map((s) => s.objectKey),
      ])
        check("private_scene_reference_absent", !serialized.includes(hidden));
      const enriched = await guest.request(`listings/${listingId}`);
      status("scene_listing_read", enriched, 200);
      check(
        "listing_scene_flag_from_registry",
        enriched.data.sceneAvailable === true,
      );
      const sceneCatalog = await guest.request("listings?scene=1&limit=50");
      status("scene_catalog_available", sceneCatalog, 200);
      check(
        "scene_filter_before_pagination",
        sceneCatalog.data.some((l: any) => l.id === listingId) &&
          sceneCatalog.data.every((l: any) => l.sceneAvailable),
      );
    }
    const changedSpaces = spaces.map((s, i) => ({
      ...s,
      number: i === 0 ? "QA-1-UPDATED" : s.number,
    }));
    const geometryEdit = await seller.request(
      `listings/${listingId}`,
      "PATCH",
      { version: approved.data.version, spaces: changedSpaces },
    );
    status("published_mapping_revision_saved", geometryEdit, 200);
    const geometrySubmit = await seller.request(
      `listings/${listingId}/submit`,
      "POST",
      { version: geometryEdit.data.version, ownershipAttested: true },
    );
    status("mapping_revision_submitted", geometrySubmit, 200);
    const geometryPublished = await moderator.request(
      `admin/revisions/${listingId}/decision`,
      "POST",
      { version: geometrySubmit.data.version, decision: "approve" },
    );
    status("mapping_revision_published", geometryPublished, 200);
    status(
      "outdated_geometry_hidden",
      await guest.request(`scenes?listingId=${listingId}`),
      404,
    );
    const restore = await seller.request(`listings/${listingId}`, "PATCH", {
      version: geometryPublished.data.version,
      spaces,
    });
    status("mapping_restore_saved", restore, 200);
    const restoreSubmit = await seller.request(
      `listings/${listingId}/submit`,
      "POST",
      { version: restore.data.version, ownershipAttested: true },
    );
    status("mapping_restore_submitted", restoreSubmit, 200);
    const restorePublished = await moderator.request(
      `admin/revisions/${listingId}/decision`,
      "POST",
      { version: restoreSubmit.data.version, decision: "approve" },
    );
    status("mapping_restore_published", restorePublished, 200);
    status(
      "matching_model_restored",
      await guest.request(`scenes?listingId=${listingId}`),
      200,
    );
    const area = await seller.request(`listings/${listingId}`, "PATCH", {
      version: restorePublished.data.version,
      locationPrecision: "area",
    });
    status("area_revision_saved", area, 200);
    const areaSubmit = await seller.request(
      `listings/${listingId}/submit`,
      "POST",
      { version: area.data.version, ownershipAttested: true },
    );
    status("area_revision_submitted", areaSubmit, 200);
    const areaPublished = await moderator.request(
      `admin/revisions/${listingId}/decision`,
      "POST",
      { version: areaSubmit.data.version, decision: "approve" },
    );
    status("area_revision_published", areaPublished, 200);
    status(
      "area_scene_hidden",
      await guest.request(`scenes?listingId=${listingId}`),
      404,
    );
    const exact = await seller.request(`listings/${listingId}`, "PATCH", {
      version: areaPublished.data.version,
      locationPrecision: "exact_opt_in",
    });
    status("exact_restore_saved", exact, 200);
    const exactSubmit = await seller.request(
      `listings/${listingId}/submit`,
      "POST",
      { version: exact.data.version, ownershipAttested: true },
    );
    status("exact_restore_submitted", exactSubmit, 200);
    const exactPublished = await moderator.request(
      `admin/revisions/${listingId}/decision`,
      "POST",
      { version: exactSubmit.data.version, decision: "approve" },
    );
    status("exact_restore_published", exactPublished, 200);
    status(
      "exact_model_available",
      await guest.request(`scenes?listingId=${listingId}`),
      200,
    );
    if (process.argv.includes("--keep-for-visual")) {
      inventory.keptForVisualQA = true;
    } else {
      status(
        "fixture_listing_withdrawn",
        await seller.request(`listings/${listingId}/lifecycle`, "POST", {
          version: exactPublished.data.version,
          action: "withdraw",
        }),
        200,
      );
      status(
        "scene_not_public_after_withdrawal",
        await guest.request(`scenes?listingId=${listingId}`),
        404,
      );
      inventory.withdrawn = true;
    }
    inventory.status = "passed";
  } catch (error) {
    failure =
      error instanceof Error ? error.message : "scene_integration_error";
    inventory.status = "failed";
  } finally {
    if (factorId && moderator) {
      try {
        const removed = await moderator.request("mfa/unenroll", "POST", {
          factorId,
          password: config.users.moderator.password,
        });
        check("own_qa_factor_removed", removed.status === 200);
      } catch {
        failure ||= "qa_factor_cleanup_failed";
        inventory.status = "failed";
      }
    }
    await save();
    await mkdir("docs/qa", { recursive: true });
    const report = {
      priorAttempts,
      resumed: process.argv.includes("--resume"),
      checkedAt: new Date().toISOString(),
      status: inventory.status,
      checks,
      failure,
      fixture: "explicitly fictional test inventory, no real parking pilot",
      fixtureKeptForVisualQA: inventory.keptForVisualQA,
      withdrawn: inventory.withdrawn,
      externalEmailsSent: false,
      geometrySource:
        "parametric JSON fixture; metric calibration and RLS tested against the configured service",
    };
    await writeFile(
      "docs/qa/scenes-integration.json",
      JSON.stringify(report, null, 2) + "\n",
    );
    console.log(
      JSON.stringify({
        status: report.status,
        passed: checks.filter((c) => c.passed).length,
        total: checks.length,
        failure,
        keptForVisualQA: inventory.keptForVisualQA,
        report: "docs/qa/scenes-integration.json",
      }),
    );
    if (failure) process.exitCode = 1;
  }
}
void main();
