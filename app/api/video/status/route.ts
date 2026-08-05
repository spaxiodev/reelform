import { NextResponse, type NextRequest } from "next/server";
import { createSupabaseServer } from "@/lib/supabase/server";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { grantCredits } from "@/lib/credits";
import { getVideoTask } from "@/lib/seedance";
import { storeVideo } from "@/lib/storage";

// storeVideo spawns ffmpeg (all-intra re-encode) and reads the filesystem, so
// this handler must run on the Node runtime, not edge, with room to encode.
export const runtime = "nodejs";
export const maxDuration = 60;

// GET /api/video/status?projectId=... — polls the Seedance task for the
// project's pending video and persists the outcome.
export async function GET(request: NextRequest) {
  const supabase = await createSupabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const projectId = request.nextUrl.searchParams.get("projectId");
  if (!projectId) return NextResponse.json({ error: "Missing projectId" }, { status: 400 });

  const { data: project } = await supabase
    .from("projects")
    .select("id, video_task_id, video_status, video_url, video_settings")
    .eq("id", projectId)
    .single();
  if (!project) return NextResponse.json({ error: "Project not found" }, { status: 404 });

  // Already settled — nothing to poll.
  if (project.video_status === "succeeded" || project.video_status === "failed" || !project.video_task_id) {
    return NextResponse.json({ status: project.video_status, videoUrl: project.video_url });
  }

  const task = await getVideoTask(project.video_task_id);
  const admin = createSupabaseAdmin();

  if (task.status === "succeeded") {
    // Re-host in our own storage — provider CDN URLs can expire.
    const permanentUrl = task.videoUrl ? await storeVideo(admin, projectId, task.videoUrl) : null;
    const videoUrl = permanentUrl ?? task.videoUrl;
    await admin
      .from("projects")
      .update({ video_status: "succeeded", video_url: videoUrl, updated_at: new Date().toISOString() })
      .eq("id", projectId);
    return NextResponse.json({ status: "succeeded", videoUrl });
  }

  if (task.status === "failed") {
    await admin
      .from("projects")
      .update({ video_status: "failed", updated_at: new Date().toISOString() })
      .eq("id", projectId);
    // Provider failed after we charged — refund.
    const cost = (project.video_settings as { cost?: number })?.cost ?? 0;
    if (cost > 0) await grantCredits(user.id, cost, "refund", projectId);
    return NextResponse.json({ status: "failed", error: task.error });
  }

  if (project.video_status !== task.status) {
    await admin.from("projects").update({ video_status: task.status }).eq("id", projectId);
  }
  return NextResponse.json({ status: task.status });
}
