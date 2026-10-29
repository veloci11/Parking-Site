import test, { after } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { db, resetDbForTests } from "../src/server/db";
import { handleApi } from "../src/server/api";
import type { AdminPublication } from "../src/lib/admin-review-publication";

const directory = mkdtempSync(join(tmpdir(), "gp-publication-review-"));
process.env.GP_DATABASE_PATH = join(directory, "test.sqlite");
process.env.GP_FORCE_LOCAL_DEMO = "true";
const origin = "http://127.0.0.1:3000";
async function api(path: string, cookie = "", payload?: unknown) {
  const response = await handleApi(
    new Request(`${origin}/api/${path}`, {
      method: payload ? "POST" : "GET",
      headers: { origin, cookie, "content-type": "application/json" },
      body: payload ? JSON.stringify(payload) : undefined,
    }),
  );
  return {
    ...(await response.json()),
    httpStatus: response.status,
    cookie: response.headers.get("set-cookie")?.split(";")[0],
  };
}
after(() => {
  resetDbForTests();
  rmSync(directory, { recursive: true, force: true });
});

test("publication review shows the approved snapshot after draft rejection and suspends with current version", async () => {
  const moderator = (await api("auth/demo", "", { persona: "moderator" }))
    .cookie;
  const buyer = (await api("auth/demo", "", { persona: "buyer" })).cookie;
  assert.equal((await api("admin/publications")).httpStatus, 401);
  assert.equal((await api("admin/publications", buyer)).httpStatus, 403);
  const initial = await api("admin/publications", moderator);
  assert.equal(initial.httpStatus, 200);
  const approved: AdminPublication = initial.data[0];
  assert.ok(approved);
  const row = db()
    .prepare("SELECT * FROM listings WHERE id=?")
    .get(approved.id)!;
  const snapshot = JSON.parse(String(row.public_json));
  const changedDraft = {
    ...JSON.parse(String(row.draft_json)),
    title: "Brouillon refusé, ne doit jamais représenter la publication",
    priceCents: 99999999,
    photos: [],
  };
  const currentVersion = Number(row.version) + 4;
  db()
    .prepare(
      "UPDATE listings SET draft_json=?,version=?,status='rejected' WHERE id=?",
    )
    .run(JSON.stringify(changedDraft), currentVersion, approved.id);

  const response = await api("admin/publications", moderator);
  const publication: AdminPublication = response.data.find(
    (item: AdminPublication) => item.id === approved.id,
  );
  assert.equal(publication.title, snapshot.title);
  assert.equal(publication.priceCents, snapshot.priceCents);
  assert.deepEqual(publication.photos, snapshot.photos);
  assert.equal(publication.publishedVersion, snapshot.version);
  assert.equal(publication.version, currentVersion);
  assert.equal(publication.status, "rejected");
  assert.equal(publication.publicationState, "visible");

  const stale = await api(`admin/listings/${approved.id}/suspend`, moderator, {
    version: snapshot.version,
    reason: "Vérification des informations de publication nécessaire.",
  });
  assert.equal(stale.httpStatus, 409);
  const suspended = await api(
    `admin/listings/${approved.id}/suspend`,
    moderator,
    {
      version: publication.version,
      reason: "Vérification des informations de publication nécessaire.",
    },
  );
  assert.equal(suspended.httpStatus, 200);
  assert.equal(suspended.data.status, "suspended");
  assert.equal(
    (await api("admin/publications", moderator)).data.some(
      (item: AdminPublication) => item.id === approved.id,
    ),
    false,
  );
});

test("retained paused snapshots are labelled hidden instead of active", async () => {
  const moderator = (await api("auth/demo", "", { persona: "moderator" }))
    .cookie;
  const result = await api("admin/publications", moderator);
  const publication: AdminPublication = result.data[0];
  assert.ok(publication);
  db()
    .prepare("UPDATE listings SET status='paused',version=version+1 WHERE id=?")
    .run(publication.id);
  const paused: AdminPublication = (
    await api("admin/publications", moderator)
  ).data.find((item: AdminPublication) => item.id === publication.id);
  assert.equal(paused.status, "paused");
  assert.equal(paused.publicationState, "hidden");
  assert.equal(paused.publishedVersion, publication.publishedVersion);
  assert.equal(paused.version, publication.version + 1);
  assert.equal(paused.priceCents, publication.priceCents);
});
