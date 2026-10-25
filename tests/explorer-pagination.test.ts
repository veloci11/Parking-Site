import { test } from "node:test";
import assert from "node:assert/strict";
import { loadExplorerNextPage } from "../src/lib/explorer-pagination";
import type { Listing } from "../src/lib/types";

const listing = (id: string) => ({ id }) as Listing;

test("failed continuation keeps displayed offers and cursor; retry appends without duplicates", async () => {
  const selected = listing("selected"),
    current = {
      data: [selected, listing("second")],
      nextCursor: "page-2",
    };
  const query = new URLSearchParams("transactionType=rent&priceMax=15000");
  const failed = await loadExplorerNextPage(current, query, async (url) => {
    const params = new URL(url, "https://test.invalid").searchParams;
    assert.equal(params.get("cursor"), "page-2");
    assert.equal(params.get("priceMax"), "15000");
    throw new TypeError("Failed to fetch");
  });
  assert.strictEqual(failed.data, current.data);
  assert.strictEqual(
    failed.data.find((item) => item.id === selected.id),
    selected,
  );
  assert.equal(failed.nextCursor, "page-2");
  assert.match(failed.error, /connexion.*réessayez/i);

  const retried = await loadExplorerNextPage(failed, query, async (url) => {
    assert.equal(
      new URL(url, "https://test.invalid").searchParams.get("cursor"),
      "page-2",
    );
    return Response.json({
      data: [listing("second"), listing("third"), listing("third")],
      nextCursor: "page-3",
    });
  });
  assert.deepEqual(
    retried.data.map((item) => item.id),
    ["selected", "second", "third"],
  );
  assert.strictEqual(retried.data[0], selected);
  assert.equal(retried.nextCursor, "page-3");
  assert.equal(retried.error, "");
  assert.equal(query.has("cursor"), false);
});

test("HTTP and incomplete JSON failures preserve the page; reaching the last page clears continuation", async () => {
  const current = { data: [listing("one")], nextCursor: "next" };
  for (const response of [
    Response.json({ error: "Réessayez dans un instant." }, { status: 503 }),
    new Response("{broken", {
      headers: { "Content-Type": "application/json" },
    }),
  ]) {
    const result = await loadExplorerNextPage(
      current,
      new URLSearchParams(),
      async () => response,
    );
    assert.strictEqual(result.data, current.data);
    assert.equal(result.nextCursor, "next");
    assert.ok(result.error);
  }
  const end = await loadExplorerNextPage(
    current,
    new URLSearchParams(),
    async () => Response.json({ data: [], nextCursor: null }),
  );
  assert.strictEqual(end.data, current.data);
  assert.equal(end.nextCursor, null);
  assert.equal(end.error, "");
});
