import { z } from "zod";
import { ApiError, assertSameOrigin, effectiveOrigin } from "./security";
import { readBoundedJson } from "./json-body";
import { sceneContext } from "./scenes/context";
import { supabaseConfigured } from "./supabase";
import {
  createOAuthIntent,
  oauthProviders,
  signOAuthIntent,
  verifyOAuthIntent,
  type OAuthProvider,
} from "./auth-oauth-intent";

const intentCookie = "gp_oauth_intent";
const privateHeaders = () =>
  new Headers({
    "Cache-Control": "private, no-store",
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "no-referrer",
  });
function flowKey() {
  const key = process.env.GP_AUTH_FLOW_SECRET;
  if (!key || key.length < 32)
    throw new ApiError(
      503,
      "La connexion avec ce service n’est pas encore disponible.",
      "OAUTH_UNAVAILABLE",
    );
  return key;
}
function cookie(request: Request, value: string, maxAge = 600) {
  return `${intentCookie}=${value}; Path=/api/auth/oauth; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${new URL(effectiveOrigin(request)).protocol === "https:" ? "; Secure" : ""}`;
}
function readCookie(request: Request) {
  return (request.headers.get("cookie") || "")
    .split(";")
    .map((value) => value.trim())
    .find((value) => value.startsWith(intentCookie + "="))
    ?.slice(intentCookie.length + 1);
}
async function enabledProviders(): Promise<OAuthProvider[]> {
  if (!supabaseConfigured() || process.env.GP_FORCE_LOCAL_DEMO === "true")
    return [];
  // Do not show an unusable provider when the application cannot bind its callback.
  flowKey();
  const response = await fetch(
    new URL("/auth/v1/settings", process.env.NEXT_PUBLIC_SUPABASE_URL!),
    {
      headers: {
        apikey: (process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
          process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY)!,
      },
      cache: "no-store",
      redirect: "error",
      signal: AbortSignal.timeout(4000),
    },
  );
  if (!response.ok) throw new Error("Auth settings unavailable");
  const settings = await response.json();
  return oauthProviders.filter(
    (provider) => settings.external?.[provider] === true,
  );
}
const startSchema = z
  .object({
    provider: z.enum(oauthProviders),
    next: z.string().max(6000).optional(),
    termsAccepted: z.literal(true),
    termsVersion: z.string().min(1).max(100),
    privacyVersion: z.string().min(1).max(100),
  })
  .strict();

