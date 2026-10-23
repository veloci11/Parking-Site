import { handleModelingRequests } from "@/server/modeling-requests";
import { observedRoute } from "@/server/observability";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
async function handle(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  return observedRoute(
    (req) => handleModelingRequests(req, id),
    "application",
  )(request);
}
export const GET = handle;
export const POST = handle;
