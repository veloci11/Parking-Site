import { observedRoute } from "@/server/observability";
import { handleEntitlements } from "@/server/entitlements";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const GET = observedRoute(handleEntitlements, "application");
