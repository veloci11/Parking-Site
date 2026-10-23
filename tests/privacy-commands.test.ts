import { test, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { db, resetDbForTests } from "../src/server/db";
import { handleAuthCommands } from "../src/server/auth-commands";
import { handlePrivacyCommands } from "../src/server/privacy-commands";
import { handleApi } from "../src/server/api";
import { localAuthPolicy } from "../src/lib/auth-return";
const dir = mkdtempSync(join(tmpdir(), "gp-privacy-"));
process.env.GP_FORCE_LOCAL_DEMO = "true";
process.env.GP_DATABASE_PATH = join(dir, "qa.sqlite");
after(() => {
  resetDbForTests();
  rmSync(dir, { recursive: true, force: true });
});
const req = (path: string, body?: unknown, cookie = "") =>
  new Request("http://127.0.0.1:3000/api/" + path, {
    method: body ? "POST" : "GET",
    headers: {
      origin: "http://127.0.0.1:3000",
      "content-type": "application/json",
      cookie,
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
let cookie = "",
  id = "";
const password = "QA-private-password-123";
test("export privé réauthentifié comprend les catégories sans secrets ni données du tiers", async () => {
  const created = await handleAuthCommands(
    req("auth/commands/register", {
      name: "QA Privacy",
      email: randomUUID() + "@test.invalid",
      password,
      ...localAuthPolicy,
      termsAccepted: true,
    }),
  );
  assert.equal(created.status, 201);
  id = (await created.json()).data.id;
  cookie = created.headers
    .getSetCookie()
    .map((v) => v.split(";")[0])
    .join("; ");
  const oldGet = await handleApi(req("me/export", undefined, cookie));
  assert.equal(
    oldGet.status,
    405,
    "Legacy GET export cannot bypass password confirmation",
  );
  assert.equal(
    (await handleApi(req("me/export", { password: "wrong" }, cookie))).status,
    403,
  );
  assert.equal(
    (
      await handlePrivacyCommands(
        req("privacy/export", { password: "wrong" }, cookie),
      )
    ).status,
    403,
  );
  const r = await handlePrivacyCommands(
    req("privacy/export", { password }, cookie),
  );
  assert.equal(r.status, 200);
  const data = (await r.json()).data;
  assert.equal(data.profile.id, id);
  for (const key of [
    "favorites",
    "conversations",
    "messagesSent",
    "visits",
    "notifications",
    "termsAcceptances",
    "sceneSourcesOwned",
    "auditAboutMe",
  ])
    assert.ok(Array.isArray(data[key]), key);
  assert.equal(data.termsAcceptances.length, 1);
  assert.equal(JSON.stringify(data).includes("token_hash"), false);
  assert.equal(JSON.stringify(data).includes(password), false);
  assert.equal(data.profile.password, undefined);
});
test("suppression durable désactive, cache les annonces et conserve historique ; reçu privé seul permet le suivi", async () => {
  assert.equal(
    (
      await handlePrivacyCommands(
        req("privacy/delete", { password, confirmation: "NON" }, cookie),
      )
    ).status,
    400,
  );
  const r = await handleApi(
    req("me/delete", { password, confirmation: "SUPPRIMER" }, cookie),
  );
  assert.equal(r.status, 201);
  const value = (await r.json()).data;
  assert.equal(value.completeErasure, false);
  assert.equal(
    db().prepare("SELECT status FROM users WHERE id=?").get(id)?.status,
    "deletion_pending",
  );
  assert.equal(
    db().prepare("SELECT count(*) n FROM sessions WHERE user_id=?").get(id)?.n,
    0,
  );
  const receipt = r.headers
    .getSetCookie()
    .find((v) => v.startsWith("gp_privacy_receipt="))!
    .split(";")[0];
  assert.match(receipt, /gp_privacy_receipt=/);
  assert.equal(
    (await handlePrivacyCommands(req("privacy/status"))).status,
    404,
  );
  const status = await handlePrivacyCommands(
    req("privacy/status", undefined, receipt),
  );
  assert.equal(status.status, 200);
  const data = (await status.json()).data;
  assert.equal(data.state, "requested");
  assert.equal(data.completeErasure, false);
  assert.equal(data.userId, undefined);
  assert.equal(
    (
      await handlePrivacyCommands(
        req("privacy/status", undefined, receipt + "bad"),
      )
    ).status,
    404,
  );
  assert.equal(
    (await handlePrivacyCommands(req("privacy/export", { password }, cookie)))
      .status,
    401,
  );
});