export async function handleAuthOAuth(request: Request) {
  const url = new URL(request.url),
    action = url.pathname.split("/").pop();
  let context: ReturnType<typeof sceneContext> | undefined;
  let callbackNext = "/compte",
    exchanged = false;
  try {
    assertSameOrigin(request);
    if (action === "providers" && request.method === "GET") {
      // Configuration outages should not break ordinary email/password login.
      const providers = await enabledProviders().catch(() => []);
      return Response.json(
        { data: { providers } },
        { headers: privateHeaders() },
      );
    }
    if (!supabaseConfigured() || process.env.GP_FORCE_LOCAL_DEMO === "true")
      throw new ApiError(
        503,
        "La connexion avec ce service n’est pas disponible en démonstration.",
        "OAUTH_UNAVAILABLE",
      );
    const deadline = AbortSignal.timeout(20000);
    context = sceneContext(request, {
      fetch: (input, init) =>
        fetch(input, {
          ...init,
          signal: init?.signal
            ? AbortSignal.any([init.signal, deadline])
            : deadline,
        }),
    });
    const { client, headers, user } = context;
    if (!client)
      throw new ApiError(503, "Connexion indisponible.", "OAUTH_UNAVAILABLE");
    if (action === "start" && request.method === "POST") {
      const input = startSchema.parse(await readBoundedJson(request, 16384));
      if (!(await enabledProviders()).includes(input.provider))
        throw new ApiError(
          409,
          "La connexion avec ce service n’est pas encore disponible.",
          "OAUTH_PROVIDER_DISABLED",
        );
      const current = await client.rpc("gp_auth_policy");
      if (
        current.error ||
        !current.data?.termsVersion ||
        !current.data?.privacyVersion
      )
        throw new ApiError(
          503,
          "Les documents ne sont pas disponibles. Réessayez plus tard.",
          "TERMS_UNAVAILABLE",
        );
      if (
        input.termsVersion !== current.data.termsVersion ||
        input.privacyVersion !== current.data.privacyVersion
      )
        throw new ApiError(
          409,
          "Les documents ont changé. Rechargez la page avant de confirmer.",
          "TERMS_VERSION_CHANGED",
        );
      const intent = createOAuthIntent(input.provider, input.next, {
        termsVersion: input.termsVersion,
        privacyVersion: input.privacyVersion,
      });
      const redirectTo = new URL(
        "/api/auth/oauth/callback",
        effectiveOrigin(request),
      );
      redirectTo.searchParams.set("flow", intent.nonce);
      const result = await client.auth.signInWithOAuth({
        provider: input.provider,
        options: {
          redirectTo: redirectTo.toString(),
          skipBrowserRedirect: true,
        },
      });
      if (result.error || !result.data.url)
        throw new ApiError(
          503,
          "La connexion n’a pas pu démarrer. Réessayez.",
          "OAUTH_UNAVAILABLE",
        );
      const authorize = new URL(result.data.url),
        service = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL!);
      if (
        authorize.origin !== service.origin ||
        authorize.pathname !== "/auth/v1/authorize"
      )
        throw new ApiError(
          503,
          "La connexion n’a pas pu démarrer.",
          "OAUTH_UNAVAILABLE",
        );
      const h = headers();
      h.set("Referrer-Policy", "no-referrer");
      h.append(
        "Set-Cookie",
        cookie(
          request,
          signOAuthIntent(
            {
              ...intent,
              ...(result.data.flowId ? { pkceFlowId: result.data.flowId } : {}),
            },
            flowKey(),
          ),
        ),
      );
      return Response.json(
        { data: { url: authorize.toString() } },
        { headers: h },
      );
    }
    if (action === "callback" && request.method === "GET") {
      const intent = verifyOAuthIntent(readCookie(request), flowKey());
      if (
        !intent ||
        url.searchParams.getAll("flow").length !== 1 ||
        url.searchParams.get("flow") !== intent.nonce
      )
        throw new ApiError(
          400,
          "Recommencez la connexion.",
          "OAUTH_INVALID_CALLBACK",
        );
      callbackNext = intent.next;
      const code = url.searchParams.get("code");
      if (
        url.searchParams.has("error") ||
        !code ||
        code.length > 2048 ||
        url.searchParams.getAll("code").length !== 1
      )
        throw new ApiError(
          400,
          "La connexion n’a pas été terminée.",
          "OAUTH_INVALID_CALLBACK",
        );
      const result = await client.auth.exchangeCodeForSession(
        code,
        intent.pkceFlowId ? { flowId: intent.pkceFlowId } : undefined,
      );
      if (result.error || !result.data.user)
        throw new ApiError(
          400,
          "La connexion n’a pas été terminée.",
          "OAUTH_INVALID_CALLBACK",
        );
      exchanged = true;
      // Identity is verified remotely; roles/status are read from protected app tables.
      const identity = await user();
      const claims = await client.auth.getClaims();
      if (
        !identity ||
        identity.id !== result.data.user.id ||
        !identity.emailVerified ||
        claims.error ||
        claims.data?.claims.sub !== identity.id ||
        typeof claims.data.claims.session_id !== "string"
      )
        throw new ApiError(
          403,
          "Ce compte ne peut pas être connecté.",
          "OAUTH_IDENTITY_REJECTED",
        );
      // Consent was explicit before departure and is bound to this browser flow.
      // The RPC rejects a policy change during the external provider's login.
      const terms = await client.rpc("gp_accept_terms", {
        p_terms_version: intent.termsVersion,
        p_privacy_version: intent.privacyVersion,
        p_confirmed: true,
      });
      if (terms.error || terms.data?.accepted !== true)
        throw new ApiError(
          409,
          "Les documents doivent être confirmés à nouveau.",
          "TERMS_VERSION_CHANGED",
        );
      const h = headers();
      h.append("Set-Cookie", cookie(request, "", 0));
      h.set("Referrer-Policy", "no-referrer");
      h.set(
        "Location",
        new URL(intent.next, effectiveOrigin(request)).toString(),
      );
      return new Response(null, { status: 303, headers: h });
    }
    throw new ApiError(404, "Ressource introuvable.", "NOT_FOUND");
  } catch (error) {
    if (action === "callback" && request.method === "GET") {
      if (exchanged)
        await context?.client?.auth.signOut({ scope: "local" }).catch(() => {});
      const h = privateHeaders();
      // Never deliver newly issued session cookies after a failed identity/consent check.
      for (const value of context?.headers().getSetCookie() || [])
        if (/Max-Age=0(?:;|$)/.test(value)) h.append("Set-Cookie", value);
      h.append("Set-Cookie", cookie(request, "", 0));
      const destination = new URL("/connexion", effectiveOrigin(request));
      destination.searchParams.set(
        "authError",
        error instanceof ApiError && error.code === "TERMS_VERSION_CHANGED"
          ? "oauth-terms"
          : "oauth",
      );
      destination.searchParams.set("next", callbackNext);
      h.set("Location", destination.toString());
      return new Response(null, { status: 303, headers: h });
    }
    return Response.json(
      {
        error:
          error instanceof ApiError
            ? error.message
            : error instanceof z.ZodError
              ? "Acceptez les conditions et vérifiez les informations avant de continuer."
              : "Ce service de connexion est momentanément indisponible.",
        code: error instanceof ApiError ? error.code : "OAUTH_UNAVAILABLE",
      },
      {
        status:
          error instanceof ApiError
            ? error.status
            : error instanceof z.ZodError
              ? 400
              : 503,
        headers: privateHeaders(),
      },
    );
  }
}
