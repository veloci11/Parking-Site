import { createClient } from "@supabase/supabase-js";
import { assertLocal } from "./security";

type DatabaseProbe = () => Promise<boolean>;
export function readinessHandler(databaseProbe?: DatabaseProbe) {
  return async (request: Request) => {
    const demo = process.env.GP_FORCE_LOCAL_DEMO === "true";
    try {
      let available: boolean;
      if (demo) {
        assertLocal(request);
        const { db } = await import("./db");
        available = !!db().prepare("SELECT 1 AS ready").get();
      } else if (databaseProbe) available = await databaseProbe();
      else {
        const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
        const key =
          process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
          process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
        if (!url || !key) throw new Error("backend not configured");
        const client = createClient(url, key, {
          auth: { persistSession: false, autoRefreshToken: false },
          global: {
            fetch: (input, options) =>
              fetch(input, { ...options, signal: AbortSignal.timeout(4000) }),
          },
        });
        // Exercise the public RLS projection; return no row, count or private metadata.
        const { error } = await client
          .from("published_listings")
          .select("id")
          .limit(1);
        available = !error;
      }
      return Response.json(
        {
          data: {
            status: available ? "ready" : "unavailable",
            mode: demo ? "local-demo" : "supabase",
          },
        },
        {
          status: available ? 200 : 503,
          headers: { "Cache-Control": "private, no-store" },
        },
      );
    } catch {
      return Response.json(
        { data: { status: "unavailable" } },
        { status: 503, headers: { "Cache-Control": "private, no-store" } },
      );
    }
  };
}
