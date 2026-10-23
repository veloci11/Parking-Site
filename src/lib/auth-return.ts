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
      "/compte/parametres",
      "/compte/securite",
      "/compte/signalements",
    ].includes(p)
  )
    return p;
  if (/^\/compte\/(?:messages|annonces)\/[a-f0-9-]{36}(?:\/modifier)?$/.test(p))
    return p;
  if (/^\/annonces\/[a-f0-9-]{36}\/[a-zA-Z0-9%_-]+$/.test(p))
    return p + (url.searchParams.get("contact") === "1" ? "?contact=1" : "");
  if (["/", "/explorer", "/favoris"].includes(p)) {
    const params = searchParams(readSearch(url.searchParams));
    const listing = url.searchParams.get("listing");
    if (listing && /^[a-f0-9-]{36}$/.test(listing))
      params.set("listing", listing);
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
