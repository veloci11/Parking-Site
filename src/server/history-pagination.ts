import { z } from "zod";
import { ApiError } from "./security";
const schema = z
  .object({
    v: z.literal(1),
    scope: z.string().max(120),
    id: z.string().uuid(),
    createdAt: z.string().datetime({ offset: true }),
  })
  .strict();
export function parseHistoryQuery(url: URL, scope: string) {
  const raw = url.searchParams.get("limit"),
    limit = raw === null ? 100 : Number(raw);
  if (!Number.isInteger(limit) || limit < 1 || limit > 100)
    throw new ApiError(400, "Limite de pagination invalide.");
  const encoded = url.searchParams.get("cursor");
  if (!encoded) return { limit, after: null };
  try {
    if (encoded.length > 1024 || !/^[a-zA-Z0-9_-]+$/.test(encoded))
      throw Error();
    const after = schema.parse(
      JSON.parse(Buffer.from(encoded, "base64url").toString("utf8")),
    );
    if (after.scope !== scope) throw Error();
    return { limit, after };
  } catch {
    throw new ApiError(400, "Curseur d’historique invalide.", "INVALID_CURSOR");
  }
}
export function historyCursor(
  scope: string,
  rows: { id: unknown; created_at: unknown }[],
  limit: number,
) {
  const last = rows[Math.min(rows.length, limit) - 1];
  return rows.length > limit && last
    ? Buffer.from(
        JSON.stringify({
          v: 1,
          scope,
          id: String(last.id),
          createdAt: String(last.created_at),
        }),
      ).toString("base64url")
    : null;
}
