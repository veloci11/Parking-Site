import { observedRoute } from "@/server/observability";
import { handleAuthOAuth } from "@/server/auth-oauth";

const observed = observedRoute(handleAuthOAuth, "application");
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const GET = observed;
export const POST = observed;
