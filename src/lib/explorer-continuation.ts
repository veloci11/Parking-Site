import type { Listing } from "./types";

export const explorerContinuationKey = "gp:explore:continuation:v1";
export const explorerPageSize = 24;
const maxContinuationHint = 100000;
const lifetime = 30 * 60 * 1000;

/** Keep only search context and depth; public listings and server cursors are reloaded. */
export function encodeExplorerContinuation(
  context: string,
  count: number,
  now = Date.now(),
): string {
  return JSON.stringify({
    context,
    count: Number.isSafeInteger(count)
      ? Math.max(explorerPageSize, count)
      : explorerPageSize,
    savedAt: now,
  });
}

export function restoredResultCount(
  raw: string | null,
  context: string,
  now = Date.now(),
): number {
  try {
    const value = raw ? JSON.parse(raw) : null;
    if (
      value?.context === context &&
      Number.isInteger(value.count) &&
      value.count >= explorerPageSize &&
      value.count <= maxContinuationHint &&
      Number.isFinite(value.savedAt) &&
      value.savedAt <= now &&
      now - value.savedAt <= lifetime
    )
      return value.count;
  } catch {
    // An absent, expired or damaged navigation hint simply starts at page one.
  }
  return explorerPageSize;
}

export function explorerRequestError(error: unknown): string {
  if (error instanceof TypeError)
    return "La connexion a été interrompue. Vérifiez votre réseau puis réessayez ; vos critères sont conservés.";
  if (error instanceof SyntaxError)
    return "La réponse de recherche est incomplète. Réessayez dans un instant ; vos critères sont conservés.";
  return error instanceof Error && error.message
    ? error.message
    : "La recherche n’a pas pu aboutir. Réessayez dans un instant.";
}

/** Replay fresh keyset pages, rather than restoring stale prices or withdrawn results. */
export async function loadExplorerWindow(
  query: URLSearchParams,
  count = explorerPageSize,
  request: (url: string) => Promise<Pick<Response, "ok" | "json">> = fetch,
  isCurrent: () => boolean = () => true,
): Promise<{
  data: Listing[];
  nextCursor: string | null;
  total: number;
} | null> {
  const params = new URLSearchParams(query);
  params.delete("cursor");
  params.set("limit", String(explorerPageSize));
  const pages = Number.isSafeInteger(count)
    ? Math.max(1, Math.ceil(count / explorerPageSize))
    : 1;
  const data = new Map<string, Listing>();
  const cursors = new Set<string>();
  let total = 0;
  let nextCursor: string | null = null;
  for (let page = 0; page < pages; page++) {
    if (!isCurrent()) return null;
    const response = await request("/api/listings?" + params);
    if (!isCurrent()) return null;
    const result = await response.json();
    if (!response.ok)
      throw new Error(result.error || "La recherche est interrompue.");
    if (!isCurrent()) return null;
    for (const listing of result.data as Listing[])
      data.set(listing.id, listing);
    total = result.total ?? data.size;
    nextCursor = result.nextCursor || null;
    if (!nextCursor || !result.data.length) break;
    if (cursors.has(nextCursor))
      throw new Error("Les résultats ont changé. Relancez la recherche.");
    cursors.add(nextCursor);
    params.set("cursor", nextCursor);
  }
  return { data: [...data.values()], nextCursor, total };
}
