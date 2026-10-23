import { test, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { db, resetDbForTests } from "../src/server/db";
import {
  createLocalContextReport,
  listLocalContextReports,
  detailLocalContextReport,
  decideLocalContextReport,
  appealLocalContextReport,
  handleContextReports,
} from "../src/server/reports-context";
import type { User } from "../src/lib/types";
const dir = mkdtempSync(join(tmpdir(), "gp-context-reports-"));
process.env.GP_DATABASE_PATH = join(dir, "qa.sqlite");
process.env.GP_FORCE_LOCAL_DEMO = "true";
after(() => {
  resetDbForTests();
  rmSync(dir, { recursive: true, force: true });
});
const actor = (id: string, role: User["role"] = "member"): User => ({
  id,
  name: id,
  email: `${id}@test.invalid`,
  emailVerified: true,
  role,
});
let seller: User,
  buyer: User,
  outsider: User,
  mod: User,
  conversationId: string,
  messageId: string;
function fixtures() {
  const sql = db();
  const rows = sql.prepare("SELECT * FROM users ORDER BY role").all();
  seller = actor(String(rows[0].id));
  buyer = actor(String(rows[1].id));
  mod = actor(
    String(rows.find((r) => r.role === "moderator")!.id),
    "moderator",
  );
  outsider = actor(randomUUID());
  sql
    .prepare(
      "INSERT INTO users(id,name,email,verified,status,created_at) VALUES(?,?,?,?,?,?)",
    )
    .run(
      outsider.id,
      "Tiers",
      outsider.email,
      1,
      "active",
      new Date().toISOString(),
    );
  const listing = sql.prepare("SELECT id FROM listings LIMIT 1").get()!;
  conversationId = randomUUID();
  sql
    .prepare("INSERT INTO conversations VALUES(?,?,?,?,?,?)")
    .run(
      conversationId,
      listing.id,
      buyer.id,
      seller.id,
      "2026-01-01T00:00:00Z",
      "2026-01-01T00:00:00Z",
    );
  for (let i = 0; i < 25; i++) {
    const id = randomUUID();
    if (i === 24) messageId = id;
    sql
      .prepare("INSERT INTO messages VALUES(?,?,?,?,?,?)")
      .run(
        id,
        conversationId,
        seller.id,
        `Message ${i + 1}`,
        `request-${i}`,
        new Date(Date.UTC(2026, 0, 1, 0, i)).toISOString(),
      );
  }
}
test("signalement gelé et dédupliqué, refus tiers, aucune lecture globale par modérateur", () => {
  fixtures();
  const input = {
    targetType: "message",
    targetId: messageId,
    category: "harassment",
    reason: "Ce message comporte des propos à examiner.",
    clientRequestId: randomUUID(),
  };
  const report = createLocalContextReport(buyer, input);
  assert.equal(createLocalContextReport(buyer, input).id, report.id);
  assert.equal(
    createLocalContextReport(buyer, { ...input, clientRequestId: randomUUID() })
      .id,
    report.id,
  );
  assert.throws(
    () =>
      createLocalContextReport(outsider, {
        ...input,
        clientRequestId: randomUUID(),
      }),
    /introuvable/,
  );
  assert.equal(detailLocalContextReport(buyer, report.id).evidence, null);
  assert.throws(
    () => detailLocalContextReport(outsider, report.id),
    /introuvable/,
  );
  assert.throws(() => listLocalContextReports(buyer, true), /modération/);
  const evidence = detailLocalContextReport(mod, report.id).evidence!;
  assert.equal(evidence.messages.length, 1);
  assert.equal(evidence.messages[0].id, messageId);
  assert.equal(evidence.scope, "reported_message_only");
  assert.equal(JSON.stringify(evidence).includes("@test.invalid"), false);
  db()
    .prepare(
      "UPDATE messages SET body='Texte changé après le signalement' WHERE id=?",
    )
    .run(messageId);
  assert.equal(
    detailLocalContextReport(mod, report.id).evidence!.messages[0].body,
    "Message 25",
  );
  const full = createLocalContextReport(buyer, {
    ...input,
    targetType: "conversation",
    targetId: conversationId,
    clientRequestId: randomUUID(),
  });
  const context = detailLocalContextReport(mod, full.id).evidence!;
  assert.equal(context.messages.length, 20);
  assert.equal(context.messages[0].body, "Message 6");
  assert.equal(context.scope, "last_20_at_report_time");
  assert.equal(
    db()
      .prepare(
        "SELECT count(*) n FROM audit WHERE action='context_report.context_read'",
      )
      .get()!.n,
    3,
  );
});
test("décisions versionnées, un réexamen propriétaire, historique et audits conservés", () => {
  const report = listLocalContextReports(buyer)[0];
  assert.throws(
    () =>
      decideLocalContextReport(buyer, report.id, {
        version: report.version,
        status: "dismissed",
        reason: "Décision non autorisée de test.",
      }),
    /modération/,
  );
  const decided = decideLocalContextReport(mod, report.id, {
    version: report.version,
    status: "reviewed",
    reason: "Le contexte transmis a été examiné par la modération.",
  });
  assert.equal(decided.version, report.version + 1);
  assert.throws(
    () =>
      decideLocalContextReport(mod, report.id, {
        version: report.version,
        status: "dismissed",
        reason: "Ancienne version ne doit pas être acceptée.",
      }),
    /changé/,
  );
  assert.throws(
    () =>
      appealLocalContextReport(outsider, report.id, {
        version: decided.version,
        reason: "Je demande un autre examen de ce dossier.",
      }),
    /introuvable/,
  );
  const appealed = appealLocalContextReport(buyer, report.id, {
    version: decided.version,
    reason: "Je demande un autre examen de ce dossier.",
  });
  assert.equal(appealed.status, "appealed");
  const final = decideLocalContextReport(mod, report.id, {
    version: appealed.version,
    status: "dismissed",
    reason: "Le second examen confirme la décision motivée du dossier.",
  });
  assert.throws(
    () =>
      appealLocalContextReport(buyer, report.id, {
        version: final.version,
        reason: "Nouvelle demande qui doit être refusée.",
      }),
    /déjà|changé/,
  );
  assert.equal(detailLocalContextReport(buyer, report.id).decisions.length, 2);
});
test("endpoint exige une vraie session et ne publie jamais le contexte", async () => {
  const r = await handleContextReports(
    new Request("http://127.0.0.1:3000/api/admin/report-context"),
  );
  assert.equal(r.status, 401);
  assert.equal(r.headers.get("cache-control"), "private, no-store");
  assert.equal((await r.json()).data, undefined);
});
