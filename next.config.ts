import type { NextConfig } from "next";
const nextConfig: NextConfig = {
  distDir: process.env.GP_DIST_DIR || ".next",
  devIndicators: false,
  poweredByHeader: false,
  images: { deviceSizes: [480, 960, 1920], imageSizes: [64, 128, 256] },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "X-Frame-Options", value: "DENY" },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=(self)",
          },
        ],
      },
    ];
  },
};
export default nextConfig;
