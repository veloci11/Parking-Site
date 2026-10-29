import { db } from "./db";
import {
  DEFAULT_LIMITS,
  QUOTA_WINDOWS,
  type QuotaLimits,
  type Entitlements,
} from "@/lib/entitlements";

export function entitlementDB() {
  const sql = db();
  sql.exec(`CREATE TABLE IF NOT EXISTS plan_definitions(code TEXT PRIMARY KEY,limits TEXT NOT NULL,version INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS user_entitlements(user_id TEXT PRIMARY KEY REFERENCES users(id),plan_code TEXT NOT NULL DEFAULT 'free');
    CREATE TABLE IF NOT EXISTS entitlement_overrides(user_id TEXT PRIMARY KEY REFERENCES users(id),limits TEXT NOT NULL,starts_at TEXT NOT NULL,expires_at TEXT NOT NULL,reason TEXT NOT NULL,version INTEGER NOT NULL,updated_by TEXT NOT NULL,updated_at TEXT NOT NULL);`);
  sql
    .prepare("INSERT OR IGNORE INTO plan_definitions VALUES('free',?,1)")
    .run(JSON.stringify(DEFAULT_LIMITS));
  return sql;
}
export function localPlan() {
  const row = entitlementDB()
    .prepare("SELECT * FROM plan_definitions WHERE code='free'")
    .get()!;
  return {
    version: Number(row.version),
    limits: JSON.parse(String(row.limits)) as QuotaLimits,
  };
}
export function localLimits(userId: string) {
  const sql = entitlementDB(),
    plan = localPlan(),
    row = sql
      .prepare("SELECT * FROM entitlement_overrides WHERE user_id=?")
      .get(userId);
  const active =
    !!row &&
    Date.parse(String(row.starts_at)) <= Date.now() &&
    Date.parse(String(row.expires_at)) > Date.now();
  return {
    ...plan,
    limits: {
      ...plan.limits,
      ...(active ? JSON.parse(String(row.limits)) : {}),
    } as QuotaLimits,
    override: row
      ? {
          version: Number(row.version),
          startsAt: String(row.starts_at),
          expiresAt: String(row.expires_at),
          active,
        }
      : null,
  };
}
export function localQuota(
  kind: string,
  userId: string,
): { limit: number; seconds: number } | null {
  const rule = Object.values(QUOTA_WINDOWS).find(
    (value) => value.kind === kind,
  );
  return rule
    ? { limit: localLimits(userId).limits[rule.key], seconds: rule.seconds }
    : null;
}
export function localEntitlements(userId: string): Entitlements {
  const sql = entitlementDB(),
    value = localLimits(userId);
  sql
    .prepare("INSERT OR IGNORE INTO user_entitlements(user_id) VALUES(?)")
    .run(userId);
  const count = Number(
    sql
      .prepare(
        "SELECT COUNT(*) n FROM listings WHERE seller_id=? AND (public_json IS NOT NULL OR status='pending') AND status NOT IN ('sold','withdrawn')",
      )
      .get(userId)!.n,
  );
  const usage = {
    activeListings: {
      limit: value.limits.activeListings,
      used: count,
      remaining: Math.max(0, value.limits.activeListings - count),
      resetsAt: null,
    },
  } as Entitlements["usage"];
  for (const [name, rule] of Object.entries(QUOTA_WINDOWS)) {
    const row = sql
        .prepare("SELECT count,reset_at FROM rate_limits WHERE bucket=?")
        .get(rule.kind + ":" + userId),
      live = !!row && Number(row.reset_at) > Date.now();
    const used = live ? Number(row.count) : 0,
      limit = value.limits[rule.key];
    usage[name as keyof typeof QUOTA_WINDOWS] = {
      limit,
      used,
      remaining: Math.max(0, limit - used),
      resetsAt: live ? new Date(Number(row.reset_at)).toISOString() : null,
    };
  }
  return {
    plan: "free",
    planVersion: value.version,
    billingEnabled: false,
    limits: value.limits,
    override: value.override,
    usage,
  };
}
