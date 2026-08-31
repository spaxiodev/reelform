import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { pageMeta } from "@/lib/seo";
import { createSupabaseServer } from "@/lib/supabase/server";
import { SiteHeader } from "@/components/SiteHeader";
import { SiteFooter } from "@/components/SiteFooter";
import { FollowButton } from "@/components/FollowButton";
import { ShowcaseGrid, type ShowcaseSite } from "@/components/ShowcaseGrid";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ username: string }>;
}): Promise<Metadata> {
  const { username } = await params;
  return pageMeta({
    title: `@${username}`,
    description: `Video-first websites directed and published by @${username} on Reelform.`,
    path: `/u/${username}`,
  });
}

export default async function ProfilePage({
  params,
}: {
  params: Promise<{ username: string }>;
}) {
  const { username } = await params;
  const supabase = await createSupabaseServer();

  const [{ data: profile }, { data: auth }] = await Promise.all([
    supabase
      .from("public_profiles")
      .select("id, username, full_name, is_private, created_at")
      .ilike("username", username)
      .maybeSingle(),
    supabase.auth.getUser(),
  ]);

  if (!profile) notFound();
  const viewer = auth.user ?? null;

  const [{ data: followRow }, { count: followers }, { count: followingCount }, { data: sites }] =
    await Promise.all([
      viewer
        ? supabase
            .from("follows")
            .select("accepted")
            .eq("follower_id", viewer.id)
            .eq("followee_id", profile.id)
            .maybeSingle()
        : Promise.resolve({ data: null }),
      supabase
        .from("follows")
        .select("follower_id", { count: "exact", head: true })
        .eq("followee_id", profile.id)
        .eq("accepted", true),
      supabase
        .from("follows")
        .select("followee_id", { count: "exact", head: true })
        .eq("follower_id", profile.id)
        .eq("accepted", true),
      // RLS hides a private member's published sites from non-followers.
      supabase
        .from("projects")
        .select("id, name, industry, video_url, video_mode, published_at")
        .eq("user_id", profile.id)
        .eq("published", true)
        .not("site_html", "is", null)
        .order("published_at", { ascending: false })
        .limit(60),
    ]);

  const followState = !followRow ? "none" : followRow.accepted ? "following" : "requested";
  const isOwner = viewer?.id === profile.id;
  const locked = profile.is_private && !isOwner && followState !== "following";

  return (
    <div className="flex flex-col min-h-screen">
      <SiteHeader />

      <main id="main" className="flex-1 px-6 md:px-10 py-16 max-w-6xl mx-auto w-full">
        <div className="flex flex-wrap items-start justify-between gap-6">
          <div>
            <p className="mono-label">
              DIRECTOR PROFILE{profile.is_private ? " · PRIVATE" : ""}
            </p>
            <h1 className="mt-3 text-4xl md:text-5xl font-medium tracking-tight">
              {profile.full_name ?? `@${profile.username}`}
            </h1>
            <p className="mt-2 text-lg text-primary font-medium">@{profile.username}</p>
            <div className="mt-4 flex items-center gap-6 text-sm text-muted">
              <span>
                <span className="font-medium text-ink">{followers ?? 0}</span> followers
              </span>
              <span>
                <span className="font-medium text-ink">{followingCount ?? 0}</span> following
              </span>
              <span className="text-faint">
                Joined{" "}
                {new Date(profile.created_at).toLocaleDateString(undefined, {
                  month: "short",
                  year: "numeric",
                })}
              </span>
            </div>
          </div>
          <FollowButton
            profileId={profile.id}
            viewerId={viewer?.id ?? null}
            isPrivate={profile.is_private}
            initialState={followState}
          />
        </div>

        {locked ? (
          <div className="mt-12 card p-10 md:p-14 text-center">
            <p className="text-5xl mb-5" aria-hidden>
              🔒
            </p>
            <h2 className="text-2xl font-medium tracking-tight">This account is private</h2>
            <p className="mt-3 text-muted max-w-md mx-auto">
              Request to follow @{profile.username}. Once they approve, you&apos;ll see the sites
              and videos they&apos;ve published.
            </p>
          </div>
        ) : !sites || sites.length === 0 ? (
          <div className="mt-12 card p-10 md:p-14 text-center">
            <p className="text-5xl mb-5" aria-hidden>
              🎬
            </p>
            <h2 className="text-2xl font-medium tracking-tight">Nothing published yet</h2>
            <p className="mt-3 text-muted max-w-md mx-auto">
              When @{profile.username} publishes a production to the showcase, it will premiere
              here.
            </p>
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
