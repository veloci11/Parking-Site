/** Coordinator-only, exact five-fixture cleanup. Default only prepares local review files.
 * 1. Run this script without flags after all recipes finish.
 * 2. Coordinator reviews and applies .data/completion-cleanup-dependencies.sql.
 * 3. --storage --db-rows-removed removes the exact plan objects through Storage SDK.
 * 4. Coordinator reviews and applies .data/completion-cleanup-auth.sql.
 * Never runs SQL, deletes a bucket, changes a global setting, or uses a service key.
 */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { createClient } from "@supabase/supabase-js";
import { qaInventoryMatchesUsers, qaTotp } from "./qa-publication-contract";
type Identity = { id: string; email: string; password: string };
type Config = {
  supabaseUrl: string;
  publishableKey: string;
  users: Record<string, Identity>;
};
type Plan = {
  version: 1;
  preparedAt: string;
  fixtureCreatedAt: string;
  userIds: string[];
  listingIds: string[];
  registrySiteIds: string[];
  buckets: Record<string, string[]>;
  digest: string;
};
const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;
const fixtureEmail =
  /^qa-(seller|buyer|outsider|moderator|admin)-[a-f0-9]+@parking-test\.invalid$/;
const unique = (values: string[]) => [...new Set(values)].sort();
const uuidArray = (ids: string[]) => {
  assert.ok(
    ids.every((id) => uuid.test(id)),
    "Invalid scoped UUID",
  );
  return `array[${ids.map((id) => `'${id}'::uuid`).join(",")}]::uuid[]`;
};
async function readJson(path: string, optional = false): Promise<any> {
  try {
    return JSON.parse(await readFile(path, "utf8"));
  } catch (error) {
    if (optional && (error as NodeJS.ErrnoException).code === "ENOENT")
      return null;
    throw error;
  }
}
async function writePrivate(path: string, value: string) {
  await writeFile(path, value, { mode: 0o600 });
}
function scopeSql(sql: string) {
  return sql
    .replace(/not in\(select id from (qa_completion_[a-z_]+)\)/g, "<> all($1)")
    .replace(/in\(select id from (qa_completion_[a-z_]+)\)/g, "= any($1)")
    .replace(
      /in\(select id::text from qa_completion_users\)/g,
      "= any(qa_completion_users::text[])",
    );
}
function sqlHeader(plan: Plan) {
  return `-- Exact dedicated fixtures only. Plan SHA256 ${plan.digest}
-- Coordinator review first. DML only; no Storage metadata deletion and no DDL.
begin;
set local lock_timeout='5s';
set local statement_timeout='30s';
do $qa$
declare
 qa_completion_users uuid[] := ${uuidArray(plan.userIds)};
 qa_completion_listings uuid[];
 qa_completion_conversations uuid[];
 qa_completion_context_reports uuid[];
 qa_completion_sites uuid[];
 qa_completion_levels uuid[];
 qa_completion_spaces uuid[];
 qa_completion_targets text[];
begin
 if (select count(*) from auth.users u where u.id=any(qa_completion_users))<>5 then raise exception 'QA_EXPECTED_EXACTLY_FIVE_USERS';end if;
 if exists(select 1 from auth.users u where u.id=any(qa_completion_users) and u.email !~ '^qa-(seller|buyer|outsider|moderator|admin)-[a-f0-9]+@parking-test[.]invalid$') then raise exception 'QA_NONFIXTURE_EMAIL';end if;
`;
}
function dependencySql(plan: Plan) {
  return scopeSql(
    sqlHeader(plan) +
      `
select coalesce(array_agg(id),'{}'::uuid[]) into qa_completion_listings from public.listings where seller_id in(select id from qa_completion_users);
select coalesce(array_agg(id),'{}'::uuid[]) into qa_completion_conversations from public.conversations where listing_id in(select id from qa_completion_listings);
select coalesce(array_agg(id),'{}'::uuid[]) into qa_completion_context_reports from public.context_reports where conversation_id in(select id from qa_completion_conversations) or user_id in(select id from qa_completion_users);
select coalesce(array_agg(id),'{}'::uuid[]) into qa_completion_sites from public.parking_sites where id=any(${uuidArray(plan.registrySiteIds)});
select coalesce(array_agg(id),'{}'::uuid[]) into qa_completion_levels from public.parking_levels where site_id in(select id from qa_completion_sites);
select coalesce(array_agg(id),'{}'::uuid[]) into qa_completion_spaces from public.parking_spaces where level_id in(select id from qa_completion_levels);
 if exists(select 1 from public.listings where id=any(${uuidArray(plan.listingIds)}) and seller_id not in(select id from qa_completion_users)) then raise exception 'QA_LISTING_SCOPE_MISMATCH';end if;
 if exists(select 1 from public.conversations where (listing_id in(select id from qa_completion_listings) or buyer_id in(select id from qa_completion_users) or seller_id in(select id from qa_completion_users)) and (listing_id not in(select id from qa_completion_listings) or buyer_id not in(select id from qa_completion_users) or seller_id not in(select id from qa_completion_users))) then raise exception 'QA_EXTERNAL_CONVERSATION';end if;
 if exists(select 1 from public.favorites where listing_id in(select id from qa_completion_listings) and user_id not in(select id from qa_completion_users)) then raise exception 'QA_EXTERNAL_FAVORITE';end if;
 if exists(select 1 from public.messages where conversation_id in(select id from qa_completion_conversations) and sender_id not in(select id from qa_completion_users)) then raise exception 'QA_EXTERNAL_MESSAGE';end if;
 if exists(select 1 from public.reports where (listing_id in(select id from qa_completion_listings) and (user_id not in(select id from qa_completion_users) or (decided_by is not null and decided_by not in(select id from qa_completion_users)))) or (decided_by in(select id from qa_completion_users) and listing_id not in(select id from qa_completion_listings))) then raise exception 'QA_EXTERNAL_REPORT';end if;
 if exists(select 1 from public.context_reports where id in(select id from qa_completion_context_reports) and (user_id not in(select id from qa_completion_users) or conversation_id not in(select id from qa_completion_conversations))) then raise exception 'QA_EXTERNAL_REPORT_CONTEXT';end if;
 if exists(select 1 from gp_private.context_report_decisions where actor_id in(select id from qa_completion_users) and report_id not in(select id from qa_completion_context_reports)) then raise exception 'QA_EXTERNAL_CONTEXT_DECISION';end if;
 if exists(select 1 from public.listing_revisions where actor_id in(select id from qa_completion_users) and listing_id not in(select id from qa_completion_listings)) then raise exception 'QA_EXTERNAL_REVISION';end if;
 if exists(select 1 from public.parking_scenes where (listing_id in(select id from qa_completion_listings) and (owner_id not in(select id from qa_completion_users) or creator_id not in(select id from qa_completion_users) or (reviewer_id is not null and reviewer_id not in(select id from qa_completion_users)))) or (listing_id not in(select id from qa_completion_listings) and (owner_id in(select id from qa_completion_users) or creator_id in(select id from qa_completion_users) or reviewer_id in(select id from qa_completion_users)))) then raise exception 'QA_EXTERNAL_SCENE';end if;
 if exists(select 1 from public.parking_scene_sources where listing_id in(select id from qa_completion_listings) and (owner_id not in(select id from qa_completion_users) or uploader_id not in(select id from qa_completion_users))) then raise exception 'QA_EXTERNAL_SOURCE';end if;
 if exists(select 1 from public.media_assets where (owner_id in(select id from qa_completion_users) and listing_id not in(select id from qa_completion_listings)) or (listing_id in(select id from qa_completion_listings) and owner_id not in(select id from qa_completion_users))) then raise exception 'QA_EXTERNAL_MEDIA';end if;
 if exists(select 1 from public.parking_sites where id in(select id from qa_completion_sites) and (public_name<>'Recette technique fictive' or internal_reference not like 'qa-%')) then raise exception 'QA_REGISTRY_SITE_SCOPE';end if;
 if exists(select 1 from public.parking_contributors where (site_id in(select id from qa_completion_sites) and user_id not in(select id from qa_completion_users)) or (user_id in(select id from qa_completion_users) and site_id not in(select id from qa_completion_sites))) then raise exception 'QA_EXTERNAL_CONTRIBUTION';end if;
 if exists(select 1 from public.registry_listing_units where space_id in(select id from qa_completion_spaces) and listing_id not in(select id from qa_completion_listings)) or exists(select 1 from public.registry_published_units where space_id in(select id from qa_completion_spaces) and listing_id not in(select id from qa_completion_listings)) or exists(select 1 from public.canonical_space_claims where space_id in(select id from qa_completion_spaces) and listing_id not in(select id from qa_completion_listings)) then raise exception 'QA_EXTERNAL_REGISTRY_LINK';end if;
 if exists(select 1 from public.registry_conflicts where (listing_id in(select id from qa_completion_listings) or other_listing_id in(select id from qa_completion_listings) or space_id in(select id from qa_completion_spaces)) and (listing_id not in(select id from qa_completion_listings) or other_listing_id not in(select id from qa_completion_listings))) then raise exception 'QA_EXTERNAL_REGISTRY_CONFLICT';end if;
 if exists(select 1 from public.registry_identity_history where actor_id in(select id from qa_completion_users) and listing_id not in(select id from qa_completion_listings)) then raise exception 'QA_EXTERNAL_IDENTITY_HISTORY';end if;
 if exists(select 1 from public.entitlement_overrides where updated_by in(select id from qa_completion_users) and user_id not in(select id from qa_completion_users)) then raise exception 'QA_EXTERNAL_ENTITLEMENT_CHANGE';end if;
 if exists(select 1 from storage.objects where bucket_id='private-exports' and split_part(name,'/',1) in(select id::text from qa_completion_users)) then raise exception 'QA_ARCHIVE_OBJECT_NEEDS_OPERATOR_STORAGE_PURGE';end if;
-- Capture every exact fixture target before deleting dependencies, including actor-null020 events.
select coalesce(array_agg(distinct target),'{}'::text[]) into qa_completion_targets from (
 select unnest(qa_completion_users)::text as target
 union all select unnest(qa_completion_listings)::text
 union all select unnest(qa_completion_sites)::text
 union all select unnest(qa_completion_levels)::text
 union all select unnest(qa_completion_spaces)::text
 union all select unnest(qa_completion_conversations)::text
 union all select unnest(qa_completion_context_reports)::text
 union all select id::text from public.messages where conversation_id in(select id from qa_completion_conversations)
 union all select id::text from public.visit_requests where conversation_id in(select id from qa_completion_conversations)
 union all select id::text from public.reports where user_id in(select id from qa_completion_users) or listing_id in(select id from qa_completion_listings)
 union all select id::text from public.parking_scenes where listing_id in(select id from qa_completion_listings)
 union all select id::text from public.parking_scene_sources where listing_id in(select id from qa_completion_listings)
 union all select id::text from public.media_assets where owner_id in(select id from qa_completion_users)
 union all select id::text from gp_private.export_jobs where user_id in(select id from qa_completion_users)
 union all select id::text from gp_private.privacy_requests where user_id in(select id from qa_completion_users)
) scoped_targets;
-- Delete only the fixture graph, children before parents; Auth remains for Storage SDK login.
delete from gp_private.context_report_decisions where report_id in(select id from qa_completion_context_reports);
delete from gp_private.context_report_evidence where report_id in(select id from qa_completion_context_reports);
delete from public.context_reports where id in(select id from qa_completion_context_reports);
delete from public.message_reads where user_id in(select id from qa_completion_users) or message_id in(select id from public.messages where conversation_id in(select id from qa_completion_conversations));
delete from public.visit_requests where conversation_id in(select id from qa_completion_conversations);
delete from public.conversation_blocks where user_id in(select id from qa_completion_users) or conversation_id in(select id from qa_completion_conversations);
delete from public.messages where conversation_id in(select id from qa_completion_conversations);
delete from public.conversations where id in(select id from qa_completion_conversations);
delete from public.reports where user_id in(select id from qa_completion_users) or listing_id in(select id from qa_completion_listings);
delete from public.favorites where user_id in(select id from qa_completion_users) or listing_id in(select id from qa_completion_listings);
delete from public.notifications where user_id in(select id from qa_completion_users);
delete from public.notification_outbox where user_id in(select id from qa_completion_users);
delete from public.parking_scenes where listing_id in(select id from qa_completion_listings);
delete from public.parking_scene_sources where listing_id in(select id from qa_completion_listings);
delete from public.published_listings where id in(select id from qa_completion_listings);
delete from public.active_space_claims where listing_id in(select id from qa_completion_listings);
delete from public.registry_published_units where listing_id in(select id from qa_completion_listings);
delete from public.canonical_space_claims where listing_id in(select id from qa_completion_listings);
delete from public.registry_conflicts where listing_id in(select id from qa_completion_listings) or other_listing_id in(select id from qa_completion_listings);
delete from public.registry_identity_history where listing_id in(select id from qa_completion_listings);
delete from public.registry_listing_units where listing_id in(select id from qa_completion_listings);
delete from public.listing_revisions where listing_id in(select id from qa_completion_listings);
delete from public.media_assets where owner_id in(select id from qa_completion_users) or listing_id in(select id from qa_completion_listings);
delete from public.listings where id in(select id from qa_completion_listings);
delete from public.parking_contributors where user_id in(select id from qa_completion_users) or site_id in(select id from qa_completion_sites);
delete from public.parking_spaces where id in(select id from qa_completion_spaces);
delete from public.parking_levels where id in(select id from qa_completion_levels);
delete from public.parking_sites where id in(select id from qa_completion_sites);
delete from public.terms_acceptances where user_id in(select id from qa_completion_users);
delete from gp_private.auth_grant_consumptions where user_id in(select id from qa_completion_users);
delete from gp_private.export_jobs where user_id in(select id from qa_completion_users);
delete from gp_private.privacy_requests where user_id in(select id from qa_completion_users);
delete from public.audit_events where actor_id in(select id from qa_completion_users) or target_id=any(qa_completion_targets);
delete from public.rate_limits where split_part(bucket,':',1) in(select id::text from qa_completion_users);
end $qa$;
select jsonb_build_object('phase','dependencies_removed','auth_users_preserved',(select count(*) from auth.users where id=any(${uuidArray(plan.userIds)})),'fixture_listings_remaining',(select count(*) from public.listings where seller_id=any(${uuidArray(plan.userIds)})));
commit;
`,
  );
}
function authSql(plan: Plan) {
  const publicNames = plan.buckets["public-approved"];
  assert.ok(publicNames.every((name) => /^[a-f0-9-]{36}\.webp$/.test(name)));
  return scopeSql(
    sqlHeader(plan) +
      `
 if exists(select 1 from public.listings where seller_id in(select id from qa_completion_users)) then raise exception 'QA_DEPENDENCIES_NOT_REMOVED';end if;
 if exists(select 1 from storage.objects where owner in(select id from qa_completion_users) or owner_id in(select id::text from qa_completion_users) or split_part(name,'/',1) in(select id::text from qa_completion_users) or (bucket_id='public-approved' and name=any(array[${publicNames.map((name) => `'${name}'`).join(",")}]::text[]))) then raise exception 'QA_STORAGE_SDK_CLEANUP_REQUIRED';end if;
-- Sessions, identities, factors, own profile/status/role/entitlements and receipts cascade.
delete from auth.users where id in(select id from qa_completion_users);
end $qa$;
select jsonb_build_object('phase','fixture_auth_removed','fixture_users_remaining',(select count(*) from auth.users where id=any(${uuidArray(plan.userIds)})));
commit;
`,
  );
}
async function prepare(config: Config, manifest: any, persist = true) {
  const userIds = unique(manifest.users.map((u: any) => u.id));
  assert.equal(
    userIds.length,
    5,
    "Manifest must contain the exact five dedicated users",
  );
  assert.ok(userIds.every((id) => uuid.test(id)));
  assert.deepEqual(
    unique(Object.values(config.users).map((u) => u.id)),
    userIds,
  );
  assert.ok(
    Object.values(config.users).every((u) => fixtureEmail.test(u.email)),
  );
  assert.equal(
    new URL(config.supabaseUrl).hostname,
    "srrmysturoloovpuuojp.supabase.co",
  );
  const inventories: any[] = [];
  for (const path of [
    ".data/supabase-qa-result.json",
    ".data/supabase-scenes-qa-result.json",
  ]) {
    const value = await readJson(path, true);
    if (!value || !value.userIds?.length) continue;
    assert.ok(
      qaInventoryMatchesUsers(value, userIds),
      "Refusing a prior fixture inventory",
    );
    inventories.push(value);
  }
  const listingIds = unique(inventories.flatMap((i) => i.listingIds || []));
  const media = inventories.flatMap((i) => i.media || []);
  const sources = inventories.flatMap((i) => i.sources || []);
  const buckets: Record<string, string[]> = {
    "private-uploads": unique(media.map((m) => m.objectKey)),
    "public-approved": unique(
      media.filter((m) => uuid.test(m.id)).map((m) => `${m.id}.webp`),
    ),
    "scene-sources": unique(
      sources.flatMap((source) => [
        source.objectKey,
        ...[1, 2, 3].map((n) =>
          source.objectKey.replace(/\.(pdf|webp)$/, `.preview-${n}.png`),
        ),
      ]),
    ),
  };
  for (const [bucket, paths] of Object.entries(buckets)) {
    assert.ok(paths.length <= 1000, "Bounded QA object count exceeded");
    for (const path of paths) {
      assert.ok(typeof path === "string" && !path.includes(".."));
      if (bucket === "public-approved")
        assert.match(path, /^[a-f0-9-]{36}\.webp$/);
      else {
        const [owner, listing] = path.split("/");
        assert.ok(
          userIds.includes(owner) && listingIds.includes(listing),
          "Object path outside fixture scope",
        );
        assert.match(
          path,
          /^[a-f0-9-]{36}\/[a-f0-9-]{36}\/[a-f0-9-]{36}(\.preview-[1-3])?\.(webp|pdf|png)$/,
        );
      }
    }
  }
  const payload = {
    version: 1 as const,
    preparedAt: new Date().toISOString(),
    fixtureCreatedAt: manifest.createdAt,
    userIds,
    listingIds,
    registrySiteIds: unique(
      inventories.flatMap((i) => i.registrySiteIds || []),
    ),
    buckets,
  };
  const plan: Plan = {
    ...payload,
    digest: createHash("sha256").update(JSON.stringify(payload)).digest("hex"),
  };
  if (!persist) return plan;
  await mkdir(".data", { recursive: true });
  await writePrivate(
    ".data/completion-cleanup-plan.json",
    JSON.stringify(plan, null, 2) + "\n",
  );
  await writePrivate(
    ".data/completion-cleanup-dependencies.sql",
    dependencySql(plan),
  );
  await writePrivate(".data/completion-cleanup-auth.sql", authSql(plan));
  return plan;
}
async function storageCleanup(config: Config, plan: Plan) {
  assert.ok(
    process.argv.includes("--db-rows-removed"),
    "Coordinator must first execute the reviewed dependency SQL",
  );
  const clientFor = () =>
    createClient(config.supabaseUrl, config.publishableKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
      },
    });
  const clients = new Map<string, ReturnType<typeof clientFor>>();
  let moderatorFactor: string | undefined;
  const state = {
    planDigest: plan.digest,
    moderatorFactorId: null as string | null,
    factorRevoked: false,
    buckets: [] as { bucket: string; requested: number; deleted: number }[],
    storageCleaned: false,
  };
  const save = () =>
    writePrivate(
      ".data/completion-cleanup-state.json",
      JSON.stringify(state, null, 2) + "\n",
    );
  try {
    for (const identity of Object.values(config.users)) {
      const client = clientFor();
      const result = await client.auth.signInWithPassword({
        email: identity.email,
        password: identity.password,
      });
      assert.ok(
        !result.error && result.data.user?.id === identity.id,
        "Scoped cleanup fixture login failed",
      );
      clients.set(identity.id, client);
    }
    const moderator = clients.get(config.users.moderator.id)!;
    const role = await moderator
      .from("app_roles")
      .select("role")
      .eq("user_id", config.users.moderator.id)
      .single();
    assert.ok(
      !role.error && role.data.role === "moderator",
      "Cleanup moderator role mismatch",
    );
    const factors = await moderator.auth.mfa.listFactors();
    assert.ok(
      !factors.error && !factors.data.totp.some((f) => f.status === "verified"),
      "Cleanup must not use an existing verified factor",
    );
    const enrolled = await moderator.auth.mfa.enroll({
      factorType: "totp",
      friendlyName: "GP QA cleanup",
    });
    assert.ok(
      !enrolled.error && enrolled.data.type === "totp",
      "Cleanup factor enrollment failed",
    );
    moderatorFactor = enrolled.data.id;
    state.moderatorFactorId = moderatorFactor;
    await save();
    const challenge = await moderator.auth.mfa.challenge({
      factorId: moderatorFactor,
    });
    assert.ok(!challenge.error, "Cleanup challenge failed");
    const verified = await moderator.auth.mfa.verify({
      factorId: moderatorFactor,
      challengeId: challenge.data.id,
      code: qaTotp(enrolled.data.totp.secret),
    });
    assert.ok(!verified.error, "Cleanup TOTP verification failed");
    const aal = await moderator.auth.mfa.getAuthenticatorAssuranceLevel();
    assert.ok(
      !aal.error && aal.data.currentLevel === "aal2",
      "Cleanup requires a real AAL2 moderator",
    );
    for (const [table, column, ids] of [
      ["listings", "seller_id", plan.userIds],
      ["media_assets", "owner_id", plan.userIds],
      ["parking_scene_sources", "owner_id", plan.userIds],
      ["parking_scenes", "owner_id", plan.userIds],
    ] as const) {
      const rows = await moderator.from(table).select("id").in(column, ids);
      assert.ok(
        !rows.error && rows.data.length === 0,
        `Scoped ${table} must be removed before Storage cleanup`,
      );
    }
    for (const [bucket, paths] of Object.entries(plan.buckets)) {
      let deleted = 0;
      const byOwner = new Map<string, string[]>();
      for (const path of paths) {
        const owner =
          bucket === "public-approved"
            ? config.users.moderator.id
            : path.split("/")[0];
        const batch = byOwner.get(owner) || [];
        batch.push(path);
        byOwner.set(owner, batch);
      }
      for (const [owner, batch] of byOwner) {
        const client = clients.get(owner)!;
        assert.ok(client, "No authenticated fixture owns this exact object");
        const removed = await client.storage.from(bucket).remove(batch);
        assert.ok(
          !removed.error,
          `Scoped Storage removal failed for ${bucket}`,
        );
        deleted += removed.data.length;
        // API removal may return fewer entries for already absent preview candidates.
        // Verify actual contents, not just the absence of an SDK error.
        for (const directory of unique(
          batch.map((path) =>
            path.includes("/") ? path.slice(0, path.lastIndexOf("/")) : "",
          ),
        )) {
          const remaining = await client.storage
            .from(bucket)
            .list(directory, { limit: 1000 });
          assert.ok(!remaining.error, "Storage post-state listing failed");
          assert.ok(
            !remaining.data.some((item) =>
              batch.includes(
                directory ? `${directory}/${item.name}` : item.name,
              ),
            ),
            "An exact fixture object remains in Storage",
          );
        }
      }
      state.buckets.push({ bucket, requested: paths.length, deleted });
      await save();
    }
    state.storageCleaned = true;
  } finally {
    if (moderatorFactor) {
      const removed = await clients
        .get(config.users.moderator.id)!
        .auth.mfa.unenroll({ factorId: moderatorFactor });
      state.factorRevoked = !removed.error;
    }
    for (const client of clients.values())
      await client.auth.signOut({ scope: "local" });
    await save();
  }
  assert.ok(
    state.storageCleaned && state.factorRevoked,
    "Storage cleanup or own-factor removal incomplete",
  );
  console.info(
    JSON.stringify({
      status: "storage_cleaned",
      buckets: state.buckets,
      factorRevoked: state.factorRevoked,
      authSql: ".data/completion-cleanup-auth.sql",
    }),
  );
}
async function main() {
  const config = (await readJson(".data/supabase-qa.json")) as Config;
  const manifest = await readJson(".data/completion-qa-manifest.json");
  if (process.argv.includes("--storage")) {
    const candidate = await prepare(config, manifest, false);
    const plan = (await readJson(".data/completion-cleanup-plan.json")) as Plan;
    const { digest, ...payload } = plan;
    assert.equal(
      createHash("sha256").update(JSON.stringify(payload)).digest("hex"),
      digest,
      "Reviewed plan digest changed",
    );
    for (const key of [
      "userIds",
      "listingIds",
      "registrySiteIds",
      "buckets",
      "fixtureCreatedAt",
    ] as const)
      assert.deepEqual(
        plan[key],
        candidate[key],
        "Fixture inventory changed since the reviewed plan",
      );
    await storageCleanup(config, plan);
    return;
  }
  const plan = await prepare(config, manifest);
  console.info(
    JSON.stringify({
      status: "prepared_only",
      users: plan.userIds.length,
      listings: plan.listingIds.length,
      sites: plan.registrySiteIds.length,
      objects: Object.fromEntries(
        Object.entries(plan.buckets).map(([bucket, paths]) => [
          bucket,
          paths.length,
        ]),
      ),
      sqlExecuted: false,
      storageDeleted: false,
      plan: ".data/completion-cleanup-plan.json",
    }),
  );
}
void main().catch(() => {
  console.error(
    "Scoped fixture cleanup stopped; inspect private plan/state locally without exposing credentials.",
  );
  process.exitCode = 1;
});
