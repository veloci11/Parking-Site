import { searchAddresses } from "@/server/address-search";
import { observedRoute } from "@/server/observability";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const GET = observedRoute(async (request: Request) => {
  const q = (new URL(request.url).searchParams.get("q") || "").trim();
  if (q.length > 120)
    return Response.json(
      {
        error: {
          code: "VALIDATION_ERROR",
          message: "Recherche trop longue.",
        },
      },
      { status: 400 },
    );
  return Response.json(
    q.length < 3
      ? { data: [], addressSearchAvailable: true }
      : await searchAddresses(q),
    { headers: { "Cache-Control": "private, no-store" } },
  );
}, "application");
