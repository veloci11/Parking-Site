import { createServerClient } from "@supabase/ssr";
import { supabaseConfigured } from "../supabase";
import {
  assertLocal,
  assertSameOrigin,
  effectiveOrigin,
  ApiError,
  currentUser,
} from "../security";
import type { User } from "@/lib/types";
export function sceneContext(request: Request) {
  const remote =
    supabaseConfigured() && process.env.GP_FORCE_LOCAL_DEMO !== "true";
  if (remote) assertSameOrigin(request);
  else assertLocal(request);
  const pending: string[] = [];
  const url = new URL(request.url);
  const client = remote
    ? createServerClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        (process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
          process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY)!,
        {
          cookies: {
            getAll() {
              return (request.headers.get("cookie") || "")
                .split(";")
                .map((c) => c.trim())
                .filter(Boolean)
                .map((c) => {
                  const i = c.indexOf("=");
                  return {
                    name: c.slice(0, i),
                    value: decodeURIComponent(c.slice(i + 1)),
                  };
                });
            },
            setAll(cookies) {
              for (const { name, value, options } of cookies)
                pending.push(
                  `${name}=${encodeURIComponent(value)}; Path=${options.path || "/"}; SameSite=Lax; HttpOnly${new URL(effectiveOrigin(request)).protocol === "https:" ? "; Secure" : ""}${options.maxAge !== undefined ? `; Max-Age=${options.maxAge}` : ""}${options.expires ? `; Expires=${new Date(options.expires).toUTCString()}` : ""}`,
                );
            },
          },
        },
      )
    : null;
  const headers = () => {
    const h = new Headers({
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    });
    pending.forEach((cookie) => h.append("Set-Cookie", cookie));
    return h;
  };
  async function user(required = true): Promise<User | null> {
    if (!client) {
      const u = currentUser(request);
      if (required && !u)
        throw new ApiError(
          401,
          "Connectez-vous pour continuer.",
          "UNAUTHENTICATED",
        );
      return u;
    }
    const {
      data: { user: u },
      error,
    } = await client.auth.getUser();
    if (error || !u) {
      if (required)
        throw new ApiError(
          401,
          "Connectez-vous pour continuer.",
          "UNAUTHENTICATED",
        );
      return null;
    }
    const [p, r, s] = await Promise.all([
      client.from("profiles").select("name").eq("user_id", u.id).single(),
      client.from("app_roles").select("role").eq("user_id", u.id).single(),
      client
        .from("account_statuses")
        .select("status")
        .eq("user_id", u.id)
        .single(),
    ]);
    if (s.error || s.data?.status !== "active")
      throw new ApiError(403, "Ce compte n’est pas actif.", "FORBIDDEN");
    return {
      id: u.id,
      name: p.data?.name || "Membre",
      email: u.email || "",
      role: r.data?.role || "member",
      emailVerified: !!u.email_confirmed_at,
    };
  }
  async function moderator(u: User) {
    if (!u.emailVerified || !["moderator", "admin"].includes(u.role))
      throw new ApiError(403, "Accès réservé à la modération.", "FORBIDDEN");
    if (client) {
      const result = await client.rpc("gp_moderation_allowed");
      if (result.error || result.data !== true)
        throw new ApiError(
          403,
          "Confirmez votre accès de modération et la double authentification.",
          "MFA_REQUIRED",
        );
    }
  }
  return { remote, client, headers, user, moderator };
}
export function sceneError(error: { message: string; code?: string } | null) {
  if (!error) return;
  for (const code of [
    "VERSION_CONFLICT",
    "FORBIDDEN",
    "NOT_FOUND",
    "EMAIL_UNVERIFIED",
    "RATE_LIMITED",
    "SCENE_PEER_REVIEW_REQUIRED",
    "SCENE_INVALID",
    "SCENE_CALIBRATION_REQUIRED",
    "SCENE_MAPPING_INVALID",
    "SCENE_EVIDENCE_REQUIRED",
    "SCENE_REVIEW_REQUIRED",
    "MFA_REQUIRED",
  ])
    if (error.message.includes(code))
      throw new ApiError(
        code === "NOT_FOUND"
          ? 404
          : code === "VERSION_CONFLICT"
            ? 409
            : [
                  "FORBIDDEN",
                  "EMAIL_UNVERIFIED",
                  "MFA_REQUIRED",
                  "SCENE_PEER_REVIEW_REQUIRED",
                ].includes(code)
              ? 403
              : 400,
        (
          {
            VERSION_CONFLICT: "La version du plan a changé.",
            SCENE_PEER_REVIEW_REQUIRED:
              "Un autre modérateur doit contrôler ce plan.",
            SCENE_CALIBRATION_REQUIRED:
              "Calibrez le plan avec deux mesures et une précision.",
            SCENE_MAPPING_INVALID:
              "Le plan et les places publiées ne correspondent pas.",
            SCENE_EVIDENCE_REQUIRED: "Joignez les sources privées autorisées.",
            SCENE_REVIEW_REQUIRED:
              "Confirmez les contrôles et la localisation exacte publiée.",
          } as Record<string, string>
        )[code] || "Cette opération sur le plan est refusée.",
        code,
      );
  throw new ApiError(400, "Le plan n’a pas pu être enregistré.", "SCENE_ERROR");
}
export async function boundedSceneJSON(request: Request, max = 1024 * 1024) {
  if (Number(request.headers.get("content-length") || 0) > max)
    throw new ApiError(413, "Plan trop volumineux.");
  if (!request.body) throw new ApiError(400, "Données manquantes.");
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    for (;;) {
      const part = await reader.read();
      if (part.done) break;
      size += part.value.byteLength;
      if (size > max) {
        await reader.cancel();
        throw new ApiError(413, "Plan trop volumineux.");
      }
      chunks.push(part.value);
    }
  } finally {
    reader.releaseLock();
  }
  const buffer = Buffer.concat(chunks);
  try {
    return JSON.parse(buffer.toString("utf8"));
  } catch {
    throw new ApiError(400, "Fichier JSON invalide.");
  }
}
