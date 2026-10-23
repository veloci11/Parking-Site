import { observedRoute } from "@/server/observability";
import { handlePrivacyCommands } from "@/server/privacy-commands";
const observed = observedRoute(handlePrivacyCommands, "application");
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const GET = observed;
export const POST = observed;
