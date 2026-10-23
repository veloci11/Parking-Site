import { test, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { db, personas, resetDbForTests } from "../src/server/db";
import { handleApi } from "../src/server/api";
import { sceneDB } from "../src/server/scenes/local";
import { publicProjection } from "../src/server/catalog";
import { readApiJson } from "../src/server/json-body";
const dir = mkdtempSync(join(tmpdir(), "gp-condition-"));
process.env.GP_DATABASE_PATH = join(dir, "db.sqlite");
process.env.GP_FORCE_LOCAL_DEMO = "true";
const origin = "http://127.0.0.1:3000";
async function api(
  path: string,
  method = "GET",
  value?: unknown,
  cookie?: string,
) {
  const res = await handleApi(
    new Request(origin + "/api/" + path, {
      method,
      headers: {
        origin,
        "Content-Type": "application/json",
        ...(cookie ? { cookie } : {}),
      },
      body: value ? JSON.stringify(value) : undefined,
    }),
  );
  return {
    status: res.status,
    ...(await res.json()),
    cookie: res.headers.get("set-cookie")?.split(";")[0],
  };
}
after(() => {
  resetDbForTests();
  rmSync(dir, { recursive: true, force: true });
});
const condition = (spaceId: string | null = null) => ({
  id: randomUUID(),
  spaceId,
  category: "floor",
  value: "Fissure constatée",
  comment: "À vérifier sur place",
  sourceKind: "seller_declared",
  observedAt: null,
  evidenceMediaIds: [],
});
test("attribution and privacy survive draft edits; source ownership and actual unit-photo scope are enforced", async () => {
  const cookie = (await api("auth/demo", "POST", { persona: "seller" }))
    .cookie!;
  const id = "10000000-0000-4000-8000-000000000001";
  const original = JSON.parse(
    String(
      db().prepare("SELECT draft_json FROM listings WHERE id=?").get(id)!
        .draft_json,
    ),
  );
  const sid = original.spaces[0].id;
  const base = condition(sid);
  const first = await api(
    "listings/" + id,
    "PATCH",
    { version: 1, conditionObservations: [base] },
    cookie,
  );
  assert.equal(first.status, 200);
  assert.equal(first.data.conditionObservations[0].observerId, personas.seller);
  assert.equal(
    first.data.conditionObservations[0].confidenceScope,
    "unit_declared",
  );
  const pub = publicProjection(first.data);
  assert.equal(pub.conditionObservations![0].id, id + ":observation:1");
  assert.equal(pub.conditionObservations![0].spaceId, id + ":unit:1");
  assert.equal(pub.conditionObservations![0].observerId, undefined);
  assert.equal(pub.conditionObservations![0].sourceDocumentIds, undefined);
  assert.equal(
    (
      await api(
        "listings/" + id,
        "PATCH",
        {
          version: 2,
          conditionObservations: [{ ...base, observerId: personas.moderator }],
        },
        cookie,
      )
    ).status,
    400,
  );
  assert.equal(
    (
      await api(
        "listings/" + id,
        "PATCH",
        {
          version: 2,
          conditionObservations: [{ ...base, spaceId: randomUUID() }],
        },
        cookie,
      )
    ).status,
    400,
  );
  assert.equal(
    (
      await api(
        "listings/" + id,
        "PATCH",
        {
          version: 2,
          conditionObservations: [
            {
              ...base,
              sourceKind: "plan_derived",
              sourceDocumentIds: [randomUUID()],
            },
          ],
        },
        cookie,
      )
    ).status,
    400,
  );
  assert.equal(
    (
      await api(
        "listings/" + id,
        "PATCH",
        {
          version: 2,
          conditionObservations: [base, { ...base, id: randomUUID() }],
        },
        cookie,
      )
    ).status,
    400,
  );
  const mediaId = randomUUID();
  db()
    .prepare("INSERT INTO media VALUES(?,?,?,?,?,?)")
    .run(
      mediaId,
      personas.seller,
      id,
      "unused",
      "image/webp",
      new Date().toISOString(),
    );
  assert.equal(
    (
      await api(
        "listings/" + id,
        "PATCH",
        {
          version: 2,
          photos: [...original.photos, "/api/media/" + mediaId],
          conditionObservations: [
            {
              ...base,
              sourceKind: "photo_documented",
              evidenceMediaIds: [mediaId],
            },
          ],
        },
        cookie,
      )
    ).status,
    400,
  );
  const saved = await api(
    "listings/" + id,
    "PATCH",
    {
      version: 2,
      spacePhotos: { [sid]: ["/api/media/" + mediaId] },
      conditionObservations: [
        {
          ...base,
          sourceKind: "photo_documented",
          evidenceMediaIds: [mediaId],
        },
      ],
    },
    cookie,
  );
  assert.equal(saved.status, 200);
  assert.equal(
    saved.data.conditionObservations[0].sourceKind,
    "photo_documented",
  );
  const doc = randomUUID();
  sceneDB()
    .prepare(
      "INSERT INTO scene_sources(id,listing_id,owner_id,uploader_id,object_key,mime,byte_size,sha256,created_at) VALUES(?,?,?,?,?,?,?,?,?)",
    )
    .run(
      doc,
      id,
      personas.seller,
      personas.seller,
      "private-plan",
      "application/pdf",
      100,
      "a".repeat(64),
      new Date().toISOString(),
    );
  const plan = await api(
    "listings/" + id,
    "PATCH",
    {
      version: 3,
      conditionObservations: [
        { ...base, sourceKind: "plan_derived", sourceDocumentIds: [doc] },
      ],
    },
    cookie,
  );
  assert.equal(plan.status, 200);
  assert.equal(
    publicProjection(plan.data).conditionObservations![0].sourceDocumentIds,
    undefined,
  );
});
test("incomplete provenance is saved as draft, evidence becomes mandatory on submission", async () => {
  const cookie = (await api("auth/demo", "POST", { persona: "seller" }))
    .cookie!;
  const id = "10000000-0000-4000-8000-000000000002";
  const saved = await api(
    "listings/" + id,
    "PATCH",
    {
      version: 1,
      conditionObservations: [
        { ...condition(), sourceKind: "photo_documented" },
      ],
    },
    cookie,
  );
  assert.equal(saved.status, 200);
  const submitted = await api(
    "listings/" + id + "/submit",
    "POST",
    { version: 2, ownershipAttested: true },
    cookie,
  );
  assert.equal(submitted.status, 400);
});
test("only listing forms get the 16MiB bounded JSON allowance", async () => {
  let chunk = 0,
    cancelled = false;
  const stream = new ReadableStream<Uint8Array>({
    pull(controller) {
      controller.enqueue(new Uint8Array(chunk++ < 2 ? 8 * 1024 * 1024 : 1));
    },
    cancel() {
      cancelled = true;
    },
  });
  await assert.rejects(
    readApiJson(
      new Request(origin + "/api/listings", {
        method: "POST",
        body: stream,
        duplex: "half",
      } as RequestInit),
    ),
    (e: any) => e.status === 413,
  );
  assert.equal(cancelled, true);

  const text = JSON.stringify({ x: "a".repeat(150000) });
  assert.equal(
    (
      await readApiJson(
        new Request(origin + "/api/listings/" + randomUUID(), {
          method: "PATCH",
          body: text,
        }),
      )
    ).x.length,
    150000,
  );
  await assert.rejects(
    readApiJson(
      new Request(origin + "/api/auth/login", { method: "POST", body: text }),
    ),
    (e: any) => e.status === 413,
  );
  await assert.rejects(
    readApiJson(
      new Request(origin + "/api/listings", {
        method: "POST",
        headers: { "content-length": String(16 * 1024 * 1024 + 1) },
        body: "{}",
      }),
    ),
    (e: any) => e.status === 413,
  );
});
