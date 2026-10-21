import { test, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import sharp from "sharp";
import {
  sceneManifestSchema,
  assertSceneMapping,
  publicSceneProjection,
  exampleSceneManifest,
  type SceneManifest,
} from "../src/lib/scene-contract";
import { handleApi } from "../src/server/api";
import { handleScenes } from "../src/server/scenes/api";
import { db, resetDbForTests } from "../src/server/db";
import type { Listing } from "../src/lib/types";
const directory = mkdtempSync(join(tmpdir(), "gp-scenes-"));
process.env.GP_DATABASE_PATH = join(directory, "scene.sqlite");
process.env.GP_MEDIA_PATH = join(directory, "media");
process.env.GP_FORCE_LOCAL_DEMO = "true";
// This suite uploads only generated inert fixtures; never a production setting.
process.env.GP_SOURCE_INERT_TEST_WORKER = "1";
const origin = "http://127.0.0.1:3000",
  listingId = "10000000-0000-4000-8000-000000000001";
after(() => {
  resetDbForTests();
  rmSync(directory, { recursive: true, force: true });
});
function fixtureListing(): Listing {
  return JSON.parse(
    String(
      db().prepare("SELECT draft_json FROM listings WHERE id=?").get(listingId)!
        .draft_json,
    ),
  );
}
function metric(): SceneManifest {
  const result = exampleSceneManifest(fixtureListing());
  result.provenance = {
    calibrated: true,
    accuracyM: 0.05,
    controlDistances: [
      { fromXZ: [0, 0], toXZ: [10, 0], measuredM: 10 },
      { fromXZ: [0, 0], toXZ: [0, 10], measuredM: 10 },
    ],
    observedAt: "2026-10-20T10:00:00.000Z",
    publicSummary: "Fixture technique fictive ; aucune mesure de parking réel.",
  };
  return result;
}
async function persona(name: string) {
  const response = await handleApi(
    new Request(`${origin}/api/auth/demo`, {
      method: "POST",
      headers: { origin, "content-type": "application/json" },
      body: JSON.stringify({ persona: name }),
    }),
  );
  return response.headers.get("set-cookie")!.split(";")[0];
}
async function api(
  path: string,
  method = "GET",
  value?: unknown,
  cookie?: string,
) {
  const multipart = value instanceof FormData;
  const response = await handleScenes(
    new Request(`${origin}/api/scenes${path}`, {
      method,
      headers: {
        origin,
        ...(cookie ? { cookie } : {}),
        ...(value && !multipart ? { "content-type": "application/json" } : {}),
      },
      body: value ? (multipart ? value : JSON.stringify(value)) : undefined,
    }),
  );
  const data = await response.json();
  return { response, result: data };
}

test("contrat métrique strict, sans ressources externes ni champs privés arbitraires", () => {
  assert.equal(sceneManifestSchema.safeParse(metric()).success, true);
  assert.equal(
    sceneManifestSchema.safeParse({ ...metric(), unit: "cm" }).success,
    false,
  );
  assert.equal(
    sceneManifestSchema.safeParse({
      ...metric(),
      assets: { model: "https://external.invalid/scene.glb" },
    }).success,
    false,
  );
  assert.equal(
    sceneManifestSchema.safeParse({
      ...metric(),
      sourcePlanKey: "private/source.pdf",
    }).success,
    false,
  );
});
test("polygones bornés et non croisés, identité unique et calibrage réellement cohérent", () => {
  const out = metric();
  out.spaces[0].footprintXZ[0] = [-1, 1];
  assert.equal(sceneManifestSchema.safeParse(out).success, false);
  const crossed = metric();
  crossed.spaces[0].footprintXZ = [
    [1, 1],
    [3, 6],
    [3, 1],
    [1, 6],
  ];
  assert.equal(sceneManifestSchema.safeParse(crossed).success, false);
  const mismatched = metric();
  mismatched.provenance.controlDistances[0].measuredM = 9;
  assert.equal(sceneManifestSchema.safeParse(mismatched).success, false);
  const repeated = metric();
  repeated.provenance.controlDistances[1] = {
    fromXZ: [10, 0],
    toXZ: [0, 0],
    measuredM: 10,
  };
  assert.equal(sceneManifestSchema.safeParse(repeated).success, false);
  const missing = metric();
  missing.provenance.controlDistances = [];
  assert.equal(sceneManifestSchema.safeParse(missing).success, false);
});
test("un modèle non calibré peut rester privé mais ne peut être approuvé", () => {
  const source = exampleSceneManifest(fixtureListing());
  assert.equal(sceneManifestSchema.safeParse(source).success, true);
  assert.throws(
    () => assertSceneMapping(source, fixtureListing(), true),
    /distances|calibrée/,
  );
  assert.throws(
    () =>
      assertSceneMapping(
        metric(),
        { ...fixtureListing(), locationPrecision: "area" },
        true,
      ),
    /localisation/,
  );
});
test("mapping contrôlé par identité, numéro, niveau et dimensions connues", () => {
  const source = metric();
  source.spaces[0].spaceId = randomUUID();
  assert.throws(
    () => assertSceneMapping(source, fixtureListing(), true),
    /Identité/,
  );
  const number = metric();
  number.spaces[0].displayNumber = "Autre";
  assert.throws(
    () => assertSceneMapping(number, fixtureListing(), true),
    /numéro/,
  );
  const dimensions = metric();
  dimensions.spaces[0].dimensions.widthM = 4;
  assert.throws(
    () => assertSceneMapping(dimensions, fixtureListing(), true),
    /dimensions/,
  );
});
test("projection approuvée sans identité physique canonique ou preuve privée", () => {
  const listing = fixtureListing(),
    source = metric();
  const result = publicSceneProjection(
    {
      id: randomUUID(),
      listingId: listing.id,
      version: 2,
      reviewedAt: "2026-10-21T10:00:00.000Z",
      manifest: source,
    },
    listing,
  );
  assert.equal(result.manifest.spaces[0].id, `${listing.id}:unit:1`);
  assert.ok(!JSON.stringify(result).includes(listing.spaces[0].id));
  assert.ok(!("controlDistances" in result.manifest.provenance));
  assert.equal(result.manifest.provenance.controlDistancesCount, 2);
});
test("pipeline local complet: sources privées, refus de fichiers actifs, contrôle indépendant, publication et retrait automatique du mapping périmé", async () => {
  const seller = await persona("seller"),
    moderator = await persona("moderator"),
    buyer = await persona("buyer");
  const invalid = new FormData();
  invalid.set("listingId", listingId);
  invalid.set(
    "file",
    new Blob(["%PDF-1.7\n/JavaScript /JS (alert(1))\n%%EOF"], {
      type: "application/pdf",
    }),
    "active.pdf",
  );
  assert.equal(
    (await api("/sources", "POST", invalid, seller)).response.status,
    400,
  );
  const source = await sharp({
    create: { width: 32, height: 32, channels: 3, background: "#CCC" },
  })
    .png()
    .toBuffer();
  const form = new FormData();
  form.set("listingId", listingId);
  form.set(
    "file",
    new Blob([new Uint8Array(source)], { type: "image/png" }),
    "fixture-plan.png",
  );
  const uploaded = await api("/sources", "POST", form, seller);
  assert.equal(uploaded.response.status, 201, JSON.stringify(uploaded.result));
  const evidenceId = uploaded.result.data.id;
  assert.equal((await api(`/sources?id=${evidenceId}`)).response.status, 401);
  assert.equal(
    (await api(`/sources?id=${evidenceId}`, "GET", undefined, buyer)).response
      .status,
    404,
  );
  const ownSource = await handleScenes(
    new Request(
      `${origin}/api/scenes/sources?id=${evidenceId}&download=acknowledged`,
      {
        headers: { cookie: seller },
      },
    ),
  );
  assert.equal(ownSource.status, 200);
  assert.ok(
    ownSource.headers.get("content-disposition")?.startsWith("attachment;"),
  );
  assert.equal(ownSource.headers.get("content-type"), "image/webp");
  assert.ok(
    ownSource.headers.get("content-security-policy")?.includes("sandbox"),
  );
  const proposal = await api(
    "",
    "POST",
    {
      listingId,
      manifest: metric(),
      evidenceIds: [evidenceId],
      rightsAttested: true,
    },
    seller,
  );
  assert.equal(proposal.response.status, 201, JSON.stringify(proposal.result));
  const id = proposal.result.data.id;
  assert.equal((await api(`?listingId=${listingId}`)).response.status, 404);
  const ownModProposal = await api(
    "",
    "POST",
    {
      listingId,
      manifest: metric(),
      evidenceIds: [evidenceId],
      rightsAttested: true,
    },
    moderator,
  );
  assert.equal(ownModProposal.response.status, 201);
  assert.equal(
    (
      await api(
        `/${ownModProposal.result.data.id}/review`,
        "POST",
        {
          version: 1,
          decision: "approve",
          checks: {
            geometryMatchesSources: true,
            numbersAndLevelChecked: true,
            conditionMatchesPhotos: true,
            locationConsentChecked: true,
          },
        },
        moderator,
      )
    ).response.status,
    403,
    "Un modérateur ne peut pas approuver un plan qu’il a lui-même créé pour un vendeur",
  );
  const checks = {
    geometryMatchesSources: true,
    numbersAndLevelChecked: true,
    conditionMatchesPhotos: true,
    locationConsentChecked: true,
  };
  assert.equal(
    (
      await api(
        `/${id}/review`,
        "POST",
        { version: 1, decision: "approve", checks },
        buyer,
      )
    ).response.status,
    403,
  );
  assert.equal(
    (
      await api(
        `/${id}/review`,
        "POST",
        { version: 1, decision: "approve" },
        moderator,
      )
    ).response.status,
    400,
  );
  const reviewed = await api(
    `/${id}/review`,
    "POST",
    { version: 1, decision: "approve", checks },
    moderator,
  );
  assert.equal(reviewed.response.status, 200, JSON.stringify(reviewed.result));
  assert.equal(
    (
      await api(
        `/${id}/review`,
        "POST",
        { version: 1, decision: "approve", checks },
        moderator,
      )
    ).response.status,
    409,
  );
  const published = await api(`?listingId=${listingId}`);
  assert.equal(published.response.status, 200);
  assert.equal(
    published.result.data.manifest.spaces[0].id,
    `${listingId}:unit:1`,
  );
  assert.ok(!JSON.stringify(published.result).includes(evidenceId));
  assert.ok(
    !JSON.stringify(published.result).includes(fixtureListing().spaces[0].id),
  );
  const row = db()
    .prepare("SELECT public_json FROM listings WHERE id=?")
    .get(listingId)!;
  const changed = JSON.parse(String(row.public_json));
  changed.spaces[0].number = "99";
  db()
    .prepare("UPDATE listings SET public_json=? WHERE id=?")
    .run(JSON.stringify(changed), listingId);
  assert.equal((await api(`?listingId=${listingId}`)).response.status, 404);
});

test("runtime parametric version is distinct, observations require dates/proofs and public projection removes source identities", async () => {
  const { sceneSubmissionSchema, parsePublicScene } =
    await import("../src/lib/scene-contract");
  const { attachPublicManifestHash } =
    await import("../src/server/scenes/public-contract");
  const listing = fixtureListing(),
    source = metric(),
    proof = randomUUID(),
    observationId = randomUUID();
  source.schemaVersion = "gp-parametric-1.1";
  source.provenance.geometrySource = "plan_derived";
  source.provenance.geometryEvidenceIds = [proof];
  source.observations = [
    {
      id: observationId,
      spaceId: listing.spaces[0].id,
      source: "provided_document",
      observedAt: "2026-10-20T10:00:00.000Z",
      evidenceIds: [proof],
      positionXZ: [1, 1],
      category: "floor",
      description: "Observation technique fictive issue du document.",
    },
  ];
  assert.ok(
    sceneSubmissionSchema.safeParse({
      listingId: listing.id,
      manifest: source,
      evidenceIds: [proof],
      rightsAttested: true,
    }).success,
  );
  assert.ok(
    !sceneSubmissionSchema.safeParse({
      listingId: listing.id,
      manifest: source,
      evidenceIds: [randomUUID()],
      rightsAttested: true,
    }).success,
  );
  const publicScene = publicSceneProjection(
    {
      id: randomUUID(),
      listingId: listing.id,
      version: 2,
      reviewedAt: "2026-10-21T10:00:00.000Z",
      manifest: source,
      observationEvidenceChecked: true,
    },
    listing,
  );
  assert.equal(publicScene.fidelity, "reviewed");
  assert.equal(
    publicScene.documentation?.scope,
    "geometry_and_listed_observations_only",
  );
  for (const privateId of [proof, observationId, listing.spaces[0].id])
    assert.ok(!JSON.stringify(publicScene).includes(privateId));
  const hashed = attachPublicManifestHash(publicScene);
  assert.match(hashed.manifestHash!, /^[a-f0-9]{64}$/);
  assert.ok(parsePublicScene(hashed));
  assert.equal(
    parsePublicScene({
      ...hashed,
      runtimeContract: "canonical-parking-level/1.0",
    }),
    null,
  );
  assert.equal(
    attachPublicManifestHash({
      ...publicScene,
      manifest: { ...publicScene.manifest, observations: [] },
    }).manifestHash === hashed.manifestHash,
    false,
  );
  const missingDate = structuredClone(source);
  delete missingDate.observations[0].observedAt;
  assert.ok(!sceneManifestSchema.safeParse(missingDate).success);
});
