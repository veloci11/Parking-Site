import { db, transact } from "./db";
import { ApiError, audit, queueNotice } from "./security";
import type { AdminUser, User } from "@/lib/types";
import type { AdminUserQuery } from "./admin-user-pagination";
export interface AccountDecision {
  version: number;
  status?: "active" | "suspended";
  role?: User["role"];
  reason: string;
}
export function adminUserDTO(row: Record<string, unknown>): AdminUser {
  return {
    id: String(row.id),
    name: String(row.name),
    role: row.role as User["role"],
    status: row.status as AdminUser["status"],
    version: Number(row.account_version),
    sellerType: (row.seller_type as AdminUser["sellerType"]) ?? null,
  };
}
export function adminUsers() {
  return db()
    .prepare(
      "SELECT id,name,role,status,account_version,seller_type FROM users ORDER BY id LIMIT 100",
    )
    .all()
    .map(adminUserDTO);
}
export function adminUsersPage(input: AdminUserQuery) {
  return db()
    .prepare(
      "SELECT id,name,role,status,account_version,seller_type FROM users WHERE (? = '' OR instr(lower(name), ?) > 0 OR instr(lower(id), ?) > 0) AND (? IS NULL OR id > ?) ORDER BY id LIMIT ?",
    )
    .all(
      input.query,
      input.query,
      input.query,
      input.after,
      input.after,
      input.limit + 1,
    )
    .map(adminUserDTO);
}
export function decideAccount(actor: User, id: string, input: AccountDecision) {
  return transact(() => {
    const currentActor = db()
      .prepare("SELECT role,status,verified FROM users WHERE id=?")
      .get(actor.id);
    if (
      !currentActor ||
      currentActor.role !== "admin" ||
      currentActor.status !== "active" ||
      !currentActor.verified
    )
      throw new ApiError(
        403,
        "Accès réservé aux administrateurs.",
        "FORBIDDEN",
      );
    if (actor.role !== "admin")
      throw new ApiError(
        403,
        "Accès réservé aux administrateurs.",
        "FORBIDDEN",
      );
    if (actor.id === id)
      throw new ApiError(
        403,
        "Un administrateur ne peut pas modifier son propre compte ici.",
        "FORBIDDEN",
      );
    const row = db().prepare("SELECT * FROM users WHERE id=?").get(id);
    if (!row) throw new ApiError(404, "Compte introuvable.", "NOT_FOUND");
    if (Number(row.account_version) !== input.version)
      throw new ApiError(409, "Ce compte a changé.", "VERSION_CONFLICT");
    if (!["active", "suspended"].includes(String(row.status)))
      throw new ApiError(409, "Ce compte est en cours de suppression.");
    const status = input.status ?? String(row.status),
      role = input.role ?? String(row.role);
    if (
      row.role === "admin" &&
      row.status === "active" &&
      (role !== "admin" || status !== "active") &&
      Number(
        db()
          .prepare(
            "SELECT count(*) n FROM users WHERE role='admin' AND status='active'",
          )
          .get()?.n,
      ) <= 1
    )
      throw new ApiError(
        409,
        "Le dernier administrateur actif doit être conservé.",
        "LAST_ADMIN",
      );
    if (status === "suspended") {
      const rows = db()
        .prepare(
          "SELECT * FROM listings WHERE seller_id=? AND (public_json IS NOT NULL OR status='pending')",
        )
        .all(id);
      for (const listing of rows) {
        const value = {
          ...JSON.parse(String(listing.draft_json)),
          status: "suspended",
          sceneAvailable: false,
          version: Number(listing.version) + 1,
          updatedAt: new Date().toISOString(),
          rejectionReason: input.reason,
        };
        db()
          .prepare(
            "UPDATE listings SET draft_json=?,public_json=NULL,published_at=NULL,status='suspended',version=version+1,updated_at=? WHERE id=?",
          )
          .run(JSON.stringify(value), value.updatedAt, listing.id);
        db().prepare("DELETE FROM claims WHERE listing_id=?").run(listing.id);
        db()
          .prepare(
            "UPDATE revisions SET decision='suspended',reason=?,actor_id=? WHERE listing_id=? AND decision='pending'",
          )
          .run(input.reason, actor.id, listing.id);
        queueNotice(id, "moderation", `${listing.id}:${value.version}`);
      }
    }
    db()
      .prepare(
        "UPDATE users SET role=?,status=?,account_version=account_version+1 WHERE id=?",
      )
      .run(role, status, id);
    audit(actor.id, "account.decision", id, input.reason);
    return adminUserDTO(
      db().prepare("SELECT * FROM users WHERE id=?").get(id)!,
    );
  });
}
