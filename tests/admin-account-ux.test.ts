import { test } from "node:test";
import assert from "node:assert/strict";
import {
  adaptationExpiryError,
  adminLocalDateTime,
  auditActionLabel,
  loadAdminAccountPage,
} from "../src/lib/admin-account-ux";

test("account lookup keeps the server cursor and carries the exact search into the next page", async () => {
  const controller = new AbortController();
  const requests: URL[] = [];
  const read = async <T>(path: string, options?: RequestInit) => {
    const url = new URL(path, "http://localhost");
    requests.push(url);
    assert.equal(options?.signal, controller.signal);
    assert.equal(options?.cache, "no-store");
    const next = url.searchParams.has("cursor");
    return {
      data: [{ id: next ? "last-account" : "first-account" }],
      nextCursor: next ? null : "opaque-cursor+1&2",
    } as T;
  };
  const first = await loadAdminAccountPage(
    read,
    "Nom & fils",
    null,
    controller.signal,
  );
  const next = await loadAdminAccountPage(
    read,
    "Nom & fils",
    first.nextCursor,
    controller.signal,
  );
  assert.equal(requests[0].pathname, "/api/admin/users");
  assert.equal(requests[0].searchParams.get("limit"), "50");
  assert.equal(requests[0].searchParams.get("cursor"), null);
  assert.equal(requests[1].searchParams.get("q"), "Nom & fils");
  assert.equal(requests[1].searchParams.get("cursor"), "opaque-cursor+1&2");
  assert.equal(next.data[0].id, "last-account");
  assert.equal(next.nextCursor, null);
});

test("account lookup propagates transport failures instead of inventing an empty list", async () => {
  await assert.rejects(
    loadAdminAccountPage(
      async () => {
        throw new Error("Indisponible");
      },
      "",
      null,
    ),
    /Indisponible/,
  );
});

test("editing an adaptation retains the local wall-clock expiry rather than shifting its UTC time", () => {
  const original = new Date("2026-11-02T18:45:00.000Z");
  const input = adminLocalDateTime(original.toISOString());
  assert.equal(Date.parse(input), original.getTime());
  assert.equal(adminLocalDateTime("invalid"), "");
});

test("adaptation expiry distinguishes missing, expired and over-90-day inputs", () => {
  const now = Date.parse("2026-10-27T12:00:00Z");
  assert.match(adaptationExpiryError("", now)!, /Choisissez/);
  assert.match(adaptationExpiryError("not-a-date", now)!, /Choisissez/);
  assert.match(
    adaptationExpiryError(new Date(now).toISOString(), now)!,
    /après/,
  );
  assert.equal(
    adaptationExpiryError(new Date(now + 90 * 86400000).toISOString(), now),
    null,
  );
  assert.match(
    adaptationExpiryError(
      new Date(now + 90 * 86400000 + 1).toISOString(),
      now,
    )!,
    /90 jours/,
  );
});

test("unknown audit actions remain exact so operational events are not misrepresented", () => {
  assert.equal(
    auditActionLabel("account.decision"),
    "Rôle ou statut du compte modifié",
  );
  assert.equal(auditActionLabel("future.action"), "future.action");
});
