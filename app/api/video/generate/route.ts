import { NextResponse, type NextRequest } from "next/server";
import { createSupabaseServer } from "@/lib/supabase/server";
import { enforceRateLimit } from "@/lib/rate-limit";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { spendCredits, grantCredits } from "@/lib/credits";
import { isAdminUser } from "@/lib/admin";
import {
  createVideoTask,
  isVideoModel,
  resolveShot,
  DEFAULT_VIDEO_MODEL,
  type VideoModelId,
  type Resolution,
  type Ratio,
} from "@/lib/higgsfield";
import { videoCost, FREE_TIER } from "@/lib/pricing";
import { syncPrimaryVideo } from "@/lib/videos";
import { authorizeVideo, releaseFree } from "@/lib/entitlements";

interface Body {
  videoId: string; // the clip slot being shot
  prompt: string;
  resolution: Resolution;
  duration: number;
  ratio: Ratio;
  model?: VideoModelId; // which hosted video model shoots it
}

export async function POST(request: NextRequest) {
  const supabase = await createSupabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  // Bounds provider spend per account, credits cap total spend, not rate.
  const limited = await enforceRateLimit(user.id, "video_generate");
  if (limited) return limited;

  const body = (await request.json()) as Body;
  if (!body.videoId || !body.prompt?.trim()) {
    return NextResponse.json({ error: "Missing video or prompt" }, { status: 400 });
  }
  // Unknown ids fall through to the server default rather than erroring, the
  // picker is a preference, not something a stale client should break on.
  const requestedModel: VideoModelId = isVideoModel(body.model) ? body.model : DEFAULT_VIDEO_MODEL;
  // Snap the request onto what this model can really shoot, and price *that*:
  // charging for 1080p on a model with no resolution control would be a lie.
  const requestedShot = {
    resolution: (["480p", "720p", "1080p"].includes(body.resolution)
      ? body.resolution
      : "720p") as Resolution,
    duration: Number.isFinite(body.duration) ? body.duration : 5,
    ratio: ((["16:9", "9:16", "1:1", "21:9"] as const).includes(body.ratio)
      ? body.ratio
      : "16:9") as Ratio,
  };

  // Ownership check (RLS also enforces this).
  const { data: video } = await supabase
    .from("project_videos")
    .select("id, project_id, position")
    .eq("id", body.videoId)
    .single();
  if (!video) return NextResponse.json({ error: "Video not found" }, { status: 404 });

  // Free accounts get one hero video; after that it's credits on a plan.
  const isAdmin = isAdminUser(user.id);
  let freeShot = false;
  let cost = 0;
  let videoModel = requestedModel;
  let want = requestedShot;
  if (!isAdmin) {
    const grant = await authorizeVideo(supabase, user.id);
    if (!grant.ok) {
      return NextResponse.json({ error: grant.reason, message: grant.message }, { status: 402 });
    }
    freeShot = grant.billing === "free";
    if (freeShot) {
      // The free shot is pinned to a fixed, cheap setup (see FREE_TIER). The
      // shot controls are a paid feature: left open, one free signup could
      // order twelve seconds of Sora 2 Pro at 1080p on our account.
      videoModel = FREE_TIER.video.model;
      want = {
        resolution: FREE_TIER.video.resolution,
        duration: FREE_TIER.video.duration,
        ratio: requestedShot.ratio, // framing is free, it costs the same
      };
    }
  }

  // Snap the request onto what this model can really shoot, and price *that*:
  // charging for 1080p on a model with no resolution control would be a lie.
  const shot = resolveShot(videoModel, want);
  const resolution: Resolution = shot.resolution ?? "720p";
  const duration = shot.duration;
  const ratio: Ratio = shot.ratio ?? "16:9";

  if (!isAdmin && !freeShot) {
    cost = videoCost(videoModel, resolution, duration);
    const ok = await spendCredits(user.id, cost, "video_generation", video.project_id);
    if (!ok) {
      return NextResponse.json({ error: "insufficient_credits", cost }, { status: 402 });
    }
  }

  try {
    const { taskId } = await createVideoTask({
      prompt: body.prompt.trim(),
      resolution,
      duration,
      ratio,
      model: videoModel,
    });

    const admin = createSupabaseAdmin();
    await admin
      .from("project_videos")
      .update({
        prompt: body.prompt.trim(),
        task_id: taskId,
        status: "queued",
        url: null,
        settings: { resolution, duration, ratio, cost, free: freeShot, model: videoModel },
        updated_at: new Date().toISOString(),
      })
      .eq("id", video.id);

    if (video.position === 0) await syncPrimaryVideo(admin, video.project_id);

    await admin.from("messages").insert({
      project_id: video.project_id,
      user_id: user.id,
      role: "user",
      target: "video",
      content: body.prompt.trim(),
    });

    return NextResponse.json({ taskId, cost });
  } catch (err) {
    // Task never started, undo the charge, whichever form it took.
    if (freeShot) await releaseFree(user.id, "video");
    else if (!isAdmin) await grantCredits(user.id, cost, "refund", video.project_id);
    const message = err instanceof Error ? err.message : "Video generation failed";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
