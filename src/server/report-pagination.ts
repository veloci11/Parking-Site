import { ApiError } from "./security";
import { parseHistoryQuery } from "./history-pagination";

export function reportPageQuery(url: URL, scope: string, context = false) {
  for (const key of ["status", "cursor", "limit"])
    if (url.searchParams.getAll(key).length > 1)
      throw new ApiError(400, "Filtres de signalement invalides.");
  const status = url.searchParams.get("status") || "all";
  if (!["all", "open", "reviewed", "dismissed"].includes(status))
    throw new ApiError(400, "Statut de signalement invalide.");
  const pageScope = `${scope}:${status}`;
  return {
    ...parseHistoryQuery(url, pageScope),
    scope: pageScope,
    status,
    states:
      status === "all"
        ? []
        : status === "open"
          ? ["open", context ? "appealed" : "pending"]
          : [status],
  };
}

/** SQL fragments use only constant column names; values are always bound. */
export function localReportPageWhere(
  input: ReturnType<typeof reportPageQuery>,
) {
  const conditions: string[] = [];
  const values: (string | number)[] = [];
  if (input.states.length) {
    conditions.push(`status IN (${input.states.map(() => "?").join(",")})`);
    values.push(...input.states);
  }
  if (input.after) {
    conditions.push("(created_at < ? OR (created_at = ? AND id > ?))");
    values.push(input.after.createdAt, input.after.createdAt, input.after.id);
  }
  return { conditions, values };
}
