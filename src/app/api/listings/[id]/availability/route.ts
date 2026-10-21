import { handleAvailability } from "@/server/lifecycle";
import { observedRoute } from "@/server/observability";
export const runtime = "nodejs";
export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  return observedRoute(
    (req) => handleAvailability(req, id),
    "application",
  )(request);
}
