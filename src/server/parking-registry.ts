import { randomUUID, createHash } from "node:crypto";
import { db, transact } from "./db";
import { ApiError, audit, queueNotice } from "./security";
import { readBoundedJson } from "./json-body";
import { sceneContext } from "./scenes/context";
import { listPublicListingSnapshots } from "./catalog";
import { getLocalPublicScene } from "./scenes/local";
import {
  levelPlanDB,
  mutateLocalLevelPlan,
  publicLocalLevelPlan,
} from "./parking-level-plans";
import { seedSharedDemoParking } from "./parking-registry-demo";
import type { Listing, User } from "@/lib/types";
import {
  registryCommandSchema,
  type RegistryCommand,
  type RegistryAdminData,
  type RegistryMutationResult,
  type PublicParking,
} from "@/lib/parking-registry";
export function registryDB() {
  const sql = db();
  sql.exec(
    `CREATE TABLE IF NOT EXISTS parking_sites(id TEXT PRIMARY KEY,public_alias TEXT NOT NULL UNIQUE,public_name TEXT NOT NULL,internal_reference TEXT NOT NULL,private_location TEXT);CREATE TABLE IF NOT EXISTS parking_levels(id TEXT PRIMARY KEY,public_alias TEXT NOT NULL UNIQUE,site_id TEXT NOT NULL REFERENCES parking_sites(id),code TEXT NOT NULL,label TEXT NOT NULL,number INTEGER NOT NULL,sort_order INTEGER NOT NULL,UNIQUE(site_id,code));CREATE TABLE IF NOT EXISTS parking_spaces(id TEXT PRIMARY KEY,public_alias TEXT NOT NULL UNIQUE,level_id TEXT NOT NULL REFERENCES parking_levels(id),number TEXT NOT NULL,private_lot_reference TEXT NOT NULL,dimensions TEXT NOT NULL);CREATE TABLE IF NOT EXISTS parking_contributors(site_id TEXT REFERENCES parking_sites(id),user_id TEXT REFERENCES users(id),scope TEXT NOT NULL,PRIMARY KEY(site_id,user_id));CREATE TABLE IF NOT EXISTS registry_listing_units(listing_id TEXT REFERENCES listings(id),unit_id TEXT NOT NULL,space_id TEXT REFERENCES parking_spaces(id),signature TEXT NOT NULL,PRIMARY KEY(listing_id,unit_id),UNIQUE(listing_id,space_id));CREATE TABLE IF NOT EXISTS registry_published_units(listing_id TEXT REFERENCES listings(id),unit_id TEXT NOT NULL,space_id TEXT REFERENCES parking_spaces(id),PRIMARY KEY(listing_id,unit_id));CREATE TABLE IF NOT EXISTS canonical_space_claims(space_id TEXT PRIMARY KEY REFERENCES parking_spaces(id),listing_id TEXT REFERENCES listings(id));CREATE TABLE IF NOT EXISTS registry_conflicts(id TEXT PRIMARY KEY,listing_id TEXT NOT NULL REFERENCES listings(id),space_id TEXT NOT NULL REFERENCES parking_spaces(id),other_listing_id TEXT NOT NULL REFERENCES listings(id),status TEXT NOT NULL DEFAULT 'open',created_at TEXT NOT NULL);CREATE UNIQUE INDEX IF NOT EXISTS registry_open_conflict ON registry_conflicts(listing_id,space_id,other_listing_id) WHERE status='open';CREATE TRIGGER IF NOT EXISTS registry_listing_hidden AFTER UPDATE OF public_json ON listings WHEN new.public_json IS NULL BEGIN DELETE FROM canonical_space_claims WHERE listing_id=new.id;DELETE FROM registry_published_units WHERE listing_id=new.id;END;`,
  );
  sql.exec(`CREATE TRIGGER IF NOT EXISTS registry_listing_inactive AFTER UPDATE OF public_json,status ON listings
    WHEN new.public_json IS NULL OR new.status IN ('paused','sold','withdrawn','expired','suspended')
    BEGIN DELETE FROM canonical_space_claims WHERE listing_id=new.id;
    DELETE FROM registry_published_units WHERE listing_id=new.id; END;`);
  sql.exec(
    `CREATE TABLE IF NOT EXISTS registry_identity_history(id TEXT PRIMARY KEY,listing_id TEXT NOT NULL REFERENCES listings(id),revision_no INTEGER NOT NULL,units TEXT NOT NULL,action TEXT NOT NULL,actor_id TEXT,reason TEXT,created_at TEXT NOT NULL);`,
  );
  levelPlanDB();
  return sql;
}
const signature = (spaces: Listing["spaces"]) =>
  createHash("sha256")
    .update(
      JSON.stringify(spaces.map(({ offer: _offer, ...physical }) => physical)),
    )
    .digest("hex");
