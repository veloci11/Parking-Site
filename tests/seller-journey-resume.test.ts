import { after, test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { emptyCommercialDetails } from "../src/lib/commercial-details";
import { handleApi } from "../src/server/api";
import { db, personas, resetDbForTests } from "../src/server/db";
import { sessionCookie } from "../src/server/security";
import type { Listing, Space } from "../src/lib/types";

// No server, existing demo fixture, network or connected database is used.
const directory = mkdtempSync(join(tmpdir(), "gp-seller-resume-"));
process.env.GP_DATABASE_PATH = join(directory, "isolated.sqlite");
process.env.GP_MEDIA_PATH = join(directory, "media");
process.env.GP_FORCE_LOCAL_DEMO = "true";
process.env.GP_LOCAL_DEMO = "true";
const origin = "http://127.0.0.1:3000";
after(() => {
  resetDbForTests();
  rmSync(directory, { recursive: true, force: true });
});
function request(path: string, method = "GET", body?: BodyInit) {
  db();
  return new Request(`${origin}/api/${path}`, {
    method,
    headers: {
      origin,
      cookie: sessionCookie(personas.seller),
      "Content-Type": "application/json",
    },
    body,
    ...(body instanceof ReadableStream ? { duplex: "half" } : {}),
  } as RequestInit);
}
async function read(response: Promise<Response>) {
  const result = await response;
  return { status: result.status, ...(await result.json()) };
}
function api(path: string, method = "GET", value?: unknown) {
  return read(
    handleApi(
      request(
        path,
        method,
        value === undefined ? undefined : JSON.stringify(value),
      ),
    ),
  );
}
function delayed(path: string, method: string, value: unknown) {
  let controller!: ReadableStreamDefaultController<Uint8Array>;
  const stream = new ReadableStream<Uint8Array>({
    start(value) {
      controller = value;
    },
  });
  const response = read(handleApi(request(path, method, stream)));
  return {
    response,
    release() {
      controller.enqueue(new TextEncoder().encode(JSON.stringify(value)));
      controller.close();
    },
  };
}
async function completeDraft(): Promise<Listing> {
  const spaces: Space[] = [2800000, 2900000, 3000000, 15000, 16000].map(
    (priceCents, index) => ({
      id: randomUUID(),
      number: index < 2 ? "" : String(index + 18),
      level: -1,
      areaM2: null,
      lengthM: null,
      widthM: null,
      clearanceM: null,
      offer: {
        transactionType: index < 3 ? "sale" : "rent",
        priceCents,
        status: "available",
      },
    }),
  );
  const made = await api("listings", "POST", {
    title: "Cinq places avec offres indépendantes",
    description:
      "Description factuelle des accès et des contraintes connues du parking. Les dimensions inconnues restent à relever lors de la visite.",
    city: "Paris",
    district: "Gare de Lyon",
    commercialDetails: { ...emptyCommercialDetails(), postalCode: "75012" },
    coordinates: [2.3739, 48.8446],
    pricingMode: "per_space",
    spaces,
    photos: ["/demo/covered.png", "/demo/box.png", "/demo/outdoor.png"],
  });
  assert.equal(made.status, 201);
  const confirmed = await api(`listings/${made.data.id}`, "PATCH", {
    version: made.data.version,
    locationConfirmedAt: new Date().toISOString(),
  });
  assert.equal(confirmed.status, 200);
  return confirmed.data;
}

test("a delayed autosave cannot overwrite a newer saved price and can resume after reloading", async () => {
  const draft = await completeDraft();
  const slow = delayed(`listings/${draft.id}`, "PATCH", {
    version: draft.version,
    title: "Titre de l’ancien onglet",
    spaces: draft.spaces,
  });
  const spaces = draft.spaces.map((space, index) =>
    index === 0
      ? { ...space, offer: { ...space.offer!, priceCents: 2850000 } }
      : space,
  );
  const newer = await api(`listings/${draft.id}`, "PATCH", {
    version: draft.version,
    title: "Titre de la version sauvegardée",
    spaces,
  });
  assert.equal(newer.status, 200);
  slow.release();
  const stale = await slow.response;
  const reloaded = await api(`listings/${draft.id}?draft=1`);
  assert.deepEqual(
    { status: stale.status, code: stale.code, title: reloaded.data.title },
    { status: 409, code: "VERSION_CONFLICT", title: newer.data.title },
  );
  assert.deepEqual(reloaded.data.spaces, spaces);
  const resumed = await api(`listings/${draft.id}`, "PATCH", {
    version: reloaded.data.version,
    description: `${draft.description} Informations reprises après le conflit.`,
  });
  assert.equal(resumed.status, 200);
  assert.deepEqual(resumed.data.spaces, spaces);
});

test("an autosave whose body arrives after submission cannot reopen the pending revision", async () => {
  const draft = await completeDraft();
  const slow = delayed(`listings/${draft.id}`, "PATCH", {
    version: draft.version,
    title: "Sauvegarde en retard sur la soumission",
  });
  const submitted = await api(`listings/${draft.id}/submit`, "POST", {
    version: draft.version,
    ownershipAttested: true,
  });
  assert.equal(submitted.status, 200);
  slow.release();
  const stale = await slow.response;
  const reloaded = await api(`listings/${draft.id}?draft=1`);
  assert.deepEqual(
    { status: stale.status, code: stale.code, state: reloaded.data.status },
    { status: 409, code: "VERSION_CONFLICT", state: "pending" },
  );
  const revision = db()
    .prepare("SELECT snapshot_json FROM revisions WHERE listing_id=?")
    .get(draft.id)!;
  assert.deepEqual(
    JSON.parse(String(revision.snapshot_json)).spaces,
    draft.spaces,
  );
});

test("a delayed submission cannot freeze an obsolete version after an autosave", async () => {
  const draft = await completeDraft();
  const slow = delayed(`listings/${draft.id}/submit`, "POST", {
    version: draft.version,
    ownershipAttested: true,
  });
  const saved = await api(`listings/${draft.id}`, "PATCH", {
    version: draft.version,
    title: "Dernier titre sauvegardé avant soumission",
  });
  assert.equal(saved.status, 200);
  slow.release();
  const stale = await slow.response;
  const reloaded = await api(`listings/${draft.id}?draft=1`);
  assert.deepEqual(
    { status: stale.status, code: stale.code, state: reloaded.data.status },
    { status: 409, code: "VERSION_CONFLICT", state: "draft" },
  );
  assert.equal(reloaded.data.title, saved.data.title);
  assert.equal(
    db()
      .prepare("SELECT COUNT(*) AS n FROM revisions WHERE listing_id=?")
      .get(draft.id)!.n,
    0,
  );
});
