import { observedRoute } from "@/server/observability";
import { readinessHandler } from "@/server/readiness";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const GET = observedRoute(readinessHandler(), "readiness");
