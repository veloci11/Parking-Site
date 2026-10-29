import { observedRoute } from "@/server/observability";
import { handleScenes } from "@/server/scenes/api";
const observed = observedRoute(handleScenes, "scenes");
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const GET = observed;
export const POST = observed;
