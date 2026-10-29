/** Operator-only local CLI. Default: reads + private plan, no CDN action. */
import { createClient } from "@supabase/supabase-js";
import {
  chmod,
  lstat,
  mkdir,
  readFile,
  stat,
  writeFile,
} from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import {
  executeMediaCachePurge,
  mediaCacheDigest,
  mediaCachePlanHash,
  MediaCachePurgeError,
  parseMediaCachePurgePlan,
  prepareMediaCachePurge,
  type MediaCachePurgeAdapter,
} from "../src/server/media-cache-purge";

export function mediaOperatorConfiguration(
  env: Record<string, string | undefined>,
) {
  const endpoint = env.GP_MEDIA_OPERATOR_SUPABASE_URL;
  const key = env.GP_MEDIA_OPERATOR_SECRET_KEY;
  if (!endpoint || !key || !/^sb_secret_[A-Za-z0-9_-]{16,}$/.test(key))
    throw new MediaCachePurgeError("PRIVATE_SECRET_KEY_CONFIGURATION_REQUIRED");
  let url: URL;
  try {
    url = new URL(endpoint);
  } catch {
    throw new MediaCachePurgeError("INVALID_PRIVATE_OPERATOR_ORIGIN");
  }
  if (
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    !["", "/"].includes(url.pathname)
  )
    throw new MediaCachePurgeError("INVALID_PRIVATE_OPERATOR_ORIGIN");
  return {
    endpoint: url.origin,
    key,
    projectFingerprint: mediaCacheDigest(url.origin),
  };
}
export function mediaPurgeOutcome(result: {
  data: { message?: unknown } | null;
  error: { status?: unknown; statusCode?: unknown } | null;
}) {
  if (result.error) {
    // New Storage errors may put a textual code in statusCode; status remains HTTP.
    const status = Number(result.error.status ?? result.error.statusCode ?? 0);
    if ([401, 403].includes(status)) return "forbidden" as const;
    if ([404, 405, 501].includes(status)) return "unsupported" as const;
    return "failed" as const;
  }
  return result.data?.message === "success"
    ? ("queued" as const)
    : ("failed" as const);
}
function argumentsFor(argv: string[]) {
  const values = new Map<string, string>();
  let execute = false;
  for (let i = 0; i < argv.length; i++) {
    const flag = argv[i];
    if (flag === "--execute" && !execute) {
      execute = true;
      continue;
    }
    if (
      !["--listing-id", "--plan-file", "--expected-hash", "--reason"].includes(
        flag,
      ) ||
      values.has(flag) ||
      !argv[i + 1] ||
      argv[i + 1].startsWith("--")
    )
      throw new MediaCachePurgeError("INVALID_OPERATOR_ARGUMENTS");
    values.set(flag, argv[++i]);
  }
  if (
    execute
      ? !values.has("--plan-file") ||
        !values.has("--expected-hash") ||
        !values.has("--reason") ||
        values.has("--listing-id")
      : !values.has("--listing-id") || values.size !== 1
  )
    throw new MediaCachePurgeError(
      "REVIEWED_PLAN_AND_REASON_REQUIRED_FOR_EXECUTION",
    );
  return { execute, values };
}
export async function main(argv = process.argv.slice(2)) {
  const args = argumentsFor(argv);
  const configuration = mediaOperatorConfiguration(process.env);
  const client = createClient(configuration.endpoint, configuration.key, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
    global: {
      fetch: (input, options) =>
        fetch(input, { ...options, signal: AbortSignal.timeout(8000) }),
    },
  });
  const receiptDirectory = fileURLToPath(
    new URL("../.data/media-cache-purge/", import.meta.url),
  );
  const privateDirectory = async () => {
    await mkdir(receiptDirectory, { recursive: true, mode: 0o700 });
    const directory = await lstat(receiptDirectory);
    if (!directory.isDirectory() || directory.isSymbolicLink())
      throw new MediaCachePurgeError("PRIVATE_PLAN_DIRECTORY_REQUIRED");
    await chmod(receiptDirectory, 0o700);
  };
  const adapter: MediaCachePurgeAdapter = {
    readSnapshot: async (listingId) => {
      const listing = await client
        .from("listings")
        .select("id,seller_id,lifecycle_state,row_version,updated_at")
        .eq("id", listingId)
        .maybeSingle();
      if (listing.error) throw new Error("READ_FAILED");
      if (!listing.data) return { listing: null, published: false, media: [] };
      const published = await client
        .from("published_listings")
        .select("id")
        .eq("id", listingId)
        .maybeSingle();
      if (published.error) throw new Error("READ_FAILED");
      const media = await client
        .from("media_assets")
        .select("id,owner_id,listing_id,object_key,mime")
        .eq("listing_id", listingId)
        .order("id")
        .limit(121);
      if (media.error) throw new Error("READ_FAILED");
      const last = await client
        .from("listings")
        .select("id,seller_id,lifecycle_state,row_version,updated_at")
        .eq("id", listingId)
        .maybeSingle();
      if (
        last.error ||
        JSON.stringify(last.data) !== JSON.stringify(listing.data)
      )
        throw new Error("READ_STATE_CHANGED");
      return {
        listing: listing.data,
        published: !!published.data,
        media: media.data,
      };
    },
    consumePlan: async (planHash, reason) => {
      await privateDirectory();
      await writeFile(
        resolve(receiptDirectory, `${planHash}.consumed.json`),
        JSON.stringify({
          planHash,
          reason,
          startedAt: new Date().toISOString(),
          status: "attempt_consumed_new_plan_required_for_retry",
        }),
        { flag: "wx", mode: 0o600 },
      );
    },
    purgeObject: async (bucket, name) => {
      if (
        bucket !== "public-approved" ||
        !/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}\.webp$/.test(
          name,
        )
      )
        throw new Error("UNSAFE_OBJECT");
      const storage = client.storage.from("public-approved");
      if (typeof storage.purgeCache !== "function") return "unsupported";
      return mediaPurgeOutcome(await storage.purgeCache(name));
    },
  };
  if (!args.execute) {
    const prepared = await prepareMediaCachePurge(
      adapter,
      args.values.get("--listing-id")!,
      configuration.projectFingerprint,
    );
    await privateDirectory();
    const planFile = resolve(
      receiptDirectory,
      `${prepared.plan.planId}.plan.json`,
    );
    await writeFile(planFile, JSON.stringify(prepared, null, 2), {
      flag: "wx",
      mode: 0o600,
    });
    console.log(
      JSON.stringify({
        dryRun: true,
        listingId: prepared.plan.snapshot.listing.id,
        objectCount: prepared.plan.snapshot.media.length,
        planFile,
        planHash: prepared.planHash,
        queuedCount: 0,
        globallyRevoked: false,
      }),
    );
    return;
  }
  const planFile = resolve(args.values.get("--plan-file")!);
  const planStat = await stat(planFile);
  if (
    !planStat.isFile() ||
    planStat.size > 131072 ||
    (planStat.mode & 0o077) !== 0
  )
    throw new MediaCachePurgeError("PRIVATE_PLAN_FILE_REQUIRED");
  const envelope = JSON.parse(await readFile(planFile, "utf8"));
  const plan = parseMediaCachePurgePlan(envelope.plan);
  if (envelope.planHash !== mediaCachePlanHash(plan))
    throw new MediaCachePurgeError("PRIVATE_PLAN_INTEGRITY_FAILED");
  const report = await executeMediaCachePurge(adapter, plan, {
    execute: true,
    expectedHash: args.values.get("--expected-hash"),
    reason: args.values.get("--reason"),
    projectFingerprint: configuration.projectFingerprint,
  });
  console.log(JSON.stringify(report));
}
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
)
  void main().catch((error) => {
    console.error(
      JSON.stringify({
        status: "refused_or_interrupted",
        code:
          error instanceof MediaCachePurgeError
            ? error.code
            : "PRIVATE_OPERATOR_OPERATION_FAILED",
        queuedCount:
          error instanceof MediaCachePurgeError ? error.queuedCount : 0,
        queueAcknowledgementsOnly: true,
        remoteOutcomeUncertain:
          error instanceof MediaCachePurgeError &&
          error.code === "CDN_PURGE_ACKNOWLEDGEMENT_UNCONFIRMED",
        globallyRevoked: false,
        retryRequiresNewDryRunAndHash: true,
      }),
    );
    process.exitCode = 1;
  });
