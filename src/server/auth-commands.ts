import { createClient } from "@supabase/supabase-js";
import { randomBytes, randomUUID } from "node:crypto";
import { z } from "zod";
import { sceneContext } from "./scenes/context";
import { readBoundedJson } from "./json-body";
import {
  ApiError,
  effectiveOrigin,
  passwordHash,
  passwordMatches,
  endSession,
  audit,
  rateLimit,
} from "./security";
import { password } from "./validation";
import { db, transact } from "./db";
import {
  safeAuthReturn,
  localAuthPolicy,
  type AuthPolicy,
} from "@/lib/auth-return";
import {
  authFlow,
  authAccountDigest,
  acceptsAuthExchange,
  signAuthValue,
  verifyAuthValue,
  type RecoveryGrant,
} from "./auth-grants";
const recoveryCookie = "gp_recovery_grant";
const localKey = randomBytes(48).toString("hex");
function flowKey(remote: boolean) {
  const key = process.env.GP_AUTH_FLOW_SECRET;
  if (key && key.length >= 32) return key;
  if (!remote) return localKey;
  throw new ApiError(
    503,
    "Le parcours sécurisé d’authentification doit être configuré.",
    "AUTH_FLOW_NOT_CONFIGURED",
  );
}
function cookie(request: Request, value: string, maxAge = 900) {
  return `${recoveryCookie}=${value}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${maxAge}${new URL(effectiveOrigin(request)).protocol === "https:" ? "; Secure" : ""}`;
}
function readCookie(request: Request) {
  return (request.headers.get("cookie") || "")
    .split(";")
    .map((s) => s.trim())
    .find((s) => s.startsWith(recoveryCookie + "="))
    ?.slice(recoveryCookie.length + 1);
}
const signupSchema = z
  .object({
    name: z.string().trim().min(2).max(80),
    email: z.string().trim().toLowerCase().email().max(254),
    password,
    sellerType: z.enum(["private", "professional"]).nullable().optional(),
    termsAccepted: z.literal(true),
    termsVersion: z.string().min(1).max(100),
    privacyVersion: z.string().min(1).max(100),
    next: z.string().max(6000).optional(),
  })
  .strict();
const resetSchema = z
  .object({ password, token: z.string().max(300).optional() })
  .strict();
