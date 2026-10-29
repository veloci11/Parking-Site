import { randomUUID } from "node:crypto";
import { withRequestContext } from "./request-context";

export interface RequestEvent {
  event: "http_request";
  requestId: string;
  group: string;
  method: string;
  status: number;
  handlerMs: number;
  unexpectedFailure: boolean;
}

/** Logs intentionally exclude URLs, queries, headers, user IDs and body content. */
export function observedRoute(
  handler: (request: Request) => Promise<Response>,
  group:
    "application" | "scenes" | "scene-sources" | "scene-review" | "readiness",
  emit: (event: RequestEvent) => void = (event) =>
    console.info(JSON.stringify(event)),
) {
  return async (request: Request): Promise<Response> => {
    const requestId = randomUUID();
    const started = performance.now();
    let response: Response;
    let unexpectedFailure = false;
    try {
      response = await withRequestContext(requestId, () => handler(request));
    } catch {
      unexpectedFailure = true;
      response = Response.json(
        {
          error:
            "Le service a rencontré une erreur. Réessayez dans un instant.",
          code: "INTERNAL_ERROR",
        },
        { status: 500, headers: { "Cache-Control": "private, no-store" } },
      );
    }
    const handlerMs = Math.round((performance.now() - started) * 10) / 10;
    const headers = new Headers(response.headers);
    headers.set("X-Request-Id", requestId);
    if (response.status === 429 && !headers.has("Retry-After"))
      headers.set("Retry-After", "60");
    headers.append("Server-Timing", `handler;dur=${handlerMs}`);
    // Diagnostic logging must never break a successful publication or cookie response.
    if (
      response.status >= 400 ||
      !["GET", "HEAD", "OPTIONS"].includes(request.method)
    ) {
      try {
        emit({
          event: "http_request",
          requestId,
          group,
          method: request.method,
          status: response.status,
          handlerMs,
          unexpectedFailure,
        });
      } catch {
        /* stdout failures do not change business state */
      }
    }
    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers,
    });
  };
}
