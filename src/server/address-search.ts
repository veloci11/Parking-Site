import {
  municipalitySuggestions,
  parseAddressSuggestions,
} from "@/lib/address-search";

let windowStarted = 0;
let requests = 0;
/** Bound outbound requests per process; failure leaves an independent commune search usable. */
export async function searchAddresses(
  query: string,
  request: typeof fetch = fetch,
) {
  const local = municipalitySuggestions(query);
  const now = Date.now();
  if (now - windowStarted > 1000) {
    windowStarted = now;
    requests = 0;
  }
  if (++requests > 20) return { data: local, addressSearchAvailable: false };
  try {
    const url = new URL("https://data.geopf.fr/geocodage/search");
    url.searchParams.set("q", query);
    url.searchParams.set("limit", "8");
    url.searchParams.set("autocomplete", "1");
    const response = await request(url, {
      signal: AbortSignal.timeout(3500),
      cache: "no-store",
      redirect: "error",
      headers: { Accept: "application/json" },
    });
    if (!response.ok) throw new Error("geocoder unavailable");
    const found = parseAddressSuggestions(await response.json());
    const combined = [
      ...found,
      ...local.filter(
        (item) =>
          !found.some(
            (remote) =>
              remote.kind === "municipality" &&
              remote.city === item.city &&
              remote.postalCode === item.postalCode,
          ),
      ),
    ];
    return {
      data: combined
        .filter(
          (item, index) =>
            combined.findIndex((other) => other.label === item.label) === index,
        )
        .slice(0, 8),
      addressSearchAvailable: true,
    };
  } catch {
    return { data: local, addressSearchAvailable: false };
  }
}
