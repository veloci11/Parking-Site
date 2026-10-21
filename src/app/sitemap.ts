import type { MetadataRoute } from "next";
export const dynamic = "force-dynamic";
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const origin = process.env.NEXT_PUBLIC_SITE_URL;
  if (
    process.env.GP_PUBLIC_LAUNCH !== "true" ||
    !origin ||
    !process.env.NEXT_PUBLIC_SUPABASE_URL
  )
    return [];
  const { createClient } = await import("@supabase/supabase-js");
  const client = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
      "",
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
  const result: MetadataRoute.Sitemap = [
    { url: new URL("/", origin).toString(), changeFrequency: "daily" },
    {
      url: new URL("/comment-acheter", origin).toString(),
      changeFrequency: "monthly",
    },
  ];
  for (let offset = 0; ; offset += 1000) {
    const { data, error } = await client
      .from("published_listings")
      .select("id,payload")
      .order("id")
      .range(offset, offset + 999);
    if (error) throw new Error("Catalogue unavailable for sitemap");
    for (const row of data || []) {
      if (row.payload?.isDemo) continue;
      result.push({
        url: new URL(
          `/annonces/${row.id}/${encodeURIComponent(row.payload.slug)}`,
          origin,
        ).toString(),
        lastModified: row.payload.updatedAt,
        changeFrequency: "weekly",
      });
    }
    if (!data || data.length < 1000) break;
  }
  return result;
}
