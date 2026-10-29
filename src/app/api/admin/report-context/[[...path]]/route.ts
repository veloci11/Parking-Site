import { observedRoute } from "@/server/observability";
import { handleContextReports } from "@/server/reports-context";
const observed = observedRoute(handleContextReports, "application");
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const GET = observed;
export const POST = observed;
