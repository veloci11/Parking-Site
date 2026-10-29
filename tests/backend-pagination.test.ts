import { test, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { randomUUID } from "node:crypto";
import { db, personas, resetDbForTests } from "../src/server/db";
import {
  localCatalogPage,
  decodeCursor,
  parsePageQuery,
  type PageFilters,
} from "../src/server/pagination";
const folder = mkdtempSync(join(tmpdir(), "gp-keyset-"));
process.env.GP_DATABASE_PATH = join(folder, "test.sqlite");
process.env.GP_FORCE_LOCAL_DEMO = "true";
const filters: PageFilters = {
  query: "",
  type: null,
  maxPrice: null,
  minArea: null,
  sort: "price_asc",
  scene: false,
};
after(() => {
  resetDbForTests();
  rmSync(folder, { recursive: true, force: true });
});
test("première page inclut le seed même lorsque la DB n’était pas initialisée", () => {
  const page = localCatalogPage(filters, 2, null);
  assert.equal(page.items.length, 2);
  assert.equal(page.total, 7);
  assert.ok(page.nextCursor);
});
test("une insertion entre deux pages ne duplique ni ne perd les annonces déjà présentes", () => {
  const baseline = localCatalogPage(filters, 50, null).items.map((l) => l.id);
  const first = localCatalogPage(filters, 2, null);
  const row = db().prepare("SELECT * FROM listings LIMIT 1").get()!;
  const value = JSON.parse(String(row.public_json));
  const id = randomUUID(),
    publication = new Date(Date.now() + 2000).toISOString();
  value.id = id;
  value.priceCents = 1;
  value.title = "Annonce insérée après la première page";
  db()
    .prepare(
      "INSERT INTO listings(id,seller_id,draft_json,public_json,status,created_at,updated_at,published_at) VALUES(?,?,?,?,?,?,?,?)",
    )
    .run(
      id,
      personas.seller,
      JSON.stringify(value),
      JSON.stringify(value),
      "published",
      publication,
      publication,
      publication,
    );
  const seen = first.items.map((l) => l.id);
  let cursor = first.nextCursor;
  while (cursor) {
    const next = localCatalogPage(filters, 2, decodeCursor(cursor, filters));
    seen.push(...next.items.map((l) => l.id));
    cursor = next.nextCursor;
  }
  assert.deepEqual(seen, baseline);
  assert.equal(new Set(seen).size, baseline.length);
});
test("curseur lié aux filtres et tri, formats modifiés ou expirés refusés", () => {
  const page = localCatalogPage(filters, 2, null);
  assert.throws(() =>
    decodeCursor(page.nextCursor, { ...filters, type: "box" }),
  );
  assert.throws(() => decodeCursor("MA", filters));
  assert.throws(() => decodeCursor("bad!!", filters));
  assert.throws(() =>
    parsePageQuery(
      new URL("http://127.0.0.1:3000/api/listings?limit=Infinity"),
    ),
  );
});
test("les égalités de prix avancent par ID sans répéter la limite", () => {
  const sql = db();
  const rows = sql
    .prepare(
      "SELECT id,public_json FROM listings WHERE published_at<=? ORDER BY id LIMIT 3",
    )
    .all(new Date().toISOString());
  for (const row of rows) {
    const value = JSON.parse(String(row.public_json));
    value.priceCents = 5000000;
    sql
      .prepare("UPDATE listings SET public_json=? WHERE id=?")
      .run(JSON.stringify(value), String(row.id));
  }
  const expected = localCatalogPage(
    { ...filters, sort: "price_desc" },
    50,
    null,
  ).items.map((l) => l.id);
  const actual: string[] = [];
  let cursor: string | null = null;
  do {
    const next = localCatalogPage(
      { ...filters, sort: "price_desc" },
      1,
      cursor ? decodeCursor(cursor, { ...filters, sort: "price_desc" }) : null,
    );
    actual.push(...next.items.map((l) => l.id));
    cursor = next.nextCursor;
  } while (cursor);
  assert.deepEqual(actual, expected);
});
