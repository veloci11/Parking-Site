/** An opaque server reference helps support without exposing backend internals. */
export function apiErrorMessage(response: Response, fallback: string): string {
  const requestId = response.headers.get("x-request-id");
  return response.status >= 500 &&
    requestId &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      requestId,
    )
    ? `${fallback} Référence : ${requestId}.`
    : fallback;
}
