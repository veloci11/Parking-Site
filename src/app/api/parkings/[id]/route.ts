import { observedRoute } from "@/server/observability";
import { handleParkingRegistry } from "@/server/parking-registry";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const observed = observedRoute(handleParkingRegistry, "application");
export const GET = observed;
export const POST = observed;
