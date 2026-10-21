import { test, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import sharp from "sharp";
import { mediaVariantWidth } from "../src/server/media-variants";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { handleApi } from "../src/server/api";
import { db, resetDbForTests } from "../src/server/db";
import { publicProjection } from "../src/server/catalog";
import { draftSchema } from "../src/server/validation";
import { validatePhotoLinks } from "../src/server/media-links";
import type { Listing } from "../src/lib/types";
const dir = mkdtempSync(join(tmpdir(), "gp-suspend-"));
process.env.GP_DATABASE_PATH = join(dir, "test.sqlite");
process.env.GP_LOCAL_DEMO = "true";
const origin = "http://127.0.0.1:3000";
async function api(
  path: string,
  method = "GET",
  data?: unknown,
  cookie?: string,
) {
  const res = await handleApi(
    new Request(`${origin}/api/${path}`, {
      method,
      headers: {
        origin,
        ...(cookie ? { cookie } : {}),
        "Content-Type": "application/json",
      },
      body: data ? JSON.stringify(data) : undefined,
    }),
  );
  return {
    status: res.status,
    data: (await res.json()).data,
    cookie: res.headers.get("set-cookie")?.split(";")[0],
  };
}
after(() => {
  resetDbForTests();
  rmSync(dir, { recursive: true, force: true });
});
test("unit quality is independent, keyed to an owned unit and explicitly projected", () => {
  const row = db().prepare("SELECT draft_json FROM listings LIMIT 1").get()!;
  const value = JSON.parse(String(row.draft_json)) as Listing;
  const q = {
    ...value.quality,
    observations: "Fissure visible propre à cette place",
    privatePlanKey: "must-not-leak",
  };
  value.spaces.push({
    ...value.spaces[0],
    id: "private-unit-two",
    number: "2",
  });
  value.unitQuality = { [value.spaces[0].id]: q };
  const pub = publicProjection(value);
  assert.deepEqual(Object.keys(pub.unitQuality!), [`${value.id}:unit:1`]);
  assert.equal(
    pub.unitQuality![`${value.id}:unit:1`].observations,
    q.observations,
  );
  assert.equal(
    (pub.unitQuality![`${value.id}:unit:1`] as any).privatePlanKey,
    undefined,
  );
  assert.equal(pub.unitQuality![`${value.id}:unit:2`], undefined);
  assert.throws(() =>
    validatePhotoLinks({ ...value, unitQuality: { foreign: q } }),
  );
  assert.equal(
    draftSchema.safeParse({
      unitQuality: { [value.spaces[0].id]: { ...q, observations: 3 } },
    }).success,
    false,
  );
});
test("conversation blocks are private, bilateral, persist after refresh and preserve cancellation", async () => {
  const seller = (await api("auth/demo", "POST", { persona: "seller" }))
    .cookie!;
  const buyer = (await api("auth/demo", "POST", { persona: "buyer" })).cookie!;
  const moderator = (await api("auth/demo", "POST", { persona: "moderator" }))
    .cookie!;
  const c = (
    await api(
      "conversations",
      "POST",
      { listingId: "10000000-0000-4000-8000-000000000002" },
      buyer,
    )
  ).data.id;
  const second = (
    await api(
      "conversations",
      "POST",
      { listingId: "10000000-0000-4000-8000-000000000003" },
      buyer,
    )
  ).data.id;
  const v = await api(
    `conversations/${c}/visits`,
    "POST",
    { clientRequestId: "visit-before-block" },
    buyer,
  );
  assert.equal(v.status, 201);
  assert.equal(
    (await api(`conversations/${c}/block`, "PUT", undefined, moderator)).status,
    403,
  );
  assert.equal(
    (await api(`conversations/${c}/block`, "PUT", undefined, buyer)).data
      .blockedByMe,
    true,
  );
  assert.deepEqual(
    (await api(`conversations/${c}/block`, "GET", undefined, seller)).data,
    { blockedByMe: false, blocked: true },
  );
  assert.equal(
    (await api(`conversations/${second}/block`, "GET", undefined, buyer)).data
      .blockedByMe,
    true,
  );
  assert.equal(
    (
      await api(
        `conversations/${second}/messages`,
        "POST",
        {
          body: "Contournement autre annonce",
          clientRequestId: "cross-thread-message",
        },
        buyer,
      )
    ).status,
    409,
  );
  assert.equal(
    (
      await api(
        "conversations",
        "POST",
        { listingId: "10000000-0000-4000-8000-000000000004" },
        buyer,
      )
    ).status,
    409,
  );
  await api(`conversations/${second}/block`, "PUT", undefined, buyer);
  for (const cookie of [seller, buyer])
    assert.equal(
      (
        await api(
          `conversations/${c}/messages`,
          "POST",
          {
            body: "Message interdit",
            clientRequestId: "blocked-message-" + cookie.slice(-15),
          },
          cookie,
        )
      ).status,
      409,
    );
  assert.equal(
    (
      await api(
        `conversations/${c}/visits`,
        "POST",
        { clientRequestId: "blocked-visit-request" },
        buyer,
      )
    ).status,
    409,
  );
  assert.equal(
    (await api(`conversations/${c}/messages`, "GET", undefined, buyer)).status,
    200,
  );
  assert.equal(
    (
      await api(
        `visits/${v.data.id}/decision`,
        "POST",
        { action: "cancel", version: 1 },
        buyer,
      )
    ).status,
    200,
  );
  await api(`conversations/${c}/block`, "PUT", undefined, seller);
  assert.equal(
    (await api(`conversations/${c}/block`, "DELETE", undefined, buyer)).data
      .blocked,
    true,
  );
  assert.equal(
    (await api("conversations", "GET", undefined, buyer)).data.find(
      (x: any) => x.id === c,
    ).blocked,
    true,
  );
  assert.equal(
    (await api(`conversations/${c}/block`, "DELETE", undefined, seller)).data
      .blocked,
    false,
  );
  assert.equal(
    (await api(`conversations/${second}/block`, "GET", undefined, buyer)).data
      .blockedByMe,
    false,
  );
  assert.equal(
    (await api(`conversations/${second}/block`, "GET", undefined, buyer)).data
      .blocked,
    false,
  );
  assert.equal(
    (
      await api(
        `conversations/${c}/messages`,
        "POST",
        {
          body: "Message possible après déblocage mutuel",
          clientRequestId: "unblocked-message-request",
        },
        buyer,
      )
    ).status,
    201,
  );
});
test("media resize widths are an explicit allowlist", () => {
  for (const width of ["100", "0480", "960.0", "1921"]) {
    assert.throws(() => mediaVariantWidth(new URL(origin + "?w=" + width)));
  }
  assert.throws(() => mediaVariantWidth(new URL(origin + "?w=480&w=960")));
  assert.equal(mediaVariantWidth(new URL(origin + "?w=960")), 960);
});
test("moderator suspends existing publication with version, audit and conversation preservation; seller cannot resume", async () => {
  const seller = (await api("auth/demo", "POST", { persona: "seller" }))
    .cookie!;
  const mod = (await api("auth/demo", "POST", { persona: "moderator" }))
    .cookie!;
  const buyer = (await api("auth/demo", "POST", { persona: "buyer" })).cookie!;
  const id = "10000000-0000-4000-8000-000000000001";
  const conversation = await api(
    "conversations",
    "POST",
    { listingId: id },
    buyer,
  );
  assert.equal(conversation.status, 201);
  assert.equal(
    (
      await api(
        `admin/listings/${id}/suspend`,
        "POST",
        { version: 1, reason: "Motif suffisamment détaillé" },
        seller,
      )
    ).status,
    403,
  );
  assert.equal(
    (
      await api(
        `admin/listings/${id}/suspend`,
        "POST",
        { version: 1, reason: "court" },
        mod,
      )
    ).status,
    400,
  );
  assert.equal(
    (
      await api(
        `admin/listings/${id}/suspend`,
        "POST",
        { version: 99, reason: "Motif suffisamment détaillé" },
        mod,
      )
    ).status,
    409,
  );
  const list = await api("admin/publications", "GET", undefined, mod);
  assert.ok(list.data.some((l: Listing) => l.id === id));
  const mediaId = "e1000000-0000-4000-8000-000000000001";
  const mediaPath = join(dir, "variant.webp");
  writeFileSync(
    mediaPath,
    await sharp({
      create: { width: 1200, height: 900, channels: 3, background: "white" },
    })
      .webp()
      .toBuffer(),
  );
  const row = db().prepare("SELECT * FROM listings WHERE id=?").get(id)!;
  db()
    .prepare("INSERT INTO media VALUES(?,?,?,?,?,?)")
    .run(
      mediaId,
      row.seller_id,
      id,
      mediaPath,
      "image/webp",
      new Date().toISOString(),
    );
  const published = JSON.parse(String(row.public_json));
  published.photos.push(`/api/media/${mediaId}`);
  db()
    .prepare("UPDATE listings SET public_json=? WHERE id=?")
    .run(JSON.stringify(published), id);
  for (const width of [480, 960, 1920]) {
    const res = await handleApi(
      new Request(`${origin}/api/media/${mediaId}?w=${width}`),
    );
    assert.equal(res.status, 200);
    assert.ok(res.headers.get("cache-control")?.includes("no-store"));
    const metadata = await sharp(
      Buffer.from(await res.arrayBuffer()),
    ).metadata();
    assert.equal(metadata.width, Math.min(width, 1200));
  }
  const suspension = await api(
    `admin/listings/${id}/suspend`,
    "POST",
    { version: 1, reason: "Infiltration constatée, vérification nécessaire" },
    mod,
  );
  assert.equal(suspension.status, 200);
  assert.equal(suspension.data.status, "suspended");
  for (const width of [480, 960, 1920])
    assert.equal(
      (
        await handleApi(
          new Request(`${origin}/api/media/${mediaId}?w=${width}`),
        )
      ).status,
      404,
    );
  assert.equal((await api(`listings/${id}`)).status, 404);
  assert.equal(
    (
      await api(
        `listings/${id}/lifecycle`,
        "POST",
        { version: 2, action: "resume" },
        seller,
      )
    ).status,
    409,
  );
  assert.equal(
    (
      await api(
        `listings/${id}/lifecycle`,
        "POST",
        { version: 2, action: "pause" },
        seller,
      )
    ).status,
    409,
  );
  const correction = await api(
    `listings/${id}`,
    "PATCH",
    { version: 2, title: "Place corrigée après inspection" },
    seller,
  );
  assert.equal(correction.status, 200);
  assert.equal(
    (
      await api(
        `listings/${id}/lifecycle`,
        "POST",
        { version: 3, action: "pause" },
        seller,
      )
    ).status,
    409,
  );
  assert.equal(
    (
      await api(
        `conversations/${conversation.data.id}/messages`,
        "GET",
        undefined,
        buyer,
      )
    ).status,
    200,
  );
  assert.equal(
    db()
      .prepare(
        "SELECT count(*) n FROM audit WHERE action='moderation.suspend' AND target_id=?",
      )
      .get(id)?.n,
    1,
  );
});
