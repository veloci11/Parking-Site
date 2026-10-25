import { apiErrorMessage } from "./api-error";

/** A failed write is never replayed: its server-side outcome may be unknown. */
export async function requestJson<T>(
  path: string,
  options: RequestInit = {},
  timeoutMs = options.body instanceof FormData ? 120_000 : 30_000,
): Promise<T> {
  const headers = new Headers(options.headers);
  if (options.body && !(options.body instanceof FormData))
    headers.set("Content-Type", "application/json");
  const controller = new AbortController();
  // Also works on iPhones whose Safari does not provide AbortSignal.any yet.
  const cancel = () => controller.abort(options.signal?.reason);
  if (options.signal?.aborted) cancel();
  else options.signal?.addEventListener("abort", cancel, { once: true });
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const readOnly = ["GET", "HEAD", "OPTIONS"].includes(
    (options.method || "GET").toUpperCase(),
  );
  try {
    let response: Response;
    try {
      response = await fetch(path, {
        ...options,
        headers,
        signal: controller.signal,
      });
    } catch (error) {
      if (options.signal?.aborted) throw error;
      throw new Error(
        controller.signal.aborted
          ? readOnly
            ? "Le chargement prend trop de temps. Réessayez."
            : "La réponse tarde à arriver. Vérifiez si votre demande a été enregistrée avant de réessayer."
          : readOnly
            ? "Connexion interrompue. Vérifiez votre connexion puis réessayez."
            : "Connexion interrompue. Vérifiez si votre demande a été enregistrée avant de réessayer.",
      );
    }
    if (response.status === 204) return undefined as T;
    let body: unknown;
    try {
      body = await response.json();
    } catch (error) {
      if (options.signal?.aborted) throw error;
      throw new Error(
        apiErrorMessage(
          response,
          readOnly
            ? "Le service est momentanément indisponible. Réessayez."
            : "La réponse n’a pas pu être reçue. Vérifiez si votre demande a été enregistrée avant de réessayer.",
        ),
      );
    }
    const serverError =
      body && typeof body === "object" && "error" in body
        ? (body as { error: unknown }).error
        : null;
    if (!response.ok || serverError)
      throw new Error(
        apiErrorMessage(
          response,
          typeof serverError === "string" && serverError.trim()
            ? serverError
            : response.status === 429
              ? "Trop de demandes. Patientez un instant puis réessayez."
              : "La demande n’a pas pu aboutir. Réessayez.",
        ),
      );
    if (body === null || typeof body !== "object")
      throw new Error("Une réponse inattendue a été reçue. Réessayez.");
    return body as T;
  } finally {
    clearTimeout(timer);
    options.signal?.removeEventListener("abort", cancel);
  }
}