const dimensions = (r: Record<string, unknown>) =>
  JSON.parse(String(r.dimensions));
function admin(actor: User) {
  const r = db()
    .prepare("SELECT role,status,verified FROM users WHERE id=?")
    .get(actor.id);
  if (!r || r.role !== "admin" || r.status !== "active" || !r.verified)
    throw new ApiError(403, "Accès réservé aux administrateurs.", "FORBIDDEN");
}
export function localRegistryAdmin(listingId?: string): RegistryAdminData {
  const sql = registryDB();
  return {
    sites: sql
      .prepare("SELECT * FROM parking_sites ORDER BY id LIMIT 100")
      .all()
      .map((site) => {
        const loc = JSON.parse(String(site.private_location || "{}"));
        return {
          id: String(site.id),
          publicAlias: String(site.public_alias),
          publicName: String(site.public_name),
          internalReference: String(site.internal_reference),
          ...loc,
          levels: sql
            .prepare(
              "SELECT * FROM parking_levels WHERE site_id=? ORDER BY sort_order,id",
            )
            .all(site.id)
            .map((level) => ({
              id: String(level.id),
              publicAlias: String(level.public_alias),
              code: String(level.code),
              label: String(level.label),
              number: Number(level.number),
              sortOrder: Number(level.sort_order),
              planVersion: Number(
                sql
                  .prepare(
                    "SELECT version FROM parking_level_plans WHERE level_id=?",
                  )
                  .get(level.id)?.version ?? 0,
              ),
              planState: sql
                .prepare(
                  "SELECT state FROM parking_level_plans WHERE level_id=?",
                )
                .get(level.id)?.state as "published" | "withdrawn" | undefined,
              spaces: sql
                .prepare(
                  "SELECT * FROM parking_spaces WHERE level_id=? ORDER BY id",
                )
                .all(level.id)
                .map((space) => ({
                  id: String(space.id),
                  publicAlias: String(space.public_alias),
                  number: String(space.number),
                  privateLotReference: String(space.private_lot_reference),
                  ...dimensions(space),
                })),
            })),
          contributors: sql
            .prepare(
              "SELECT user_id,scope FROM parking_contributors WHERE site_id=?",
            )
            .all(site.id)
            .map((c) => ({
              userId: String(c.user_id),
              scope: "common_reference" as const,
            })),
        };
      }),
    links: (listingId
      ? sql
          .prepare(
            "SELECT u.*,l.site_id FROM registry_listing_units u JOIN parking_spaces s ON s.id=u.space_id JOIN parking_levels l ON l.id=s.level_id WHERE u.listing_id=?",
          )
          .all(listingId)
      : []
    ).map((r) => ({
      listingId: String(r.listing_id),
      unitId: String(r.unit_id),
      spaceId: String(r.space_id),
      siteId: String(r.site_id),
    })),
    conflicts: sql
      .prepare(
        "SELECT id,listing_id,status,created_at FROM registry_conflicts ORDER BY created_at DESC LIMIT 100",
      )
      .all()
      .map((r) => ({
        id: String(r.id),
        listingId: String(r.listing_id),
        status: r.status as "open" | "resolved",
        createdAt: String(r.created_at),
      })),
  };
}
function localConflict(
  listing: Record<string, unknown>,
  units: { unitId: string; spaceId: string }[],
  actorId: string,
) {
  const sql = registryDB();
  for (const u of units) {
    const duplicate = sql
      .prepare(
        "SELECT 1 FROM listings l WHERE l.id<>? AND l.seller_id=? AND (EXISTS(SELECT 1 FROM canonical_space_claims c WHERE c.listing_id=l.id AND c.space_id=?) OR (l.status NOT IN ('paused','sold','withdrawn','expired','suspended') AND EXISTS(SELECT 1 FROM registry_listing_units b WHERE b.listing_id=l.id AND b.space_id=?))) LIMIT 1",
      )
      .get(String(listing.id), String(listing.seller_id), u.spaceId, u.spaceId);
    if (duplicate)
      throw new ApiError(
        409,
        "Cette place est déjà rattachée à une autre de vos annonces.",
        "REGISTRY_DUPLICATE_SAME_SELLER",
      );
  }
  for (const u of units) {
    const other = sql
      .prepare(
        "SELECT l.id,l.seller_id FROM registry_listing_units b JOIN listings l ON l.id=b.listing_id WHERE b.space_id=? AND l.id<>? AND l.status NOT IN ('paused','sold','withdrawn','expired','suspended') ORDER BY CASE WHEN l.seller_id=? THEN 0 ELSE 1 END,l.id LIMIT 1",
      )
      .get(u.spaceId, String(listing.id), String(listing.seller_id));
    const claim = sql
      .prepare(
        "SELECT l.id,l.seller_id FROM canonical_space_claims c JOIN listings l ON l.id=c.listing_id WHERE c.space_id=? AND c.listing_id<>?",
      )
      .get(u.spaceId, String(listing.id));
    const target = claim || other;
    if (!target) continue;
    if (target.seller_id === listing.seller_id)
      throw new ApiError(
        409,
        "Cette place est déjà rattachée à une autre de vos annonces.",
        "REGISTRY_DUPLICATE_SAME_SELLER",
      );
    sql
      .prepare(
        "INSERT OR IGNORE INTO registry_conflicts VALUES(?,?,?,?, 'open',?)",
      )
      .run(
        randomUUID(),
        String(listing.id),
        u.spaceId,
        target.id,
        new Date().toISOString(),
      );
    audit(
      actorId,
      "registry.conflict",
      String(listing.id),
      "Physical identity requires independent review.",
    );
    return true;
  }
  return false;
}
function mapped(listingId: string, snapshot: Listing) {
  const rows = registryDB()
    .prepare("SELECT * FROM registry_listing_units WHERE listing_id=?")
    .all(listingId);
  if (
    rows.length !== snapshot.spaces.length ||
    rows.some((r) => r.signature !== signature(snapshot.spaces)) ||
    snapshot.spaces.some((u) => !rows.some((r) => r.unit_id === u.id))
  )
    throw new ApiError(
      409,
      "Un administrateur doit rattacher chaque place physique avant approbation.",
      "REGISTRY_LINK_REQUIRED",
    );
  return rows.map((r) => ({
    unitId: String(r.unit_id),
    spaceId: String(r.space_id),
  }));
}
export function localRegistryPrepareApproval(
  listingId: string,
  actorId: string,
): Listing | null {
  const sql = registryDB(),
    row = sql.prepare("SELECT * FROM listings WHERE id=?").get(listingId)!;
  const value = JSON.parse(String(row.draft_json)) as Listing;
  const units = mapped(listingId, value);
  if (!localConflict(row, units, actorId)) return null;
  const next = {
    ...value,
    status: "changes_requested" as const,
    version: Number(row.version) + 1,
    rejectionReason:
      "Le rattachement physique nécessite un examen indépendant.",
    updatedAt: new Date().toISOString(),
  };
  sql
    .prepare(
      "UPDATE listings SET status='changes_requested',version=version+1,draft_json=?,updated_at=? WHERE id=?",
    )
    .run(JSON.stringify(next), next.updatedAt, listingId);
  sql
    .prepare(
      "UPDATE revisions SET decision='changes_requested',reason=?,actor_id=? WHERE listing_id=? AND version=?",
    )
    .run(next.rejectionReason, actorId, listingId, row.version);
  queueNotice(
    String(row.seller_id),
    "moderation",
    listingId + ":" + next.version,
  );
  return next;
}
function publishedPrivate(listingId: string): Listing | null {
  const sql = registryDB(),
    row = sql
      .prepare("SELECT public_json FROM listings WHERE id=?")
      .get(listingId);
  if (!row?.public_json) return null;
  const revision = sql
    .prepare(
      "SELECT snapshot_json FROM revisions WHERE listing_id=? AND decision='approve' ORDER BY version DESC LIMIT 1",
    )
    .get(listingId);
  return JSON.parse(String(revision?.snapshot_json || row.public_json));
}
export function localRegistryCompleteApproval(
  listingId: string,
  snapshot?: Listing,
) {
  const sql = registryDB(),
    row = sql
      .prepare("SELECT public_json FROM listings WHERE id=?")
      .get(listingId);
  if (!row?.public_json) return;
  const units = mapped(listingId, snapshot ?? publishedPrivate(listingId)!);
  sql
    .prepare("DELETE FROM canonical_space_claims WHERE listing_id=?")
    .run(listingId);
  sql
    .prepare("DELETE FROM registry_published_units WHERE listing_id=?")
    .run(listingId);
  for (const u of units) {
    sql
      .prepare("INSERT INTO canonical_space_claims VALUES(?,?)")
      .run(u.spaceId, listingId);
    sql
      .prepare("INSERT INTO registry_published_units VALUES(?,?,?)")
      .run(listingId, u.unitId, u.spaceId);
  }
  const approved = snapshot ?? publishedPrivate(listingId)!;
  sql
    .prepare("INSERT INTO registry_identity_history VALUES(?,?,?,?,?,?,?,?)")
    .run(
      randomUUID(),
      listingId,
      approved.version,
      JSON.stringify(units),
      "publish",
      null,
      null,
      new Date().toISOString(),
    );
}
/** A paused publication may resume only after reacquiring its physical claims. */
export function localRegistryPrepareResume(listingId: string, actorId: string) {
  const sql = registryDB();
  if (
    !sql
      .prepare("SELECT 1 FROM registry_listing_units WHERE listing_id=?")
      .get(listingId)
  )
    return null; // Existing publications without a registry link stay readable/resumable.
  const row = sql.prepare("SELECT * FROM listings WHERE id=?").get(listingId)!;
  const units = mapped(listingId, publishedPrivate(listingId)!);
  if (!localConflict(row, units, actorId)) return null;
  const next = {
    ...JSON.parse(String(row.draft_json)),
    status: "changes_requested" as const,
    version: Number(row.version) + 1,
    rejectionReason:
      "Le rattachement physique nécessite un examen indépendant.",
    updatedAt: new Date().toISOString(),
  };
  sql
    .prepare(
      "UPDATE listings SET status=?,version=?,draft_json=?,updated_at=?,public_json=NULL WHERE id=?",
    )
    .run(
      next.status,
      next.version,
      JSON.stringify(next),
      next.updatedAt,
      listingId,
    );
  return next as Listing;
}
export function localRegistryCommand(
  actor: User,
  command: RegistryCommand,
): RegistryMutationResult {
  const sql = registryDB();
  return transact(() => {
    admin(actor);
    let id: string = randomUUID();
    const c = command;
    if (c.action === "publish_level_plan" || c.action === "withdraw_level_plan")
      return mutateLocalLevelPlan(c, actor);
    if (c.action === "create_site")
      sql.prepare("INSERT INTO parking_sites VALUES(?,?,?,?,?)").run(
        id,
        randomUUID(),
        c.publicName,
        c.internalReference,
        JSON.stringify({
          exactAddress: c.exactAddress,
          coordinates: c.coordinates,
        }),
      );
    if (c.action === "add_level") {
      if (!sql.prepare("SELECT id FROM parking_sites WHERE id=?").get(c.siteId))
        throw new ApiError(404, "Site introuvable.");
      sql
        .prepare("INSERT INTO parking_levels VALUES(?,?,?,?,?,?,?)")
        .run(
          id,
          randomUUID(),
          c.siteId,
          c.code,
          c.label,
          c.number,
          c.sortOrder,
        );
    }
    if (c.action === "add_space") {
      if (
        !sql.prepare("SELECT id FROM parking_levels WHERE id=?").get(c.levelId)
      )
        throw new ApiError(404, "Niveau introuvable.");
      sql.prepare("INSERT INTO parking_spaces VALUES(?,?,?,?,?,?)").run(
        id,
        randomUUID(),
        c.levelId,
        c.number,
        c.privateLotReference,
        JSON.stringify({
          areaM2: c.areaM2,
          lengthM: c.lengthM,
          widthM: c.widthM,
          clearanceM: c.clearanceM,
        }),
      );
    }
    if (c.action === "set_contributor") {
      if (
        !sql
          .prepare("SELECT id FROM users WHERE id=? AND status='active'")
          .get(c.userId) ||
        !sql.prepare("SELECT id FROM parking_sites WHERE id=?").get(c.siteId)
      )
        throw new ApiError(404, "Site ou compte introuvable.");
      if (c.scope)
        sql
          .prepare(
            "INSERT INTO parking_contributors VALUES(?,?,?) ON CONFLICT(site_id,user_id) DO UPDATE SET scope=excluded.scope",
          )
          .run(c.siteId, c.userId, c.scope);
      else
        sql
          .prepare(
            "DELETE FROM parking_contributors WHERE site_id=? AND user_id=?",
          )
          .run(c.siteId, c.userId);
      id = c.siteId;
    }
    if (c.action === "link_listing") {
      const row = sql
        .prepare("SELECT * FROM listings WHERE id=?")
        .get(c.listingId);
      if (!row) throw new ApiError(404, "Annonce introuvable.");
      if (Number(row.version) !== c.version)
        throw new ApiError(409, "La version a changé.", "VERSION_CONFLICT");
      const value = JSON.parse(String(row.draft_json)) as Listing;
      if (
        c.units.length !== value.spaces.length ||
        new Set(c.units.map((u) => u.unitId)).size !== c.units.length ||
        new Set(c.units.map((u) => u.spaceId)).size !== c.units.length
      )
        throw new ApiError(
          400,
          "Chaque unité doit être rattachée une seule fois.",
        );
      for (const u of c.units) {
        const unit = value.spaces.find((x) => x.id === u.unitId),
          physical = sql
            .prepare(
              "SELECT s.*,l.site_id,l.number level_number FROM parking_spaces s JOIN parking_levels l ON l.id=s.level_id WHERE s.id=?",
            )
            .get(u.spaceId);
        if (
          !unit ||
          !physical ||
          physical.site_id !== c.siteId ||
          Number(physical.level_number) !== unit.level
        )
          throw new ApiError(
            400,
            "Les unités doivent appartenir au site et au niveau choisis.",
          );
        const dim = dimensions(physical);
        for (const key of [
          "areaM2",
          "lengthM",
          "widthM",
          "clearanceM",
        ] as const)
          if (
            unit[key] !== null &&
            dim[key] !== null &&
            Math.abs(unit[key]! - dim[key]) > 0.05
          )
            throw new ApiError(
              400,
              "Les dimensions physiques doivent être rapprochées avant rattachement.",
            );
      }
      if (localConflict(row, c.units, actor.id))
        return {
          status: "conflict",
          listingId: c.listingId,
          version: c.version,
          message: "Le rattachement physique nécessite un examen indépendant.",
        };
      sql
        .prepare("DELETE FROM registry_listing_units WHERE listing_id=?")
        .run(c.listingId);
      for (const u of c.units)
        sql
          .prepare("INSERT INTO registry_listing_units VALUES(?,?,?,?)")
          .run(c.listingId, u.unitId, u.spaceId, signature(value.spaces));
      const next = {
        ...value,
        version: c.version + 1,
        updatedAt: new Date().toISOString(),
      };
      sql
        .prepare(
          "UPDATE listings SET draft_json=?,version=version+1,updated_at=? WHERE id=?",
        )
        .run(JSON.stringify(next), next.updatedAt, c.listingId);
      if (row.status === "pending") {
        sql
          .prepare(
            "UPDATE revisions SET decision='superseded',reason=?,actor_id=? WHERE listing_id=? AND version=? AND decision IS NULL",
          )
          .run(
            "Canonical identity linked by administrator.",
            actor.id,
            c.listingId,
            c.version,
          );
        sql
          .prepare(
            "INSERT INTO revisions(id,listing_id,version,snapshot_json,created_at) VALUES(?,?,?,?,?)",
          )
          .run(
            randomUUID(),
            c.listingId,
            next.version,
            JSON.stringify(next),
            next.updatedAt,
          );
      }
      if (
        row.public_json &&
        signature(publishedPrivate(c.listingId)!.spaces) ===
          signature(value.spaces)
      )
        localRegistryCompleteApproval(c.listingId);
      sql
        .prepare(
          "UPDATE registry_conflicts SET status='resolved' WHERE listing_id=? AND status='open'",
        )
        .run(c.listingId);
      sql
        .prepare(
          "INSERT INTO registry_identity_history VALUES(?,?,?,?,?,?,?,?)",
        )
        .run(
          randomUUID(),
          c.listingId,
          next.version,
          JSON.stringify(c.units),
          "link",
          actor.id,
          c.reason,
          next.updatedAt,
        );
      audit(actor.id, "registry.link_listing", c.listingId, c.reason);
      return { status: "saved", listingId: c.listingId, version: next.version };
    }
    audit(actor.id, "registry." + c.action, id);
    return { status: "saved", id };
  });
}
export function initializeLocalParkingRegistry() {
  const sql = registryDB();
  seedSharedDemoParking(sql);
}
export function localPublicParking(
  alias?: string,
  listingId?: string,
  snapshots?: Listing[],
): PublicParking | null {
  const sql = registryDB();
  seedSharedDemoParking(sql);
  const publicListings = (snapshots ?? listPublicListingSnapshots()).filter(
    (l) =>
      l.locationPrecision === "exact_opt_in" &&
      (!l.availabilityExpiresAt ||
        Date.parse(l.availabilityExpiresAt) > Date.now()),
  );
  const context = listingId
    ? sql
        .prepare(
          "SELECT l.site_id FROM registry_published_units u JOIN parking_spaces s ON s.id=u.space_id JOIN parking_levels l ON l.id=s.level_id WHERE u.listing_id=? LIMIT 1",
        )
        .get(listingId)
    : null;
  const site = alias
    ? sql.prepare("SELECT * FROM parking_sites WHERE public_alias=?").get(alias)
    : context
      ? sql
          .prepare("SELECT * FROM parking_sites WHERE id=?")
          .get(context.site_id)
      : null;
  if (!site || (listingId && !publicListings.some((l) => l.id === listingId)))
    return null;
  const levels = sql
    .prepare(
      "SELECT * FROM parking_levels WHERE site_id=? ORDER BY sort_order,id",
    )
    .all(site.id)
    .map((level) => {
      const rows = sql
        .prepare(
          "SELECT s.public_alias,s.number,u.listing_id,u.unit_id FROM registry_published_units u JOIN parking_spaces s ON s.id=u.space_id WHERE s.level_id=? ORDER BY s.id",
        )
        .all(level.id);
      const spaces = rows.flatMap((r) => {
        const l = publicListings.find((x) => x.id === r.listing_id);
        if (!l) return [];
        const raw = publishedPrivate(l.id)!;
        const index = raw.spaces.findIndex((u) => u.id === r.unit_id);
        return index < 0
          ? []
          : [
              {
                id: String(r.public_alias),
                number: l.spaces[index].number,
                listingId: l.id,
                listingUnitId: l.id + ":unit:" + (index + 1),
              },
            ];
      });
      return {
        id: String(level.public_alias),
        code: String(level.code),
        label: String(level.label),
        number: Number(level.number),
        spaces,
        scenes: [...new Set(spaces.map((s) => s.listingId))].map((id) => ({
          listingId: id,
          level: Number(level.number),
          sceneAvailable: !!getLocalPublicScene(id, Number(level.number)),
        })),
      };
    })
    .filter((l) => l.spaces.length);
  if (!levels.length) return null;
  const ids = new Set(levels.flatMap((l) => l.spaces.map((s) => s.listingId)));
  const result: PublicParking = {
    id: String(site.public_alias),
    publicName: String(site.public_name),
    levels,
    listings: publicListings.filter((l) => ids.has(l.id)),
  };
  for (const level of result.levels) {
    const physical = sql
      .prepare("SELECT id FROM parking_levels WHERE public_alias=?")
      .get(level.id)!;
    level.commonPlan = publicLocalLevelPlan(
      String(physical.id),
      result.id,
      level,
      result.listings,
    );
  }
  const sceneAvailable = result.levels.some(
    (level) => level.commonPlan != null,
  );
  result.listings = result.listings.map((listing) => ({
    ...listing,
    sceneAvailable,
  }));
  return result;
}
export async function handleParkingRegistry(
  request: Request,
): Promise<Response> {
  let ctx: ReturnType<typeof sceneContext> | undefined;
  try {
    ctx = sceneContext(request);
    const path = new URL(request.url).pathname,
      query = new URL(request.url).searchParams;
    const respond = (data: unknown, status = 200) =>
      Response.json({ data }, { status, headers: ctx!.headers() });
    const publicPath = path.match(/^\/api\/parkings(?:\/([a-f0-9-]{36}))?$/);
    if (publicPath && request.method === "GET") {
      const listingId = query.get("listingId");
      if (!publicPath[1] && !listingId)
        throw new ApiError(400, "Choisissez un contexte publié.");
      const data = ctx.client
        ? await ctx.client.rpc("gp_public_parking", {
            p_alias: publicPath[1] ?? null,
            p_listing_id: listingId ?? null,
          })
        : {
            data: localPublicParking(publicPath[1], listingId ?? undefined),
            error: null,
          };
      if (data.error) throw data.error;
      if (!data.data)
        throw new ApiError(404, "Parking indisponible.", "NOT_FOUND");
      return respond(data.data);
    }
    const actor = (await ctx.user())!;
    if (path === "/api/parking-registry/mine" && request.method === "GET") {
      if (ctx.client) {
        const r = await ctx.client.rpc("gp_my_parking_registry");
        if (r.error) throw r.error;
        return respond(r.data);
      }
      const sites = localRegistryAdmin()
        .sites.filter((s) =>
          registryDB()
            .prepare(
              "SELECT scope FROM parking_contributors WHERE site_id=? AND user_id=?",
            )
            .get(s.id, actor.id),
        )
        .map((s) => ({
          id: s.id,
          publicName: s.publicName,
          scope: "common_reference",
          levels: s.levels.map((l) => ({
            id: l.id,
            code: l.code,
            label: l.label,
            number: l.number,
            sortOrder: l.sortOrder,
          })),
        }));
      return respond(sites);
    }
    await ctx.moderator(actor);
    if (actor.role !== "admin")
      throw new ApiError(
        403,
        "Accès réservé aux administrateurs.",
        "FORBIDDEN",
      );
    if (path === "/api/admin/parking-registry" && request.method === "GET") {
      if (ctx.client) {
        const r = await ctx.client.rpc("gp_admin_parking_registry", {
          p_listing_id: query.get("listingId"),
        });
        if (r.error) throw r.error;
        return respond(r.data);
      }
      return respond(localRegistryAdmin(query.get("listingId") ?? undefined));
    }
    if (path === "/api/admin/parking-registry" && request.method === "POST") {
      const result = registryCommandSchema.safeParse(
        await readBoundedJson(request),
      );
      if (!result.success)
        throw new ApiError(400, "Commande de registre invalide.");
      if (ctx.client) {
        const r = await ctx.client.rpc("gp_registry_command", {
          p_command: result.data,
        });
        if (r.error) throw r.error;
        return respond(r.data);
      }
      return respond(localRegistryCommand(actor, result.data));
    }
    throw new ApiError(404, "Route introuvable.");
  } catch (error) {
    const e = error as { message?: string; code?: string };
    const code =
      [
        "REGISTRY_LINK_REQUIRED",
        "REGISTRY_DUPLICATE_SAME_SELLER",
        "VERSION_CONFLICT",
        "FORBIDDEN",
        "NOT_FOUND",
        "MFA_OR_PERMISSION_REQUIRED",
        "MFA_REQUIRED",
        "UNAUTHENTICATED",
      ].find((c) => e.message?.includes(c)) ||
      (error instanceof ApiError ? error.code : undefined) ||
      "REGISTRY_ERROR";
    const status =
      error instanceof ApiError
        ? error.status
        : [
              "VERSION_CONFLICT",
              "REGISTRY_DUPLICATE_SAME_SELLER",
              "REGISTRY_LINK_REQUIRED",
            ].includes(code)
          ? 409
          : [
                "FORBIDDEN",
                "MFA_OR_PERMISSION_REQUIRED",
                "MFA_REQUIRED",
              ].includes(code)
            ? 403
            : code === "UNAUTHENTICATED"
              ? 401
              : code === "NOT_FOUND"
                ? 404
                : 400;
    return Response.json(
      {
        error: {
          code,
          message:
            error instanceof ApiError
              ? error.message
              : code.startsWith("REGISTRY")
                ? "Le rattachement physique nécessite un examen indépendant."
                : "Opération de registre refusée.",
        },
      },
      { status, headers: ctx?.headers() || { "Cache-Control": "no-store" } },
    );
  }
}
