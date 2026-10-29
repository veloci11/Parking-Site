import { test, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { db, resetDbForTests } from "../src/server/db";
import { handleApi } from "../src/server/api";
const dir = mkdtempSync(join(tmpdir(), "gp-admin-pagination-"));
process.env.GP_DATABASE_PATH = join(dir, "test.sqlite");
process.env.GP_FORCE_LOCAL_DEMO = "true";
const origin = "http://127.0.0.1:3000";
async function request(path: string, cookie = "", body?: unknown) {
  const r = await handleApi(
    new Request(`${origin}/api/${path}`, {
      method: body ? "POST" : "GET",
      headers: { origin, cookie, "content-type": "application/json" },
      ...(body ? { body: JSON.stringify(body) } : {}),
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
test("admin reaches every account beyond 100, searches literal name/id without private fields and rejects foreign cursors", async () => {
  const admin = (await request("auth/demo", "", { persona: "admin" })).cookie!;
  const member = (await request("auth/demo", "", { persona: "buyer" })).cookie!;
  const moderator = (await request("auth/demo", "", { persona: "moderator" }))
    .cookie!;
  const ids: string[] = [];
  for (let i = 1; i <= 135; i++) {
    const id = `f2490000-0000-4000-8000-${String(i).padStart(12, "0")}`;
    ids.push(id);
    db()
      .prepare(
        "INSERT INTO users(id,name,email,role,verified,created_at) VALUES(?,?,?,'member',1,?)",
      )
      .run(
        id,
        `Pagination Fixture ${i === 135 ? "100%" : i}`,
        `${id}@test.invalid`,
        new Date().toISOString(),
      );
  }
  const first = await request(
    "admin/users?q=Pagination%20Fixture&limit=100",
    admin,
  );
  assert.equal(first.status, 200);
  assert.equal(first.data.length, 100);
  assert.ok(first.nextCursor);
  const next = await request(
    `admin/users?q=Pagination%20Fixture&limit=100&cursor=${first.nextCursor}`,
    admin,
  );
  assert.equal(next.data.length, 35);
  assert.equal(next.nextCursor, null);
  assert.deepEqual(
    [...first.data, ...next.data].map((row: { id: string }) => row.id),
    ids,
  );
  assert.ok(
    first.data.every(
      (row: object) => !("email" in row) && !("password" in row),
    ),
  );
  const literal = await request("admin/users?q=%25&limit=50", admin);
  assert.equal(literal.data.length, 1);
  assert.equal(literal.data[0].id, ids[134]);
  assert.equal(
    (await request(`admin/users?q=${ids[134]}&limit=50`, admin)).data[0].id,
    ids[134],
  );
  assert.equal(
    (await request(`admin/users?q=other&cursor=${first.nextCursor}`, admin))
      .status,
    400,
  );
  for (const suffix of [
    "limit=101",
    "limit=0",
    "cursor=bad",
    "q=a&q=b",
    `q=${"a".repeat(81)}`,
  ])
    assert.equal((await request(`admin/users?${suffix}`, admin)).status, 400);
  assert.equal((await request("admin/users?limit=50", member)).status, 403);
  assert.equal((await request("admin/users?limit=50", moderator)).status, 403);
  assert.equal((await request("admin/users?limit=50")).status, 401);
  // Existing clients retain their bounded array envelope.
  assert.equal((await request("admin/users", admin)).data.length, 100);
});
