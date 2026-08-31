import { redirect } from "next/navigation";
import { PRIVATE_PAGE } from "@/lib/seo";
import { createSupabaseServer } from "@/lib/supabase/server";
import { isAdminUser } from "@/lib/admin";
import { Studio } from "@/components/Studio";
import { listVideos, VIDEO_COLUMNS, type VideoRow } from "@/lib/videos";

export const metadata = { title: "Studio", ...PRIVATE_PAGE };

export default async function StudioPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createSupabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [{ data: project }, { data: profile }, { data: messages }, videos] = await Promise.all([
    supabase.from("projects").select("*").eq("id", id).single(),
    supabase.from("profiles").select("credits, plan").eq("id", user.id).single(),
    supabase
      .from("messages")
      .select("role, target, content, created_at")
      .eq("project_id", id)
      .order("created_at", { ascending: true }),
    listVideos(supabase, id),
  ]);

  if (!project) redirect("/dashboard");

  // Projects created before clips existed (and any whose hero slot was
  // deleted) get one back, so the studio always has something to direct.
  let clips: VideoRow[] = videos;
  if (clips.length === 0) {
    const { data: created } = await supabase
      .from("project_videos")
      .insert({
        project_id: id,
        user_id: user.id,
        position: 0,
        label: "Hero video",
        mode: project.video_mode === "scrub" ? "scrub" : "loop",
        prompt: project.video_brief,
        status: project.video_status ?? "none",
        task_id: project.video_task_id,
        url: project.video_url,
        settings: project.video_settings ?? {},
      })
      .select(VIDEO_COLUMNS)
      .single();
    if (created) clips = [created as VideoRow];
  }

  return (
    <Studio
      project={project}
      initialVideos={clips}
      initialCredits={profile?.credits ?? 0}
      initialMessages={messages ?? []}
      plan={profile?.plan ?? "free"}
      isAdmin={isAdminUser(user.id)}
    />
  );
}
