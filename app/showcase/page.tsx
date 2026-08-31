import Link from "next/link";
import { createSupabaseServer } from "@/lib/supabase/server";
import { SiteFooter } from "@/components/SiteFooter";
import { SiteHeader } from "@/components/SiteHeader";
import { ShowcaseGrid, type ShowcaseSite } from "@/components/ShowcaseGrid";
import { pageMeta } from "@/lib/seo";

export const metadata = pageMeta({
  title: "Showcase",
  description:
    "Real video-first websites directed, shot and shipped by Reelform users — each one built by Claude around a Seedance hero video.",
  path: "/showcase",
});

export default async function ShowcasePage() {
  const supabase = await createSupabaseServer();
  const { data: projects } = await supabase
    .from("projects")
    .select("id, user_id, name, industry, video_url, video_mode, published_at")
    .eq("published", true)
    .not("site_html", "is", null)
    .order("published_at", { ascending: false })
    .limit(60);

  // Attach each creator's public handle (profiles RLS hides other members,
  // so usernames come from the public_profiles view).
  const ownerIds = [...new Set((projects ?? []).map((p) => p.user_id))];
  const { data: owners } = ownerIds.length
    ? await supabase.from("public_profiles").select("id, username").in("id", ownerIds)
    : { data: [] };
  const usernameById = new Map((owners ?? []).map((o) => [o.id, o.username]));
  const sites = (projects ?? []).map((p) => ({
    ...p,
    username: usernameById.get(p.user_id) ?? null,
  }));

  return (
    <div className="flex flex-col min-h-screen">
      <SiteHeader />

      <main id="main" className="flex-1 px-6 md:px-10 py-16 max-w-6xl mx-auto w-full">
        <p className="mono-label">PREMIERE NIGHT — MADE WITH REELFORM</p>
        <h1 className="mt-3 text-4xl md:text-6xl font-medium tracking-tight">The showcase</h1>
        <p className="mt-4 max-w-2xl text-lg text-muted leading-relaxed">
          Real websites directed, shot and shipped by Reelform users — each one built by Claude
          around a Seedance hero video. Publish yours from the studio to get featured here.
        </p>

        {sites.length === 0 ? (
          <div className="mt-12 card p-10 md:p-14 text-center">
            <p className="text-5xl mb-5" aria-hidden>
              🎬
            </p>
            <h2 className="text-2xl font-medium tracking-tight">The red carpet is still rolled up</h2>
            <p className="mt-3 text-muted max-w-md mx-auto">
              No sites have been published yet. Build one and hit “Publish to showcase” in the
              studio — you could be first.
            </p>
            <Link href="/create" className="btn-primary mt-8">
              Start building — first site free
            </Link>
          </div>
        ) : (
          <div className="mt-12">
            <ShowcaseGrid sites={sites as ShowcaseSite[]} />
          </div>
        )}
      </main>

      <SiteFooter />
    </div>
  );
}