function ensureLocalTerms() {
  db().exec(
    "CREATE TABLE IF NOT EXISTS terms_acceptances(id TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES users(id),terms_version TEXT NOT NULL,privacy_version TEXT NOT NULL,accepted_at TEXT NOT NULL,source TEXT NOT NULL,UNIQUE(user_id,terms_version,privacy_version))",
  );
}
function saveLocalTerms(id: string, policy: AuthPolicy, source: string) {
  ensureLocalTerms();
  db()
    .prepare("INSERT OR IGNORE INTO terms_acceptances VALUES(?,?,?,?,?,?)")
    .run(
      randomUUID(),
      id,
      policy.termsVersion,
      policy.privacyVersion,
      new Date().toISOString(),
      source,
    );
  audit(id, "auth.terms_accepted", id);
}
export async function handleAuthCommands(
  request: Request,
  actionOverride?: string,
): Promise<Response> {
  let context: ReturnType<typeof sceneContext> | undefined;
  try {
    context = sceneContext(request);
    const { client, remote, user, headers } = context;
    const url = new URL(request.url),
      action =
        actionOverride || url.pathname.replace(/^\/api\/auth\/commands\/?/, "");
    const respond = (
      data: unknown,
      status = 200,
      extra: Record<string, unknown> = {},
    ) => Response.json({ data, ...extra }, { status, headers: headers() });
    async function policy(): Promise<AuthPolicy> {
      if (!client) return localAuthPolicy;
      const r = await client.rpc("gp_auth_policy");
      if (r.error || !r.data?.termsVersion || !r.data?.privacyVersion)
        throw new ApiError(
          503,
          "Les versions des documents ne sont pas disponibles.",
          "TERMS_UNAVAILABLE",
        );
      return r.data;
    }
    async function verifiedIdentity() {
      const u = (await user())!;
      if (!client) return { u, sessionId: null };
      const claims = await client.auth.getClaims();
      if (
        claims.error ||
        claims.data?.claims?.sub !== u.id ||
        typeof claims.data.claims.session_id !== "string"
      )
        throw new ApiError(
          403,
          "Confirmez à nouveau votre connexion.",
          "REAUTH_REQUIRED",
        );
      return { u, sessionId: claims.data.claims.session_id };
    }
    if (action === "policy" && request.method === "GET")
      return respond(await policy());
    if (action === "register" && request.method === "POST") {
      const input = signupSchema.parse(await readBoundedJson(request, 16384)),
        current = await policy();
      if (
        input.termsVersion !== current.termsVersion ||
        input.privacyVersion !== current.privacyVersion
      )
        throw new ApiError(
          409,
          "Les documents ont changé. Rechargez-les avant de confirmer.",
          "TERMS_VERSION_CHANGED",
        );
      if (!client) {
        const { handleApi } = await import("./api");
        const r = await handleApi(
          new Request(new URL("/api/auth/register", request.url), {
            method: "POST",
            headers: request.headers,
            body: JSON.stringify({
              name: input.name,
              email: input.email,
              password: input.password,
              sellerType: input.sellerType ?? null,
            }),
          }),
        );
        if (r.ok) {
          const value = await r.clone().json();
          if (value.data?.id)
            saveLocalTerms(value.data.id, current, "signup_declaration");
        }
        return r;
      }
      const state = signAuthValue(
        authFlow(
          "register",
          input.next,
          Date.now(),
          authAccountDigest(input.email, flowKey(remote)),
        ),
        flowKey(remote),
      );
      const callback = new URL("/api/auth/callback", effectiveOrigin(request));
      callback.searchParams.set("state", state);
      const result = await client.auth.signUp({
        email: input.email,
        password: input.password,
        options: {
          data: {
            name: input.name,
            sellerType: input.sellerType ?? null,
            termsAccepted: true,
            ...current,
          },
          emailRedirectTo: callback.toString(),
        },
      });
      if (result.error)
        throw new ApiError(
          400,
          "Inscription impossible. Vérifiez les informations ou réessayez plus tard.",
          "AUTH_ERROR",
        );
      return respond(null, 201, {
        mode: "supabase",
        message:
          "Consultez votre boîte email pour confirmer votre inscription. Si un compte existe déjà, utilisez la connexion ou la récupération.",
      });
    }
    if (action === "forgot" && request.method === "POST") {
      const input = z
        .object({
          email: z.string().trim().toLowerCase().email().max(254),
          next: z.string().max(6000).optional(),
        })
        .strict()
        .parse(await readBoundedJson(request, 16384));
      if (!client) {
        const { handleApi } = await import("./api");
        return handleApi(
          new Request(new URL("/api/auth/forgot", request.url), {
            method: "POST",
            headers: request.headers,
            body: JSON.stringify({ email: input.email }),
          }),
        );
      }
      const callback = new URL("/api/auth/callback", effectiveOrigin(request));
      callback.searchParams.set(
        "state",
        signAuthValue(
          authFlow(
            "recovery",
            input.next,
            Date.now(),
            authAccountDigest(input.email, flowKey(remote)),
          ),
          flowKey(remote),
        ),
      );
      const result = await client.auth.resetPasswordForEmail(input.email, {
        redirectTo: callback.toString(),
      });
      if (result.error)
        throw new ApiError(
          503,
          "La demande de récupération est momentanément indisponible.",
          "AUTH_UNAVAILABLE",
        );
      return respond({
        message:
          "Si cette adresse correspond à un compte, consultez votre boîte email pour poursuivre la récupération.",
      });
    }
    if (action === "callback" && request.method === "GET") {
      if (!client)
        throw new ApiError(
          400,
          "Utilisez le lien de la boîte locale de démonstration.",
        );
      const rawState = url.searchParams.get("state"),
        state = rawState ? verifyAuthValue(rawState, flowKey(remote)) : null;
      if (rawState && (!state || state.kind === "password-reset"))
        throw new ApiError(
          400,
          "Ce lien est invalide ou a expiré. Demandez un nouveau lien.",
          "AUTH_FLOW_EXPIRED",
        );
      const code = url.searchParams.get("code");
      if (!code)
        throw new ApiError(
          400,
          "Lien de confirmation invalide.",
          "INVALID_CODE",
        );
      const exchanged = await client.auth.exchangeCodeForSession(code);
      if (exchanged.error)
        throw new ApiError(400, "Lien invalide ou expiré.", "INVALID_CODE");
      const { u, sessionId } = await verifiedIdentity();
      if (
        state &&
        state.kind !== "password-reset" &&
        !acceptsAuthExchange(
          state,
          typeof Reflect.get(exchanged.data, "redirectType") === "string"
            ? (Reflect.get(exchanged.data, "redirectType") as string)
            : null,
          exchanged.data.user?.email,
          flowKey(remote),
        )
      )
        throw new ApiError(
          400,
          "Ce lien ne correspond pas à ce parcours. Demandez un nouveau lien.",
          "AUTH_FLOW_MISMATCH",
        );
      const h = headers();
      h.append("Set-Cookie", cookie(request, "", 0));
      let destination = safeAuthReturn(
        state && state.kind !== "password-reset"
          ? state.next
          : url.searchParams.get("next"),
      );
      if (state?.kind === "recovery" && sessionId) {
        const grant: RecoveryGrant = {
          kind: "password-reset",
          userId: u.id,
          sessionId,
          expiresAt: Date.now() + 15 * 60000,
          nonce: state.nonce,
        };
        h.append(
          "Set-Cookie",
          cookie(request, signAuthValue(grant, flowKey(remote))),
        );
        destination = `/reinitialiser?next=${encodeURIComponent(state.next)}`;
      } else if (!state && url.searchParams.get("next") === "/reinitialiser")
        destination = "/reinitialiser";
      h.set(
        "Location",
        new URL(destination, effectiveOrigin(request)).toString(),
      );
      return new Response(null, { status: 303, headers: h });
    }
    if (action === "reset-status" && request.method === "GET") {
      if (!client)
        return respond({ supported: true, recoveryReady: true, mode: "demo" });
      const { u, sessionId } = await verifiedIdentity();
      const value = verifyAuthValue(readCookie(request), flowKey(remote));
      return respond({
        supported: true,
        recoveryReady:
          value?.kind === "password-reset" &&
          value.userId === u.id &&
          value.sessionId === sessionId,
      });
    }
    if (action === "reset" && request.method === "POST") {
      const input = resetSchema.parse(await readBoundedJson(request, 16384));
      if (!client) {
        const { handleApi } = await import("./api");
        return handleApi(
          new Request(new URL("/api/auth/reset", request.url), {
            method: "POST",
            headers: request.headers,
            body: JSON.stringify(input),
          }),
        );
      }
      const { u, sessionId } = await verifiedIdentity(),
        grant = verifyAuthValue(readCookie(request), flowKey(remote));
      if (
        !grant ||
        grant.kind !== "password-reset" ||
        grant.userId !== u.id ||
        grant.sessionId !== sessionId
      )
        throw new ApiError(
          403,
          "Ouvrez un nouveau lien de récupération pour changer ce mot de passe.",
          "RECOVERY_REQUIRED",
        );
      const consumed = await client.rpc("gp_consume_recovery_grant", {
        p_nonce: grant.nonce,
        p_session_id: sessionId,
      });
      if (consumed.error)
        throw new ApiError(
          403,
          "Ce lien ne peut plus être utilisé. Demandez un nouveau lien de récupération.",
          "RECOVERY_GRANT_USED",
        );
      const updated = await client.auth.updateUser({
        password: input.password,
      });
      const h = headers();
      h.append("Set-Cookie", cookie(request, "", 0));
      if (updated.error)
        return Response.json(
          {
            error:
              "Le changement n’a pas été confirmé. Demandez un nouveau lien puis réessayez.",
            code: "PASSWORD_UPDATE_FAILED",
          },
          { status: 400, headers: h },
        );
      await client.auth.signOut({ scope: "local" });
      const finished = headers();
      finished.append("Set-Cookie", cookie(request, "", 0));
      return Response.json({ data: { reset: true } }, { headers: finished });
    }
    if (action === "change-password" && request.method === "POST") {
      const input = z
        .object({ currentPassword: z.string().min(1).max(128), password })
        .strict()
        .parse(await readBoundedJson(request, 16384));
      const { u } = await verifiedIdentity();
      if (!client) {
        const row = db()
          .prepare("SELECT password FROM users WHERE id=?")
          .get(u.id);
        rateLimit(`password-change:${u.id}`, 5, 600);
        if (
          !row?.password ||
          !passwordMatches(input.currentPassword, String(row.password))
        )
          throw new ApiError(
            403,
            "Confirmez votre mot de passe actuel.",
            "REAUTH_REQUIRED",
          );
        transact(() => {
          db()
            .prepare("UPDATE users SET password=? WHERE id=?")
            .run(passwordHash(input.password), u.id);
          audit(u.id, "auth.password_changed", u.id);
        });
        const h = headers();
        h.append("Set-Cookie", endSession(request));
        return Response.json({ data: { changed: true } }, { headers: h });
      }
      const isolated = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
          process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        { auth: { persistSession: false, autoRefreshToken: false } },
      );
      const fresh = await isolated.auth.signInWithPassword({
        email: u.email,
        password: input.currentPassword,
      });
      if (fresh.error || fresh.data.user?.id !== u.id)
        throw new ApiError(
          403,
          "Confirmez votre mot de passe actuel.",
          "REAUTH_REQUIRED",
        );
      // Keep the current session assurance level (including AAL2) after
      // independently checking the password against Auth.
      const updated = await client.auth.updateUser({
        password: input.password,
      });
      await isolated.auth.signOut({ scope: "local" });
      if (updated.error)
        throw new ApiError(
          400,
          "Le mot de passe n’a pas été modifié. Reconnectez-vous et réessayez.",
          "PASSWORD_UPDATE_FAILED",
        );
      await client.auth.signOut({ scope: "local" });
      const h = headers();
      h.append("Set-Cookie", cookie(request, "", 0));
      return Response.json({ data: { changed: true } }, { headers: h });
    }
    if (action === "terms" && request.method === "GET") {
      const u = (await user())!;
      if (!client) {
        ensureLocalTerms();
        const current = localAuthPolicy,
          row = db()
            .prepare(
              "SELECT accepted_at FROM terms_acceptances WHERE user_id=? AND terms_version=? AND privacy_version=?",
            )
            .get(u.id, current.termsVersion, current.privacyVersion);
        return respond({
          ...current,
          accepted: !!row,
          acceptedAt: row?.accepted_at || null,
        });
      }
      const result = await client.rpc("gp_terms_status");
      if (result.error)
        throw new ApiError(503, "Vos déclarations ne sont pas disponibles.");
      return respond(result.data);
    }
    if (action === "terms" && request.method === "POST") {
      const u = (await user())!;
      const input = z
          .object({
            termsAccepted: z.literal(true),
            termsVersion: z.string().max(100),
            privacyVersion: z.string().max(100),
          })
          .strict()
          .parse(await readBoundedJson(request, 16384)),
        current = await policy();
      if (
        input.termsVersion !== current.termsVersion ||
        input.privacyVersion !== current.privacyVersion
      )
        throw new ApiError(
          409,
          "Les documents ont changé. Rechargez la page.",
          "TERMS_VERSION_CHANGED",
        );
      if (!client) {
        saveLocalTerms(u.id, current, "authenticated_declaration");
        return respond({ accepted: true, ...current });
      }
      const r = await client.rpc("gp_accept_terms", {
        p_terms_version: current.termsVersion,
        p_privacy_version: current.privacyVersion,
        p_confirmed: true,
      });
      if (r.error)
        throw new ApiError(
          400,
          "Cette déclaration n’a pas pu être enregistrée.",
        );
      return respond(r.data);
    }
    throw new ApiError(404, "Ressource introuvable.", "NOT_FOUND");
  } catch (error) {
    const h =
      context?.headers() ||
      new Headers({ "Cache-Control": "private, no-store" });
    if (
      (actionOverride === "callback" ||
        new URL(request.url).pathname.endsWith("/commands/callback")) &&
      request.method === "GET"
    ) {
      h.append("Set-Cookie", cookie(request, "", 0));
      const destination = new URL("/connexion", effectiveOrigin(request));
      destination.searchParams.set("authError", "invalid");
      destination.searchParams.set(
        "next",
        safeAuthReturn(new URL(request.url).searchParams.get("next")),
      );
      h.set("Location", destination.toString());
      return new Response(null, { status: 303, headers: h });
    }
    if (error instanceof ApiError)
      return Response.json(
        { error: error.message, code: error.code },
        { status: error.status, headers: h },
      );
    if (error instanceof z.ZodError)
      return Response.json(
        {
          error:
            "Vérifiez les champs et votre acceptation des versions affichées des documents.",
          code: "VALIDATION_ERROR",
        },
        { status: 400, headers: h },
      );
    return Response.json(
      {
        error: "Le parcours d’authentification est momentanément indisponible.",
        code: "AUTH_UNAVAILABLE",
      },
      { status: 503, headers: h },
    );
  }
}
