import type { MetadataRoute } from "next";
import { appUrl } from "@/lib/env";
import { createSupabaseServer } from "@/lib/supabase/server";

// Public profiles come and go as members publish work, so the sitemap is
// regenerated hourly rather than pinned at build time.
export const revalidate = 3600;

const STATIC_ROUTES: { path: string; changeFrequency: MetadataRoute.Sitemap[number]["changeFrequency"]; priority: number }[] = [
  { path: "/", changeFrequency: "weekly", priority: 1 },
  { path: "/pricing", changeFrequency: "weekly", priority: 0.9 },
  { path: "/showcase", changeFrequency: "daily", priority: 0.8 },
  { path: "/guide", changeFrequency: "monthly", priority: 0.8 },
  { path: "/faq", changeFrequency: "monthly", priority: 0.7 },
  { path: "/changelog", changeFrequency: "weekly", priority: 0.6 },
  { path: "/contact", changeFrequency: "yearly", priority: 0.5 },
  { path: "/terms", changeFrequency: "yearly", priority: 0.3 },
  { path: "/privacy", changeFrequency: "yearly", priority: 0.3 },
  { path: "/refunds", changeFrequency: "yearly", priority: 0.3 },
];

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = appUrl();
  const now = new Date();

  const entries: MetadataRoute.Sitemap = STATIC_ROUTES.map((r) => ({
    url: `${base}${r.path}`,
    lastModified: now,
    changeFrequency: r.changeFrequency,
    priority: r.priority,
  }));

  // Creator profiles that are public and have at least one published site.
  // A sitemap failure must never take the whole route down, so this degrades
  // to the static list on any error.
  try {
    const supabase = await createSupabaseServer();
    const { data: published } = await supabase
      .from("projects")
      .select("user_id, published_at")
      .eq("published", true)
      .not("site_html", "is", null)
      .order("published_at", { ascending: false })
      .limit(500);

    const latestByUser = new Map<string, string | null>();
    for (const row of published ?? []) {
      if (!latestByUser.has(row.user_id)) latestByUser.set(row.user_id, row.published_at);
    }

    if (latestByUser.size > 0) {
      const { data: profiles } = await supabase
        .from("public_profiles")
        .select("id, username")
        .in("id", [...latestByUser.keys()]);

      for (const p of profiles ?? []) {
        if (!p.username) continue;
        const last = latestByUser.get(p.id);
        entries.push({
          url: `${base}/u/${p.username}`,
          lastModified: last ? new Date(last) : now,
          changeFrequency: "weekly",
          priority: 0.6,
        });
      }
    }
  } catch {
    // Fall through with the static routes only.
  }

  return entries;
}
