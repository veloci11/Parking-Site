/** Coordinator-only opt-in cleanup of the exact ignored scene QA inventory. No service key. */
import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import { createClient } from "@supabase/supabase-js";
async function main() {
  if (!process.argv.includes("--run")) {
    console.log(
      "Prepared: --run only after fixture withdrawal and coordinator deletion of its exact DB dependencies.",
    );
    return;
  }
  const config = JSON.parse(await readFile(".data/supabase-qa.json", "utf8"));
  const inventory = JSON.parse(
    await readFile(".data/supabase-scenes-qa-result.json", "utf8"),
  );
  assert.equal(inventory.withdrawn, true, "Withdraw fixture before cleanup");
  assert.ok(
    inventory.userIds.every((id: string) =>
      Object.values(config.users).some((u: any) => u.id === id),
    ),
  );
  const makeClient = () =>
    createClient(config.supabaseUrl, config.publishableKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
      },
    });
  const clients: Record<string, ReturnType<typeof makeClient>> = {};
  for (const persona of ["seller", "moderator"]) {
    const client = makeClient();
    const { error } = await client.auth.signInWithPassword({
      email: config.users[persona].email,
      password: config.users[persona].password,
    });
    assert.equal(error, null, `Scoped ${persona} login`);
    clients[persona] = client;
  }
  // All registry rows must be removed by the coordinator first. Never delete a
  // referenced object, even if its path happens to be in this QA inventory.
  for (const [table, ids] of [
    ["parking_scene_sources", inventory.sources.map((s: any) => s.id)],
    ["parking_scenes", inventory.sceneIds],
    ["media_assets", inventory.media.map((s: any) => s.id)],
    ["listings", inventory.listingIds],
  ] as [string, string[]][]) {
    if (!ids.length) continue;
    const { data, error } = await clients.moderator
      .from(table)
      .select("id")
      .in("id", ids);
    assert.equal(error, null, `Verify ${table}`);
    assert.equal(
      data?.length,
      0,
      `Coordinator must remove exact ${table} rows first`,
    );
  }
  const batches = [
    {
      bucket: "scene-sources",
      persona: "seller",
      paths: inventory.sources.map((s: any) => s.objectKey),
    },
    {
      bucket: "private-uploads",
      persona: "seller",
      paths: inventory.media.map((s: any) => s.objectKey),
    },
    {
      bucket: "public-approved",
      persona: "moderator",
      paths: inventory.media.map((s: any) => `${s.id}.webp`),
    },
  ];
  const result = [];
  for (const batch of batches) {
    for (const path of batch.paths) {
      assert.ok(typeof path === "string" && !path.includes(".."));
      if (batch.persona === "seller")
        assert.ok(path.startsWith(config.users.seller.id + "/"));
      else assert.match(path, /^[a-f0-9-]{36}\.webp$/);
    }
    const { data, error } = await clients[batch.persona].storage
      .from(batch.bucket)
      .remove(batch.paths);
    assert.equal(error, null, `Storage remove ${batch.bucket}`);
    assert.equal(
      data?.length,
      batch.paths.length,
      `Storage must actually delete each exact ${batch.bucket} object`,
    );
    result.push({ bucket: batch.bucket, deleted: data.length });
  }
  inventory.storageCleaned = true;
  inventory.storageCleanup = result;
  await writeFile(
    ".data/supabase-scenes-qa-result.json",
    JSON.stringify(inventory, null, 2) + "\n",
    { mode: 0o600 },
  );
  const report = JSON.parse(
    await readFile("docs/qa/scenes-integration.json", "utf8"),
  );
  report.storageCleanup = {
    status: "passed",
    method: "authenticated Storage API; exact ignored QA inventory only",
    buckets: result,
  };
  await writeFile(
    "docs/qa/scenes-integration.json",
    JSON.stringify(report, null, 2) + "\n",
  );
  console.log(JSON.stringify({ status: "passed", storageCleanup: result }));
}
main().catch((error) => {
  console.error(
    error instanceof assert.AssertionError
      ? error.message
      : "Scene cleanup failed; inspect locally without exposing tokens.",
  );
  process.exitCode = 1;
});
