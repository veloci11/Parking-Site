import { handleModelingRequests } from "@/server/modeling-requests";
import { observedRoute } from "@/server/observability";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const observed = observedRoute(handleModelingRequests, "application");
export const GET = observed;
export const PATCH = observed;
