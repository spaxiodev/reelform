import { NextResponse, type NextRequest } from "next/server";
import { createSupabaseServer } from "@/lib/supabase/server";
import { enforceRateLimit } from "@/lib/rate-limit";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { spendCredits, grantCredits } from "@/lib/credits";
import { isAdminUser } from "@/lib/admin";
import { authorizeVideo, releaseFree } from "@/lib/entitlements";
import { planClip } from "@/lib/claude";
import { createVideoTask, DEFAULT_VIDEO_MODEL, type Resolution } from "@/lib/higgsfield";
import { videoCost } from "@/lib/pricing";
import { listVideos, VIDEO_COLUMNS, MAX_VIDEOS_PER_PROJECT } from "@/lib/videos";

// Asking for another video in plain language: Claude turns the request into a
// named slot with a real shot prompt, then it goes straight to render. The
// clips a production already has are the context, so shots don't repeat.
export const maxDuration = 120;

// Extra clips are shot at the same default as the studio's own controls; the
// composer states the cost before the user sends anything.
const RESOLUTION: Resolution = "720p";
const DURATION = 5;

export async function POST(request: NextRequest) {
  const supabase = await createSupabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  // Bounds provider spend per account, credits cap total spend, not rate.
  const limited = await enforceRateLimit(user.id, "video_request");
  if (limited) return limited;

  const body = await request.json().catch(() => ({}));
  if (typeof body.projectId !== "string" || typeof body.request !== "string" || !body.request.trim()) {
    return NextResponse.json({ error: "Describe the video you want" }, { status: 400 });
  }
  const ask = body.request.trim().slice(0, 2000);

  const { data: project } = await supabase
    .from("projects")
    .select("id, name, industry, site_brief")
    .eq("id", body.projectId)
    .single();
  if (!project) return NextResponse.json({ error: "Project not found" }, { status: 404 });

  const clips = await listVideos(supabase, project.id);
  if (!clips.some((c) => c.status === "succeeded")) {
    return NextResponse.json(
      { error: "Shoot your first video before asking for another one." },
      { status: 400 }
    );
  }
  if (clips.length >= MAX_VIDEOS_PER_PROJECT) {
    return NextResponse.json(
      { error: `A production can hold up to ${MAX_VIDEOS_PER_PROJECT} videos.` },
      { status: 400 }
    );
  }

  // Plan first: a failed plan costs the user nothing.
  let plan;
  try {
    plan = await planClip({
      name: project.name ?? "",
      industry: project.industry ?? "",
      siteBrief: project.site_brief ?? "",
      existing: clips
        .filter((c) => c.prompt)
        .map((c) => ({ label: c.label, prompt: c.prompt ?? "", mode: c.mode })),
      request: ask,
    });
  } catch {
    plan = null;
  }
  if (!plan) {
    return NextResponse.json(
      { error: "Could not work out that shot. Try describing it a different way." },
      { status: 502 }
    );
  }

  const isAdmin = isAdminUser(user.id);
  let freeShot = false;
  let cost = 0;
  if (!isAdmin) {
    const grant = await authorizeVideo(supabase, user.id);
    if (!grant.ok) {
      return NextResponse.json({ error: grant.reason, message: grant.message }, { status: 402 });
    }
    freeShot = grant.billing === "free";
    if (!freeShot) {
      cost = videoCost(DEFAULT_VIDEO_MODEL, RESOLUTION, DURATION);
      const ok = await spendCredits(user.id, cost, "video_generation", project.id);
      if (!ok) return NextResponse.json({ error: "insufficient_credits", cost }, { status: 402 });
    }
  }

  // Match the hero's framing so the clips cut together.
  const ratio = (clips[0]?.settings?.ratio as string) ?? "16:9";

  try {
    const { taskId } = await createVideoTask({
      prompt: plan.prompt,
      resolution: RESOLUTION,
      duration: DURATION,
      ratio: ratio as "16:9" | "9:16" | "1:1" | "21:9",
    });

    const admin = createSupabaseAdmin();
    const { data: video, error } = await admin
      .from("project_videos")
      .insert({
        project_id: project.id,
        user_id: user.id,
        position: clips.length,
        label: plan.label,
        prompt: plan.prompt,
        mode: plan.mode,
        status: "queued",
        task_id: taskId,
        settings: {
          resolution: RESOLUTION,
          duration: DURATION,
          ratio,
          cost,
          free: freeShot,
          model: DEFAULT_VIDEO_MODEL,
        },
      })
      .select(VIDEO_COLUMNS)
      .single();

    if (error || !video) throw new Error(error?.message ?? "Could not save the clip");

    await admin.from("messages").insert([
      { project_id: project.id, user_id: user.id, role: "user", target: "video", content: ask },
      {
        project_id: project.id,
        user_id: user.id,
        role: "assistant",
        target: "video",
        content: plan.reply,
      },
    ]);

    return NextResponse.json({ video, reply: plan.reply, cost });
  } catch (err) {
    // Nothing was queued, give the credits back.
    if (freeShot) await releaseFree(user.id, "video");
    else if (!isAdmin) await grantCredits(user.id, cost, "refund", project.id);
    const message = err instanceof Error ? err.message : "Video generation failed";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
