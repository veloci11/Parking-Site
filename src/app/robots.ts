import type { MetadataRoute } from "next";
export default function robots(): MetadataRoute.Robots {
  const origin = process.env.NEXT_PUBLIC_SITE_URL;
  return process.env.GP_PUBLIC_LAUNCH === "true"
    ? {
        rules: {
          userAgent: "*",
          allow: "/",
          disallow: [
            "/compte",
            "/admin",
            "/api",
            "/connexion",
            "/inscription",
            "/deposer",
            "/favoris",
            "/comparer",
          ],
        },
        ...(origin
          ? { sitemap: new URL("/sitemap.xml", origin).toString() }
          : {}),
      }
    : { rules: { userAgent: "*", disallow: "/" } };
}
