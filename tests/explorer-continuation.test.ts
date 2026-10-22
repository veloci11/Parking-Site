import { after, test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  encodeExplorerContinuation,
  explorerRequestError,
  loadExplorerWindow,
  restoredResultCount,
} from "../src/lib/explorer-continuation";
import {
  emptySearch,
  readSearch,
  searchParams,
} from "../src/lib/search-client";
import { db, personas, resetDbForTests } from "../src/server/db";
import { handleApi } from "../src/server/api";
import type { Listing } from "../src/lib/types";

const directory = mkdtempSync(join(tmpdir(), "gp-explorer-continuation-"));
process.env.GP_DATABASE_PATH = join(directory, "test.sqlite");
process.env.GP_FORCE_LOCAL_DEMO = "true";
after(() => {
  resetDbForTests();
  rmSync(directory, { recursive: true, force: true });
});

test("return after two result pages reloads current public offers and a usable cursor with the same filters and selection", async () => {
  const sql = db();
  const base = JSON.parse(
    String(
      sql.prepare("SELECT draft_json FROM listings LIMIT 1").get()!.draft_json,
    ),
  ) as Listing;
  const insert = (index: number, published = true) => {
    const value: Listing = {
      ...base,
      id: randomUUID(),
      title: `Annonce fictive de continuation ${index}`,
      slug: `continuation-${index}`,
      type: "covered",
      pricingMode: "lot",
      transactionType: "sale",
      priceCents: 1000000 + index * 1000,
      status: published ? "published" : "draft",
      spaces: [{ ...base.spaces[0], id: randomUUID() }],
    };
    sql
      .prepare(
        "INSERT INTO listings(id,seller_id,draft_json,public_json,status,created_at,updated_at,published_at) VALUES(?,?,?,?,?,?,?,?)",
      )
      .run(
        value.id,
        personas.seller,
        JSON.stringify(value),
        published ? JSON.stringify(value) : null,
        value.status,
        value.createdAt,
        value.updatedAt,
        value.createdAt,
      );
    return value;
  };
  const offers = Array.from({ length: 62 }, (_, index) => insert(index));
  const privateDraft = insert(63, false);
  const state = {
    ...emptySearch,
    city: "Paris",
    sort: "price_asc",
    type: "covered",
  };
  const context = "explore:single:" + searchParams(state, true);
  const query = searchParams(state, true);
  query.set(
    "ids",
    [...offers, privateDraft].map((listing) => listing.id).join(","),
  );
  const calls: string[] = [];
  const request = (url: string) => {
    calls.push(url);
    return handleApi(new Request("http://127.0.0.1" + url));
  };
  const initial = await loadExplorerWindow(query, 48, request);
  assert.equal(initial?.data.length, 48);
  const selected = initial!.data[39];
  const href =
    "/?" + searchParams(state) + "&display=map&listing=" + selected.id;
  const stored = encodeExplorerContinuation(
    context,
    initial!.data.length,
    1000,
  );
  assert.deepEqual(Object.keys(JSON.parse(stored)), [
    "context",
    "count",
    "savedAt",
  ]);
  assert.ok(!stored.includes(selected.id));
  assert.ok(!stored.includes(selected.title));

  // The browser stores no results: a withdrawal and price change while away are visible on return.
  sql
    .prepare(
      "UPDATE listings SET public_json=NULL,status='withdrawn' WHERE id=?",
    )
    .run(offers[5].id);
  const changed = { ...offers[39], priceCents: offers[39].priceCents + 50 };
  sql
    .prepare("UPDATE listings SET public_json=? WHERE id=?")
    .run(JSON.stringify(changed), changed.id);
  const returnUrl = new URL(href, "http://127.0.0.1");
  const restoredState = readSearch(returnUrl.searchParams);
  assert.deepEqual(restoredState, state);
  const count = restoredResultCount(
    stored,
    "explore:single:" + searchParams(restoredState, true),
    2000,
  );
  query.set("cursor", "an-old-cursor-must-not-be-replayed");
  calls.length = 0;
  const restored = await loadExplorerWindow(query, count, request);
  assert.equal(calls.length, 2);
  assert.equal(
    new URL(calls[0], "http://127.0.0.1").searchParams.has("cursor"),
    false,
  );
  assert.equal(restored?.data.length, 48);
  assert.equal(restored?.total, 61);
  assert.equal(
    restored?.data.find(
      (item) => item.id === returnUrl.searchParams.get("listing"),
    )?.priceCents,
    changed.priceCents,
  );
  assert.ok(
    !restored?.data.some(
      (item) => item.id === offers[5].id || item.id === privateDraft.id,
    ),
  );
  assert.ok(restored?.nextCursor);
  const next = new URLSearchParams(query);
  next.set("cursor", restored!.nextCursor!);
  next.set("limit", "24");
  const remaining = await (await request("/api/listings?" + next)).json();
  assert.equal(remaining.data.length, 13);
  assert.equal(remaining.nextCursor, null);
  assert.equal(
    new Set([...restored!.data, ...remaining.data].map((item) => item.id)).size,
    61,
  );
});

