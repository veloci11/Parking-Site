import { observedRoute } from "@/server/observability";
import { handleScenes } from "@/server/scenes/api";
const observed = observedRoute(handleScenes, "scene-review");
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const POST = observed;
