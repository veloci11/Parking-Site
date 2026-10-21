import { z } from "zod";
import { sceneContext, boundedSceneJSON } from "./scenes/context";
import { ApiError, audit } from "./security";
import { db, transact } from "./db";
export const AVAILABILITY_DAYS = 90;
export const MAINTENANCE_POLICY = "availability-v1-retention-observe";
const day = 86400000;
export function availabilityDates(confirmedAt: string) {
  const parsed = Date.parse(confirmedAt);
  if (!Number.isFinite(parsed)) throw new Error("Invalid availability date");
  return {
    availabilityConfirmedAt: new Date(parsed).toISOString(),
    availabilityExpiresAt: new Date(
      parsed + AVAILABILITY_DAYS * day,
    ).toISOString(),
  };
}
export function availabilityAction(
  expiresAt: string,
  now = Date.now(),
): "expire" | "remind_3" | "remind_14" | null {
  const remaining = Date.parse(expiresAt) - now;
  if (!Number.isFinite(remaining)) return null;
  return remaining <= 0
    ? "expire"
    : remaining <= 3 * day
      ? "remind_3"
      : remaining <= 14 * day
        ? "remind_14"
        : null;
}
export async function handleAvailability(request: Request, id: string) {
  const context = sceneContext(request),
    { client, user } = context;
  const respond = (data: unknown) =>
    Response.json({ data }, { headers: context.headers() });
  try {
    const owner = (await user())!;
    if (request.method !== "POST")
      throw new ApiError(405, "Méthode non autorisée.");
    const input = z
      .object({ version: z.number().int().positive() })
      .strict()
      .parse(await boundedSceneJSON(request));
    if (!z.string().uuid().safeParse(id).success)
      throw new ApiError(400, "Annonce invalide.");
    if (client) {
      const result = await client.rpc("gp_confirm_availability", {
        p_id: id,
        p_version: input.version,
      });
      if (result.error) {
        const message = result.error.message;
        if (message.includes("VERSION_CONFLICT"))
          throw new ApiError(
            409,
            "Rechargez la version de cette annonce.",
            "VERSION_CONFLICT",
          );
        if (message.includes("AVAILABILITY_REVIEW_REQUIRED"))
          throw new ApiError(
            409,
            "Cette annonce doit être soumise à une nouvelle revue.",
            "AVAILABILITY_REVIEW_REQUIRED",
          );
        if (message.includes("NOT_FOUND"))
          throw new ApiError(404, "Annonce introuvable.");
        throw new ApiError(
          403,
          "La disponibilité ne peut pas être confirmée par ce compte.",
        );
      }
      return respond(result.data);
    }
    const result = transact(() => {
      const row = db()
        .prepare("SELECT * FROM listings WHERE id=? AND seller_id=?")
        .get(id, owner.id);
      if (!row) throw new ApiError(404, "Annonce introuvable.");
      if (Number(row.version) !== input.version)
        throw new ApiError(409, "Rechargez cette annonce.", "VERSION_CONFLICT");
      const account = db()
        .prepare("SELECT status,verified FROM users WHERE id=?")
        .get(owner.id);
      if (account?.status !== "active" || !account.verified)
        throw new ApiError(403, "Compte actif et email confirmé requis.");
      const draft = JSON.parse(String(row.draft_json));
      const published = row.public_json
        ? JSON.parse(String(row.public_json))
        : null;
      const expiresAt =
        published?.availabilityExpiresAt ||
        availabilityDates(String(row.published_at || row.created_at))
          .availabilityExpiresAt;
      if (
        row.status !== "published" ||
        !published ||
        Date.parse(expiresAt) <= Date.now()
      )
        throw new ApiError(
          409,
          "Une nouvelle revue est nécessaire.",
          "AVAILABILITY_REVIEW_REQUIRED",
        );
      const dates = availabilityDates(new Date().toISOString()),
        value = { ...draft, ...dates, version: Number(row.version) + 1 };
      db()
        .prepare(
          "UPDATE listings SET draft_json=?,public_json=?,version=? WHERE id=?",
        )
        .run(
          JSON.stringify(value),
          JSON.stringify({ ...published, ...dates }),
          value.version,
          id,
        );
      audit(owner.id, "listing.availability_confirmed", id, MAINTENANCE_POLICY);
      return value;
    });
    return respond(result);
  } catch (error) {
    if (error instanceof ApiError)
      return Response.json(
        { error: error.message, code: error.code },
        { status: error.status, headers: context.headers() },
      );
    if (error instanceof z.ZodError)
      return Response.json(
        { error: "Version invalide." },
        { status: 400, headers: context.headers() },
      );
    return Response.json(
      { error: "Confirmation indisponible." },
      { status: 500, headers: context.headers() },
    );
  }
}
