import { z } from "zod";
import { ApiError } from "./security";
import type { AdminUser } from "@/lib/types";

export interface AdminUserQuery {
  query: string;
  limit: number;
  after: string | null;
}
const cursorSchema = z
  .object({
    v: z.literal(1),
    query: z.string().max(80),
    after: z.string().uuid(),
  })
  .strict();
export function parseAdminUserQuery(url: URL): AdminUserQuery | null {
  const params = url.searchParams;
  if (!["q", "cursor", "limit"].some((name) => params.has(name))) return null;
  if (["q", "cursor", "limit"].some((name) => params.getAll(name).length > 1))
    throw new ApiError(400, "Recherche de comptes invalide.");
  const rawQuery = params.get("q") ?? "";
  if (rawQuery.length > 80 || /[\u0000-\u001f\u007f]/.test(rawQuery))
    throw new ApiError(400, "Recherchez avec 80 caractères maximum.");
  const query = rawQuery.trim().toLowerCase();
  const rawLimit = params.get("limit");
  const limit = rawLimit === null ? 50 : Number(rawLimit);
  if (!Number.isInteger(limit) || limit < 1 || limit > 100)
    throw new ApiError(400, "Limite de pagination invalide.");
  const encoded = params.get("cursor");
  let after: string | null = null;
  if (encoded) {
    try {
      if (encoded.length > 1024 || !/^[a-zA-Z0-9_-]+$/.test(encoded))
        throw Error();
      const cursor = cursorSchema.parse(
        JSON.parse(Buffer.from(encoded, "base64url").toString("utf8")),
      );
      if (cursor.query !== query) throw Error();
      after = cursor.after;
    } catch {
      throw new ApiError(
        400,
        "Cette recherche a changé. Relancez-la.",
        "INVALID_CURSOR",
      );
    }
  }
  return { query, limit, after };
}
export function adminUserPage(rows: AdminUser[], input: AdminUserQuery) {
  const items = rows.slice(0, input.limit),
    last = items.at(-1);
  return {
    items,
    nextCursor:
      rows.length > input.limit && last
        ? Buffer.from(
            JSON.stringify({ v: 1, query: input.query, after: last.id }),
          ).toString("base64url")
        : null,
  };
}
