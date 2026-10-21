import { pathToFileURL } from "node:url";

export function readinessUrl(value: string) {
  const url = new URL(value);
  if (
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    !["", "/"].includes(url.pathname)
  )
    throw new Error(
      "Fournir uniquement l’origine publique du site, sans identifiant ni paramètres.",
    );
  const local = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
  if (url.protocol !== "https:" && !(local && url.protocol === "http:"))
    throw new Error("HTTPS requis hors du poste local.");
  return new URL("/api/ready", url);
}

async function main() {
  const url = readinessUrl(
    process.argv[2] ||
      process.env.GP_MONITOR_SITE_URL ||
      "http://127.0.0.1:3000",
  );
  try {
    const response = await fetch(url, {
      signal: AbortSignal.timeout(6000),
      redirect: "error",
      cache: "no-store",
    });
    const payload = await response.json().catch(() => null);
    const ready = response.ok && payload?.data?.status === "ready";
    console.log(
      JSON.stringify({
        checkedAt: new Date().toISOString(),
        status: ready ? "ready" : "unavailable",
        httpStatus: response.status,
        requestId: response.headers.get("x-request-id"),
      }),
    );
    if (!ready) process.exitCode = 1;
  } catch {
    console.log(
      JSON.stringify({
        checkedAt: new Date().toISOString(),
        status: "unavailable",
        reason: "network_or_timeout",
      }),
    );
    process.exitCode = 1;
  }
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href)
  main().catch(() => {
    console.error("Origine du contrôle invalide.");
    process.exitCode = 1;
  });
