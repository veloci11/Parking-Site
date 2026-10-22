/** Dedicated connected probe. Coordinator provisions three fresh .invalid fixtures.
 * npx tsx scripts/verify-storage-cache-zero.mjs --run
 * --run --purge-cdn --execute-reviewed-purge opts into exact reviewed CDN invalidation.
 * No signup, email, SQL, server startup or policy change. Signed URLs stay in memory.
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { resolve } from "node:path";
import { mediaCachePlanHash } from "../src/server/media-cache-purge.ts";
import sharp from "sharp";
import { createServerClient } from "@supabase/ssr";
import {
  QaStrongSession,
  confirmQaLocation,
  linkQaPublication,
} from "./qa-publication-contract.ts";
import { emptyCommercialDetails } from "../src/lib/commercial-details.ts";
const purgeMode = process.argv.includes("--purge-cdn");
const configurationOnly = process.argv.includes("--check-operator-config");
const prefix = purgeMode ? "storage-cdn-purge" : "storage-cache";
const privateFile = `.data/${prefix}-artifacts.json`,
  reportFile = purgeMode
    ? "docs/qa/storage-cdn-purge-live.json"
    : "docs/qa/storage-cache-zero.json";
const operatorEnv = resolve(".data/media-operator.env");
const execFileAsync = promisify(execFile);
async function purgeCli(args) {
  try {
    const result = await execFileAsync(
      process.execPath,
      [
        "--env-file=" + operatorEnv,
        "--import",
        "tsx",
        "scripts/purge-public-media-cache.ts",
        ...args,
      ],
      { cwd: process.cwd(), timeout: 60000, maxBuffer: 32768 },
    );
    return JSON.parse(result.stdout.trim());
  } catch (error) {
    try {
      const refused = JSON.parse(error.stderr.trim());
      if (/^[A-Z0-9_]{1,100}$/.test(refused.code || ""))
        purgeProof.operatorFailure = {
          code: refused.code,
          queuedCount: Number.isInteger(refused.queuedCount)
            ? refused.queuedCount
            : null,
          remoteOutcomeUncertain: refused.remoteOutcomeUncertain === true,
        };
    } catch {}
    throw new Error(
      "operator_cli_refused_or_interrupted_inspect_private_receipt",
    );
  }
}
if (!process.argv.includes("--run") && !configurationOnly) {
  console.info(
    "Prepared only. --run requires a reviewed connected server and three fresh private fixture identities.",
  );
  process.exit(0);
}
if (purgeMode || configurationOnly) {
  assert.ok(
    configurationOnly || process.argv.includes("--execute-reviewed-purge"),
    "Explicit purge execution flag required",
  );
  const mode = fs.lstatSync(operatorEnv);
  assert.ok(
    mode.isFile() && !mode.isSymbolicLink() && (mode.mode & 0o077) === 0,
    "Private operator env file required",
  );
  // Node loads this private file only in the child. Neither this probe nor its
  // output reads, receives or persists the operator secret.
  try {
    await execFileAsync(
      process.execPath,
      [
        "--env-file=" + operatorEnv,
        "--import",
        "tsx",
        "--input-type=module",
        "-e",
        "import {mediaOperatorConfiguration} from './scripts/purge-public-media-cache.ts'; mediaOperatorConfiguration(process.env); console.log('private_operator_configuration_valid');",
      ],
      { timeout: 10000, maxBuffer: 1024 },
    );
  } catch {
    throw new Error(
      "private_operator_configuration_required_before_fixture_use",
    );
  }
}
if (configurationOnly) {
  console.info(
    "Private operator configuration validated; no remote request or fixture was created.",
  );
  process.exit(0);
}
const configFile = `.data/${prefix}-qa.json`;
assert.equal(
  fs.statSync(configFile).mode & 0o077,
  0,
  "Private fixture configuration required",
);
const config = JSON.parse(fs.readFileSync(configFile, "utf8"));
assert.ok(
  config.publishableKey && !config.publishableKey.startsWith("sb_secret_"),
  "Fixture client needs a publishable key",
);
assert.deepEqual(Object.keys(config.users).sort(), [
  "admin",
  "buyer",
  "seller",
]);
assert.equal(config.origin, "http://127.0.0.1:3001");
assert.equal(
  new URL(config.supabaseUrl).hostname,
  "srrmysturoloovpuuojp.supabase.co",
);
for (const u of Object.values(config.users))
  assert.match(
    u.email,
    /^qa-(seller|buyer|admin)-[a-f0-9]+@parking-test\.invalid$/,
  );
const artifacts = {
  userIds: Object.values(config.users).map((x) => x.id),
  listingIds: [],
  media: [],
  registrySiteIds: [],
  registryLevelIds: [],
  registrySpaceIds: [],
  mfaFactorIds: [],
  sources: [],
  withdrawn: false,
};
const checks = [],
  reads = [];
let strong, listing, signedUrl, failure;
const purgeProof = {
  requested: purgeMode,
  observationWindowMs: 60000,
  pollingIntervalMs: 10000,
  planReviewedAgainstOwnedInventory: false,
  queuedCount: 0,
  observedDefaultUrlDenied: false,
  samples: [],
};
const save = () =>
  fs.writeFileSync(privateFile, JSON.stringify(artifacts, null, 2) + "\n", {
    mode: 0o600,
  });
const check = (name, pass, reply) => {
  checks.push({
    name,
    passed: !!pass,
    ...(reply ? { status: reply.status, code: reply.code } : {}),
  });
  assert.ok(pass, name);
};
const status = (name, r, s = 200) => check(name, r.status === s, r);
class Client {
  cookies = new Map();
  async api(path, method = "GET", body) {
    const multipart = body instanceof FormData;
    const r = await fetch(config.origin + "/api/" + path, {
      method,
      headers: {
        Origin: config.origin,
        ...(this.cookies.size
          ? {
              Cookie: [...this.cookies].map(([k, v]) => k + "=" + v).join("; "),
            }
          : {}),
        ...(body && !multipart ? { "Content-Type": "application/json" } : {}),
      },
      body: body ? (multipart ? body : JSON.stringify(body)) : undefined,
      signal: AbortSignal.timeout(40000),
    });
    for (const c of r.headers.getSetCookie()) {
      const p = c.split(";")[0],
        i = p.indexOf("=");
      if (p.slice(i + 1)) this.cookies.set(p.slice(0, i), p.slice(i + 1));
      else this.cookies.delete(p.slice(0, i));
    }
    const j = await r.json();
    return { status: r.status, data: j.data, code: j.code, raw: j };
  }
  sdk() {
    return createServerClient(config.supabaseUrl, config.publishableKey, {
      cookies: {
        getAll: () =>
          [...this.cookies].map(([name, value]) => ({
            name,
            value: decodeURIComponent(value),
          })),
        setAll: () => {},
      },
    });
  }
}
const seller = new Client(),
  buyer = new Client(),
  admin = new Client();
const signed = { ttlSeconds: 60, minted: false, urlOrTokenRecorded: false };
async function run() {
  if (!process.argv.includes("--run")) {
    console.log(
      "Prepared only; --run requires three coordinator-created private fixtures and connected production server.",
    );
    return;
  }
  if (fs.existsSync(privateFile)) {
    const prior = JSON.parse(fs.readFileSync(privateFile, "utf8"));
    assert.deepEqual([...prior.userIds].sort(), [...artifacts.userIds].sort());
    assert.ok(
      prior.withdrawn && prior.media.length === 0,
      "Only a stopped pre-upload attempt can be resumed; all old IDs must remain recorded",
    );
    for (const key of [
      "listingIds",
      "registrySiteIds",
      "registryLevelIds",
      "registrySpaceIds",
      "mfaFactorIds",
    ])
      artifacts[key].push(...prior[key]);
  }
  save();
  fs.writeFileSync(
    `.data/${prefix}-manifest.json`,
    JSON.stringify(
      {
        createdAt: new Date().toISOString(),
        users: Object.values(config.users).map(({ id, email }) => ({
          id,
          email,
        })),
      },
      null,
      2,
    ) + "\n",
    { mode: 0o600 },
  );
  try {
    const mode = await buyer.api("session");
    check("real_supabase_mode", mode.raw.mode === "supabase");
    for (const [c, p] of [
      [seller, "seller"],
      [buyer, "buyer"],
      [admin, "admin"],
    ]) {
      const r = await c.api("auth/login", "POST", {
        email: config.users[p].email,
        password: config.users[p].password,
      });
      status(p + "_real_login", r);
      check(p + "_identity", r.data.id === config.users[p].id);
    }
    strong = new QaStrongSession(
      admin.api.bind(admin),
      config.users.admin,
      "admin_mfa",
      async (k, id) => {
        artifacts[k].push(id);
        save();
      },
      check,
    );
    await strong.establish("admin");
    let r = await seller.api("listings", "POST", {});
    status("create", r, 201);
    listing = r.data;
    artifacts.listingIds.push(listing.id);
    save();
    const photos = [];
    for (let i = 0; i < 3; i++) {
      const bytes = await sharp(
        Buffer.from(
          `<svg xmlns="http://www.w3.org/2000/svg" width="600" height="400"><rect width="600" height="400" fill="#ddd5c5"/><rect x="20" y="20" width="560" height="110" fill="white"/><text x="35" y="65" font-family="Arial" font-size="24">RECETTE FICTIVE ${i + 1}/3</text><text x="35" y="105" font-family="Arial" font-size="20">Aucun parking reel</text><path d="M80 370L170 170H240L200 370ZM390 370L340 170H410L510 370Z" stroke="white" fill="#666" stroke-width="5"/></svg>`,
        ),
      )
        .jpeg()
        .toBuffer();
      const form = new FormData();
      form.set("listingId", listing.id);
      form.set(
        "file",
        new Blob([new Uint8Array(bytes)], { type: "image/jpeg" }),
        "synthetic-cache-" + i + ".jpg",
      );
      r = await seller.api("uploads", "POST", form);
      status("upload_" + i, r, 201);
      photos.push(r.data.url);
      artifacts.media.push({
        id: r.data.id,
        listingId: listing.id,
        objectKey:
          config.users.seller.id + "/" + listing.id + "/" + r.data.id + ".webp",
      });
      save();
    }
    r = await seller.api(`listings/${listing.id}`, "PATCH", {
      version: listing.version,
      title: purgeMode
        ? "RECETTE FICTIVE — purge CDN Paris 12e"
        : "RECETTE FICTIVE — cache zéro Paris 12e",
      description:
        "Annonce synthétique exclusivement réservée à la recette de cache et de retrait. Images, prix et caractéristiques fictifs. Aucun bien immobilier réel ni expertise ne sont revendiqués.",
      city: "Paris",
      district: "Bercy",
      address: "Adresse fictive privée de recette cache",
      coordinates: [2.3739, 48.8446],
      publicCoordinates: [2.38, 48.85],
      locationPrecision: "area",
      commercialDetails: { ...emptyCommercialDetails(), postalCode: "75012" },
      pricingMode: "lot",
      transactionType: "sale",
      priceCents: 3200000,
      type: "covered",
      photos,
      spaces: [
        {
          ...listing.spaces[0],
          number: "QA-CACHE",
          level: -1,
          areaM2: 12,
          lengthM: 5,
          widthM: 2.4,
          clearanceM: 2.1,
        },
      ],
    });
    status("save_complete_fixture", r);
    listing = await confirmQaLocation(seller.api.bind(seller), r.data);
    r = await seller.api(`listings/${listing.id}/submit`, "POST", {
      version: listing.version,
      ownershipAttested: true,
    });
    status("submit", r);
    listing = r.data;
    const version = await linkQaPublication(
      admin.api.bind(admin),
      config.users.admin,
      listing,
      async (k, id) => {
        artifacts[k].push(id);
        save();
      },
    );
    r = await admin.api(`admin/revisions/${listing.id}/decision`, "POST", {
      version,
      decision: "approve",
    });
    status("approve_new_copies", r);
    listing = r.data;
    const sdk = buyer.sdk(),
      token = (await sdk.auth.getSession()).data.session.access_token;
    const claims = JSON.parse(
      Buffer.from(token.split(".")[1], "base64url").toString(),
    );
    check(
      "buyer_aal1_member",
      claims.sub === config.users.buyer.id && claims.aal === "aal1",
    );
    const path =
      config.supabaseUrl +
      "/storage/v1/object/public-approved/" +
      artifacts.media[0].id +
      ".webp";
    async function read(name, nonce = false, timeoutMs = 40000) {
      const response = await fetch(
        path + (nonce ? "?cacheNonce=" + Date.now() : ""),
        {
          headers: {
            apikey: config.publishableKey,
            Authorization: "Bearer " + token,
            ...(nonce ? { "Cache-Control": "no-cache" } : {}),
          },
          ...(nonce ? { cache: "no-store" } : {}),
          signal: AbortSignal.timeout(timeoutMs),
        },
      );
      const bytes = (await response.arrayBuffer()).byteLength;
      const value = {
        name,
        status: response.status,
        bytes,
        cacheControl: response.headers.get("cache-control"),
        cfCacheStatus: response.headers.get("cf-cache-status"),
        age: response.headers.get("age"),
        date: response.headers.get("date"),
      };
      reads.push(value);
      return value;
    }
    const before = await read("published_default_url");
    check(
      "new_copy_declares_cache_zero",
      before.status === 200 &&
        /max-age=0(?:\D|$)/.test(before.cacheControl || ""),
    );
    if (purgeMode) {
      const warmed = await read("published_warmed_same_token_default_url");
      check(
        "published_default_url_warmed_cache_hit",
        warmed.status === 200 && warmed.cfCacheStatus === "HIT",
      );
    }
    if (!purgeMode) {
      const sign = await sdk.storage
        .from("public-approved")
        .createSignedUrl(artifacts.media[0].id + ".webp", 60);
      signed.minted = !sign.error && !!sign.data?.signedUrl;
      if (signed.minted) {
        signedUrl = sign.data.signedUrl;
        const sr = await fetch(signedUrl, {
          signal: AbortSignal.timeout(40000),
        });
        await sr.arrayBuffer();
        signed.beforeWithdrawalStatus = sr.status;
      }
    }
    r = await seller.api(`listings/${listing.id}/lifecycle`, "POST", {
      version: listing.version,
      action: "withdraw",
    });
    status("withdraw", r);
    artifacts.withdrawn = true;
    save();
    const after = await read("withdrawn_same_token_default_url");
    const origin = await read("withdrawn_same_token_nonce_no_store", true);
    check(
      "fresh_origin_denies_withdrawn_media",
      [400, 401, 403, 404].includes(origin.status),
    );
    if (purgeMode) {
      purgeProof.immediateDefaultUrlDeniedBeforePurge = [
        400, 401, 403, 404,
      ].includes(after.status);
      const prepared = await purgeCli(["--listing-id", listing.id]);
      check(
        "purge_plan_is_reads_only",
        prepared.dryRun === true && prepared.queuedCount === 0,
      );
      const envelope = JSON.parse(fs.readFileSync(prepared.planFile, "utf8"));
      assert.equal(mediaCachePlanHash(envelope.plan), prepared.planHash);
      const snapshot = envelope.plan.snapshot;
      assert.equal(snapshot.listing.id, listing.id);
      assert.equal(snapshot.listing.seller_id, config.users.seller.id);
      assert.equal(snapshot.listing.lifecycle_state, "withdrawn");
      assert.equal(snapshot.published, false);
      assert.deepEqual(
        snapshot.media.map((m) => m.id).sort(),
        artifacts.media.map((m) => m.id).sort(),
      );
      assert.ok(
        snapshot.media.every(
          (m) =>
            m.owner_id === config.users.seller.id &&
            m.listing_id === listing.id &&
            m.object_key ===
              artifacts.media.find((a) => a.id === m.id)?.objectKey,
        ),
      );
      purgeProof.planReviewedAgainstOwnedInventory = true;
      purgeProof.planHash = prepared.planHash;
      const queued = await purgeCli([
        "--execute",
        "--plan-file",
        prepared.planFile,
        "--expected-hash",
        prepared.planHash,
        "--reason",
        "Recette synthétique bornée : retrait vérifié, seuls les médias du manifeste sont ciblés.",
      ]);
      purgeProof.queuedCount = queued.queuedCount;
      purgeProof.acknowledgedAt = new Date().toISOString();
      check(
        "owned_media_purge_acknowledged",
        queued.status === "invalidation_queued" &&
          queued.queuedCount === artifacts.media.length &&
          queued.globallyRevoked === false,
      );
      const started = Date.now(),
        deadline = started + 60000;
      for (const offset of [0, 10000, 20000, 30000, 40000, 50000, 59000]) {
        const delay = Math.min(
          10000,
          Math.max(0, started + offset - Date.now()),
        );
        if (delay) await new Promise((done) => setTimeout(done, delay));
        const remaining = deadline - Date.now();
        if (remaining <= 0) break;
        let sample;
        try {
          sample = await read(
            "post_purge_same_token_default_url",
            false,
            Math.min(8000, remaining),
          );
        } catch {
          purgeProof.samples.push({
            name: "post_purge_same_token_default_url",
            transportInterrupted: true,
            elapsedMs: Date.now() - started,
          });
          break;
        }
        const observed = { ...sample, elapsedMs: Date.now() - started };
        purgeProof.samples.push(observed);
        if (
          [400, 401, 403, 404].includes(sample.status) &&
          observed.elapsedMs <= 60000
        ) {
          purgeProof.observedDefaultUrlDenied = true;
          break;
        }
      }
      const denialCheck =
        "same_token_default_url_denied_within_60s_after_purge_ack";
      checks.push({
        name: denialCheck,
        passed: purgeProof.observedDefaultUrlDenied,
      });
      if (!purgeProof.observedDefaultUrlDenied) failure ||= denialCheck;
      const finalOrigin = await read("post_purge_nonce_no_store_origin", true);
      check(
        "post_purge_origin_still_denies_withdrawn_media",
        [400, 401, 403, 404].includes(finalOrigin.status),
      );
    } else {
      check(
        "default_same_token_url_denies_after_withdrawal",
        [400, 401, 403, 404].includes(after.status),
      );
    }
    if (signedUrl) {
      const sr = await fetch(signedUrl, { signal: AbortSignal.timeout(40000) });
      await sr.arrayBuffer();
      signed.afterWithdrawalStatus = sr.status;
      signed.limitation =
        "Previously minted bearer URL may stay valid until its explicit expiry; this is recorded, not asserted as immediate revocation.";
    }
  } catch (e) {
    failure =
      checks.find((x) => !x.passed)?.name ||
      purgeProof.operatorFailure?.code ||
      "probe_interrupted_without_secret_output";
  } finally {
    if (listing && !artifacts.withdrawn) {
      try {
        const own = await seller.api(`listings/${listing.id}?draft=1`);
        const r = await seller.api(`listings/${listing.id}/lifecycle`, "POST", {
          version: own.data.version,
          action: "withdraw",
        });
        if (r.status === 200) {
          artifacts.withdrawn = true;
          save();
        }
      } catch {}
    }
    try {
      await strong?.cleanup();
    } catch {
      failure ||= "factor_cleanup_failed";
    }
    for (const c of [seller, buyer, admin])
      try {
        await c.api("auth/logout", "POST", {});
      } catch {}
    save();
  }
  const proof = {
    checkedAt: new Date().toISOString(),
    status: failure
      ? "failed-pending-exact-cleanup"
      : "passed-pending-exact-cleanup",
    failedCheck: failure || null,
    checks,
    reads,
    signedUrlProbe: signed,
    ...(purgeMode
      ? {
          purge: purgeProof,
          observedOneClientAndEdgeOnly: true,
          worldwideRevocationProven: false,
        }
      : {}),
    adminFactorRevoked: strong?.factorRevoked || false,
    withdrawn: artifacts.withdrawn,
    cleanup: "pending",
    buildId: fs.readFileSync(".next/BUILD_ID", "utf8").trim(),
    priorFailureProof: "docs/qa/withdrawal-storage-cache.json",
    realSupabase: true,
    syntheticOnly: true,
    externalEmailSent: false,
    credentialsIncluded: false,
    instantRevocationOfCachedOrAlreadyDownloadedBytesClaimed: false,
  };
  fs.writeFileSync(reportFile, JSON.stringify(proof, null, 2) + "\n");
  console.log(
    JSON.stringify({
      status: proof.status,
      failedCheck: proof.failedCheck,
      checks: checks.filter((x) => x.passed).length,
      reads,
      signedUrlProbe: signed,
      withdrawn: artifacts.withdrawn,
      adminFactorRevoked: proof.adminFactorRevoked,
    }),
  );
  if (failure) process.exitCode = 1;
}
run().catch(() => {
  console.error(
    "Probe stopped without printing credentials; inspect exact private inventory.",
  );
  process.exitCode = 1;
});
