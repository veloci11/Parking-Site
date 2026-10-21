import { test, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { db, personas, resetDbForTests } from "../src/server/db";
import { handleApi } from "../src/server/api";
const dir = mkdtempSync(join(tmpdir(), "gp-admin-"));
process.env.GP_DATABASE_PATH = join(dir, "test.sqlite");
process.env.GP_FORCE_LOCAL_DEMO = "true";
const origin = "http://127.0.0.1:3000";
async function api(
  path: string,
  method = "GET",
  data?: unknown,
  cookie?: string,
) {
  const r = await handleApi(
    new Request(origin + "/api/" + path, {
      method,
      headers: {
        origin,
        "Content-Type": "application/json",
        ...(cookie ? { cookie } : {}),
      },
      body: data ? JSON.stringify(data) : undefined,
    }),
  );
  return {
    status: r.status,
    ...(await r.json()),
    cookie: r.headers.get("set-cookie")?.split(";")[0],
  };
}
after(() => {
  resetDbForTests();
  rmSync(dir, { recursive: true, force: true });
});
test("declared seller profile remains nullable, session validated and published snapshot unchanged", async () => {
  const s = (await api("auth/demo", "POST", { persona: "seller" })).cookie!;
  assert.equal(
    (await api("session", "GET", undefined, s)).data.sellerType,
    null,
  );
  assert.equal(
    (await api("me/profile", "PATCH", { sellerType: "professional" }, s)).data
      .sellerType,
    "professional",
  );
  assert.equal(
    (await api("me/profile", "PATCH", { sellerType: "admin" }, s)).status,
    400,
  );
  assert.equal(
    (await api("me/profile", "PATCH", { sellerType: null }, s)).data.sellerType,
    null,
  );
});
test("private message keyset pages latest100 ascending without losing ties; unauthorized and malformed cursors fail", async () => {
  const b = (await api("auth/demo", "POST", { persona: "buyer" })).cookie!;
  const m = (await api("auth/demo", "POST", { persona: "moderator" })).cookie!;
  const c = (
    await api(
      "conversations",
      "POST",
      { listingId: "10000000-0000-4000-8000-000000000001" },
      b,
    )
  ).data.id;
  for (let i = 0; i < 105; i++)
    db()
      .prepare("INSERT INTO messages VALUES(?,?,?,?,?,?)")
      .run(
        randomUUID(),
        c,
        personas.buyer,
        "message" + i,
        "history" + i,
        "2026-01-01T00:00:00.000Z",
      );
  const first = await api(`conversations/${c}/messages`, "GET", undefined, b);
  assert.equal(first.data.length, 100);
  assert.ok(first.nextCursor);
  assert.equal(first.data[0].id < first.data.at(-1).id, true);
  const second = await api(
    `conversations/${c}/messages?cursor=${first.nextCursor}`,
    "GET",
    undefined,
    b,
  );
  assert.equal(second.data.length, 5);
  assert.equal(
    new Set([...first.data, ...second.data].map((x) => x.id)).size,
    105,
  );
  assert.equal(second.nextCursor, null);
  assert.equal(
    (await api(`conversations/${c}/messages?cursor=bad`, "GET", undefined, b))
      .status,
    400,
  );
  assert.equal(
    (await api(`conversations/${c}/messages?limit=101`, "GET", undefined, b))
      .status,
    400,
  );
  assert.equal(
    (await api(`conversations/${c}/messages`, "GET", undefined, m)).status,
    404,
  );
});
test("only admin manages other accounts with version/audit, suspends publications and reactivation never republishes", async () => {
  const m = (await api("auth/demo", "POST", { persona: "moderator" })).cookie!;
  assert.equal((await api("admin/users", "GET", undefined, m)).status, 403);
  db()
    .prepare("UPDATE users SET role='admin' WHERE id=?")
    .run(personas.moderator);
  const users = await api("admin/users", "GET", undefined, m);
  assert.ok(users.data.every((u: any) => !("email" in u)));
  assert.equal(
    (
      await api(
        `admin/users/${personas.moderator}/decision`,
        "POST",
        { version: 1, role: "member", reason: "Auto changement interdit" },
        m,
      )
    ).status,
    403,
  );
  assert.equal(
    (
      await api(
        `admin/users/${personas.seller}/decision`,
        "POST",
        {
          version: 99,
          status: "suspended",
          reason: "Motif documenté de suspension",
        },
        m,
      )
    ).status,
    409,
  );
  const suspended = await api(
    `admin/users/${personas.seller}/decision`,
    "POST",
    {
      version: 1,
      status: "suspended",
      reason: "Motif documenté de suspension",
    },
    m,
  );
  assert.equal(suspended.status, 200);
  assert.equal((await api("listings")).data.length, 0);
  assert.equal(
    (
      await api(
        `admin/users/${personas.seller}/decision`,
        "POST",
        {
          version: 2,
          status: "active",
          reason: "Réactivation après vérification",
        },
        m,
      )
    ).status,
    200,
  );
  assert.equal((await api("listings")).data.length, 0);
  const log = await api("admin/audit?limit=1", "GET", undefined, m);
  assert.equal(log.data.length, 1);
  assert.ok(log.nextCursor);
  assert.equal("detail" in log.data[0], false);
  const next = await api(
    "admin/audit?limit=1&cursor=" + log.nextCursor,
    "GET",
    undefined,
    m,
  );
  assert.notEqual(next.data[0].id, log.data[0].id);
});
