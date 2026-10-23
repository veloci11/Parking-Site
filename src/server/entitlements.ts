import {
  entitlementCommandSchema,
  type EntitlementCommand,
  type AdminEntitlements,
} from "@/lib/entitlements";
import {
  entitlementDB,
  localEntitlements,
  localPlan,
} from "./entitlement-store";
import { ApiError, audit } from "./security";
import { transact } from "./db";
import { sceneContext } from "./scenes/context";
import { readBoundedJson } from "./json-body";
import type { User } from "@/lib/types";

export function localAdminEntitlements(userId?: string): AdminEntitlements {
  if (
    userId &&
    !entitlementDB().prepare("SELECT 1 FROM users WHERE id=?").get(userId)
  )
    throw new ApiError(404, "Compte introuvable.", "NOT_FOUND");
  return {
    freePlan: localPlan(),
    user: userId ? { ...localEntitlements(userId), userId } : null,
  };
}
export function localEntitlementCommand(
  actor: User,
  command: EntitlementCommand,
): AdminEntitlements {
  const sql = entitlementDB();
  return transact(() => {
    const admin = sql
      .prepare("SELECT role,status,verified FROM users WHERE id=?")
      .get(actor.id);
    if (
      !admin ||
      admin.role !== "admin" ||
      admin.status !== "active" ||
      !admin.verified
    )
      throw new ApiError(
        403,
        "Accès réservé aux administrateurs.",
        "FORBIDDEN",
      );
    if (command.action === "set_free_limits") {
      if (command.version !== localPlan().version)
        throw new ApiError(409, "La version a changé.", "VERSION_CONFLICT");
      sql
        .prepare(
          "UPDATE plan_definitions SET limits=?,version=version+1 WHERE code='free'",
        )
        .run(JSON.stringify(command.limits));
      audit(actor.id, "entitlements.free_limits", "free", command.reason);
      return localAdminEntitlements();
    }
    if (!sql.prepare("SELECT 1 FROM users WHERE id=?").get(command.userId))
      throw new ApiError(404, "Compte introuvable.", "NOT_FOUND");
    const row = sql
      .prepare("SELECT * FROM entitlement_overrides WHERE user_id=?")
      .get(command.userId);
    if ((Number(row?.version) || 0) !== command.version)
      throw new ApiError(409, "La version a changé.", "VERSION_CONFLICT");
    const startsAt =
      command.action === "clear_user_override"
        ? new Date().toISOString()
        : (command.startsAt ?? new Date().toISOString());
    const expiresAt =
      command.action === "clear_user_override" ? startsAt : command.expiresAt;
    if (
      command.action === "set_user_override" &&
      (Date.parse(startsAt) < Date.now() - 300000 ||
        Date.parse(expiresAt) <= Date.parse(startsAt) ||
        Date.parse(expiresAt) > Date.now() + 90 * 86400000)
    )
      throw new ApiError(
        400,
        "La dérogation doit être datée et durer au maximum 90 jours.",
        "LIMITS_INVALID",
      );
    sql
      .prepare(
        "INSERT INTO entitlement_overrides VALUES(?,?,?,?,?,?,?,?) ON CONFLICT(user_id) DO UPDATE SET limits=excluded.limits,starts_at=excluded.starts_at,expires_at=excluded.expires_at,reason=excluded.reason,version=excluded.version,updated_by=excluded.updated_by,updated_at=excluded.updated_at",
      )
      .run(
        command.userId,
        JSON.stringify(
          command.action === "clear_user_override" ? {} : command.limits,
        ),
        startsAt,
        expiresAt,
        command.reason,
        command.version + 1,
        actor.id,
        new Date().toISOString(),
      );
    audit(
      actor.id,
      "entitlements." + command.action,
      command.userId,
      command.reason,
    );
    return localAdminEntitlements(command.userId);
  });
}
export async function handleEntitlements(request: Request): Promise<Response> {
  let context: ReturnType<typeof sceneContext> | undefined;
  try {
    context = sceneContext(request);
    const actor = (await context.user())!,
      url = new URL(request.url),
      adminPath = url.pathname === "/api/admin/entitlements";
    const respond = (data: unknown) =>
      Response.json({ data }, { headers: context!.headers() });
    if (
      !adminPath &&
      url.pathname === "/api/entitlements" &&
      request.method === "GET"
    ) {
      if (!context.client) return respond(localEntitlements(actor.id));
      const result = await context.client.rpc("gp_entitlements");
      if (result.error) throw result.error;
      return respond(result.data);
    }
    if (!adminPath) throw new ApiError(404, "Route introuvable.", "NOT_FOUND");
    await context.moderator(actor);
    if (actor.role !== "admin")
      throw new ApiError(
        403,
        "Accès réservé aux administrateurs.",
        "FORBIDDEN",
      );
    if (request.method === "GET") {
      const userId = url.searchParams.get("userId");
      if (
        userId &&
        !/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(
          userId,
        )
      )
        throw new ApiError(400, "Compte invalide.");
      if (!context.client)
        return respond(localAdminEntitlements(userId ?? undefined));
      const result = await context.client.rpc("gp_admin_entitlements", {
        p_user_id: userId,
      });
      if (result.error) throw result.error;
      return respond(result.data);
    }
    if (request.method === "POST") {
      const parsed = entitlementCommandSchema.safeParse(
        await readBoundedJson(request),
      );
      if (!parsed.success)
        throw new ApiError(
          400,
          "Limites ou commande invalides.",
          "LIMITS_INVALID",
        );
      if (!context.client)
        return respond(localEntitlementCommand(actor, parsed.data));
      const result = await context.client.rpc("gp_entitlement_command", {
        p_command: parsed.data,
      });
      if (result.error) throw result.error;
      return respond(result.data);
    }
    throw new ApiError(405, "Méthode indisponible.");
  } catch (error) {
    const message = (error as Error).message || "";
    const code =
      [
        "MFA_OR_PERMISSION_REQUIRED",
        "MFA_REQUIRED",
        "UNAUTHENTICATED",
        "VERSION_CONFLICT",
        "LIMITS_INVALID",
        "NOT_FOUND",
        "FORBIDDEN",
      ].find((code) => message.includes(code)) ??
      (error instanceof ApiError ? error.code : "LIMITS_INVALID");
    const status =
      error instanceof ApiError
        ? error.status
        : code === "UNAUTHENTICATED"
          ? 401
          : [
                "MFA_OR_PERMISSION_REQUIRED",
                "MFA_REQUIRED",
                "FORBIDDEN",
              ].includes(code)
            ? 403
            : code === "VERSION_CONFLICT"
              ? 409
              : code === "NOT_FOUND"
                ? 404
                : 400;
    return Response.json(
      {
        error:
          error instanceof ApiError
            ? error.message
            : "La gestion des limites nécessite les droits adaptés et une version à jour.",
        code,
      },
      {
        status,
        headers: context?.headers() ?? { "Cache-Control": "private, no-store" },
      },
    );
  }
}
