import { NextResponse, type NextRequest } from "next/server";
import { createSupabaseServer } from "@/lib/supabase/server";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { spendCredits, grantCredits } from "@/lib/credits";
import { isAdminUser } from "@/lib/admin";
import { createVideoTask } from "@/lib/seedance";
import { videoCost, type Resolution, type Duration } from "@/lib/pricing";

interface Body {
  projectId: string;
  prompt: string;
  resolution: Resolution;
  duration: Duration;
  ratio: "16:9" | "9:16" | "1:1" | "21:9";
}

export async function POST(request: NextRequest) {
  const supabase = await createSupabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const body = (await request.json()) as Body;
  if (!body.projectId || !body.prompt?.trim()) {
    return NextResponse.json({ error: "Missing project or prompt" }, { status: 400 });
  }
  const resolution: Resolution = body.resolution === "1080p" ? "1080p" : "720p";
  const duration: Duration = body.duration === 10 ? 10 : 5;
  const ratio = ["16:9", "9:16", "1:1", "21:9"].includes(body.ratio) ? body.ratio : "16:9";

  // Ownership check (RLS also enforces this).
  const { data: project } = await supabase
    .from("projects")
    .select("id")
    .eq("id", body.projectId)
    .single();
  if (!project) return NextResponse.json({ error: "Project not found" }, { status: 404 });

  const isAdmin = isAdminUser(user.id);
  const cost = isAdmin ? 0 : videoCost(resolution, duration);
  if (!isAdmin) {
    const ok = await spendCredits(user.id, cost, "video_generation", body.projectId);
    if (!ok) {
      return NextResponse.json({ error: "insufficient_credits", cost }, { status: 402 });
    }
  }

  try {
    const { taskId } = await createVideoTask({
      prompt: body.prompt.trim(),
      resolution,
      duration,
      ratio: ratio as Body["ratio"],
    });

    const admin = createSupabaseAdmin();
    await admin
      .from("projects")
      .update({
        video_brief: body.prompt.trim(),
        video_task_id: taskId,
        video_status: "queued",
        video_url: null,
        video_settings: { resolution, duration, ratio, cost },
        updated_at: new Date().toISOString(),
      })
      .eq("id", body.projectId);

    await admin.from("messages").insert({
      project_id: body.projectId,
      user_id: user.id,
      role: "user",
      target: "seedance",
      content: body.prompt.trim(),
    });

    return NextResponse.json({ taskId, cost });
  } catch (err) {
    // Task never started — give the credits back (nothing was charged for admins).
    if (!isAdmin) await grantCredits(user.id, cost, "refund", body.projectId);
    const message = err instanceof Error ? err.message : "Video generation failed";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