test("continuation depth expires and cannot carry over to a different filter or sort or accept a corrupt depth", () => {
  const saved = encodeExplorerContinuation("sale:Paris:recent", 48, 1000);
  assert.equal(restoredResultCount(saved, "sale:Paris:recent", 2000), 48);
  for (const changed of [
    "rent:Paris:recent",
    "sale:Versailles:recent",
    "sale:Paris:price_asc",
  ])
    assert.equal(restoredResultCount(saved, changed, 2000), 24);
  assert.equal(
    restoredResultCount(saved, "sale:Paris:recent", 31 * 60 * 1000),
    24,
  );
  assert.equal(restoredResultCount(saved, "sale:Paris:recent", 0), 24);
  assert.equal(restoredResultCount("{broken", "sale:Paris:recent"), 24);
  assert.equal(
    restoredResultCount(
      encodeExplorerContinuation("sale", 100001, 1000),
      "sale",
      2000,
    ),
    24,
  );
});

test("return beyond 240 offers retains the visited depth, selected result and next cursor", async () => {
  const catalog = Array.from({ length: 310 }, (_, index) => ({
    id: `public-${index}`,
    priceCents: index * 1000,
  }));
  const context = "explore:single:sort=price_asc";
  const saved = encodeExplorerContinuation(context, 264, 1000);
  const requests: number[] = [];
  const restored = await loadExplorerWindow(
    new URLSearchParams("sort=price_asc"),
    restoredResultCount(saved, context, 2000),
    async (url) => {
      const params = new URL(url, "http://127.0.0.1").searchParams;
      const start = Number(params.get("cursor") || 0);
      const limit = Number(params.get("limit"));
      requests.push(start);
      return {
        ok: true,
        json: async () => ({
          data: catalog.slice(start, start + limit),
          nextCursor:
            start + limit < catalog.length ? String(start + limit) : null,
          total: catalog.length,
        }),
      };
    },
  );
  assert.equal(requests.length, 11);
  assert.equal(restored?.data.length, 264);
  assert.equal(restored?.data[251].id, "public-251");
  assert.equal(restored?.nextCursor, "264");
  assert.equal(restored?.total, 310);
});

test("obsolete restoration stops before the next page; a broken cursor never loops indefinitely", async () => {
  let current = true;
  let calls = 0;
  const cancelled = await loadExplorerWindow(
    new URLSearchParams(),
    48,
    async () => {
      calls++;
      current = false;
      return { ok: true, json: async () => ({ data: [], nextCursor: "next" }) };
    },
    () => current,
  );
  assert.equal(cancelled, null);
  assert.equal(calls, 1);
  calls = 0;
  await assert.rejects(
    loadExplorerWindow(new URLSearchParams(), 72, async () => {
      calls++;
      return {
        ok: true,
        json: async () => ({
          data: [{ id: "same" }],
          nextCursor: "same-cursor",
          total: 72,
        }),
      };
    }),
    /résultats ont changé/,
  );
  assert.equal(calls, 2);
});

test("network errors give a useful French retry message while server validation remains specific", () => {
  assert.match(
    explorerRequestError(new TypeError("Failed to fetch")),
    /connexion.*réessayez.*critères/i,
  );
  assert.equal(
    explorerRequestError(new Error("Le budget minimum dépasse le maximum.")),
    "Le budget minimum dépasse le maximum.",
  );
  assert.match(
    explorerRequestError(new SyntaxError("Unexpected token")),
    /réponse.*incomplète/i,
  );
});
