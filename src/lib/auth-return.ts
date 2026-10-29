import { readSearch, searchParams } from "./search-client";
/** This allowlist never accepts API URLs, protocol-relative destinations or encoded path separators. */
export function safeAuthReturn(raw: unknown): string {
  if (
    typeof raw !== "string" ||
    raw.length > 6000 ||
    !raw.startsWith("/") ||
    raw.startsWith("//") ||
    /[\\\u0000-\u0020]/.test(raw) ||
    /%(?:2f|5c|0[0-9a-f]|1[0-9a-f])/i.test(raw)
  )
    return "/compte";
  let url: URL;
  try {
    url = new URL(raw, "https://gp-return.invalid");
  } catch {
    return "/compte";
  }
  if (url.origin !== "https://gp-return.invalid") return "/compte";
  const p = url.pathname;
  if (
    [
      "/deposer",
      "/compte",
      "/compte/annonces",
      "/compte/messages",
      "/compte/notifications",
      "/compte/favoris",
      "/compte/parkings",
      "/compte/scenes",
      "/compte/abonnement",
      "/compte/parametres",
      "/compte/securite",
      "/compte/signalements",
      "/compte/suppression",
      "/admin",
      "/admin/comptes",
      "/admin/parkings",
      "/admin/scenes",
      "/admin/signalements",
      "/admin/limites",
      "/admin/journal",
    ].includes(p)
  )
    return p;
  if (/^\/compte\/(?:messages|annonces)\/[a-f0-9-]{36}(?:\/modifier)?$/.test(p))
    return p;
  if (/^\/annonces\/[a-f0-9-]{36}\/[a-zA-Z0-9%_-]+$/.test(p)) {
    const params = new URLSearchParams();
    if (url.searchParams.get("contact") === "1") params.set("contact", "1");
    const unit = url.searchParams.get("unit"),
      floor = url.searchParams.get("floor");
    const publicUnit = unit?.match(/^([a-f0-9-]{36}):unit:(\d{1,3})$/i);
    if (
      unit &&
      (/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(unit) ||
        (publicUnit &&
          publicUnit[1] === p.split("/")[2] &&
          +publicUnit[2] >= 1 &&
          +publicUnit[2] <= 500))
    )
      params.set("unit", unit);
    if (floor && /^-?\d{1,2}$/.test(floor) && +floor >= -20 && +floor <= 50)
      params.set("floor", String(+floor));
    return p + (params.size ? `?${params}` : "");
  }
  if (["/", "/explorer", "/favoris"].includes(p)) {
    const params = searchParams(readSearch(url.searchParams));
    const listing = url.searchParams.get("listing");
    if (listing && /^[a-f0-9-]{36}$/.test(listing))
      params.set("listing", listing);
    const display = url.searchParams.get("display");
    if (display === "map" || display === "list") params.set("display", display);
    return p + (params.size ? `?${params}` : "");
  }
  return "/compte";
}
export const localAuthPolicy = {
  termsVersion: "2026-10-21-v1-preparation",
  privacyVersion: "2026-10-21-v1-preparation",
};
export interface AuthPolicy {
  termsVersion: string;
  privacyVersion: string;
}
