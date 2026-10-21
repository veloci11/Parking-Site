import { observedRoute } from "@/server/observability";
import { handleAuthCommands } from "@/server/auth-commands";
const observed = observedRoute(handleAuthCommands, "application");
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const GET = observed;
export const POST = observed;
