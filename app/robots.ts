import type { MetadataRoute } from "next";
import { appUrl } from "@/lib/env";

export default function robots(): MetadataRoute.Robots {
  const base = appUrl();

  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: [
          "/api/",
          "/dashboard",
          "/studio/",
          "/account",
          // Published sites are served as raw sandboxed HTML with no canonical
          // page around them — indexing them would compete with the user's own
          // hosted copy, which is where we want the traffic to land.
          "/showcase/",
          // Auth entry points carry `next` and `mode` params that generate
          // endless near-duplicate URLs.
          "/login",
        ],
      },
    ],
    sitemap: `${base}/sitemap.xml`,
    host: base,
  };
}
