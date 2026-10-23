import { observedRoute } from "@/server/observability";
import { handleEntitlements } from "@/server/entitlements";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const observed = observedRoute(handleEntitlements, "application");
export const GET = observed;
export const POST = observed;
