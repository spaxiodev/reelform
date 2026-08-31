import { NextResponse, type NextRequest } from "next/server";
import { createSupabaseServer } from "@/lib/supabase/server";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import {
  listVideos,
  syncPrimaryVideo,
  MAX_VIDEOS_PER_PROJECT,
  VIDEO_COLUMNS,
} from "@/lib/videos";

// The clips a production has: adding an empty slot to direct by hand, and
// editing the ones already there. Clips that come with a shot already written
// are made in the studio chat instead (/api/video/request).

// Ordinal names for the slots after the hero — "Second video", "Third video"…
const SLOT_NAMES = ["Hero video", "Second video", "Third video", "Fourth video", "Fifth video", "Sixth video"];

// POST — add one empty clip slot at the end. Nothing renders and nothing is
// charged until the user fills it in and hits generate.
export async function POST(request: NextRequest) {
  const supabase = await createSupabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const body = await request.json().catch(() => ({}));
  if (typeof body.projectId !== "string") {
    return NextResponse.json({ error: "Missing project" }, { status: 400 });
  }

  // Ownership: RLS covers the write, but checking here gives a clean 404
  // instead of a constraint error.
  const { data: project } = await supabase
    .from("projects")
    .select("id")
    .eq("id", body.projectId)
    .single();
  if (!project) return NextResponse.json({ error: "Project not found" }, { status: 404 });

  const existing = await listVideos(supabase, body.projectId);
  if (existing.length >= MAX_VIDEOS_PER_PROJECT) {
    return NextResponse.json(
      { error: `A production can hold ${MAX_VIDEOS_PER_PROJECT} videos.` },
      { status: 400 }
    );
  }

  const position = existing.length;
  const { data, error } = await supabase
    .from("project_videos")
    .insert({
      project_id: body.projectId,
      user_id: user.id,
      position,
      label: SLOT_NAMES[position] ?? `Video ${position + 1}`,
      mode: "loop",
    })
    .select(VIDEO_COLUMNS)
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ video: data });
}

// PATCH — rename a clip or change how it plays.
export async function PATCH(request: NextRequest) {
  const supabase = await createSupabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const body = await request.json().catch(() => ({}));
  if (typeof body.videoId !== "string") {
    return NextResponse.json({ error: "Missing video" }, { status: 400 });
  }

  const patch: { label?: string; mode?: string; updated_at: string } = {
    updated_at: new Date().toISOString(),
  };
  if (typeof body.label === "string" && body.label.trim()) patch.label = body.label.trim().slice(0, 60);
  if (body.mode === "loop" || body.mode === "scrub") patch.mode = body.mode;

  // maybeSingle, not single: RLS hides another member's clip rather than
  // erroring, and a miss should read as 404 instead of a 500.
  const { data, error } = await supabase
    .from("project_videos")
    .update(patch)
    .eq("id", body.videoId)
    .select(VIDEO_COLUMNS)
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: "Video not found" }, { status: 404 });

  if (data.position === 0) await syncPrimaryVideo(createSupabaseAdmin(), data.project_id);
  return NextResponse.json({ video: data });
}

// DELETE ?videoId=… — drop a clip and close the gap in the ordering.
export async function DELETE(request: NextRequest) {
  const supabase = await createSupabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const videoId = request.nextUrl.searchParams.get("videoId");
  if (!videoId) return NextResponse.json({ error: "Missing video" }, { status: 400 });

  const { data: video } = await supabase
    .from("project_videos")
    .select("id, project_id, status")
    .eq("id", videoId)
    .single();
  if (!video) return NextResponse.json({ error: "Video not found" }, { status: 404 });

  // A render in flight has already been charged, and deleting the row orphans
  // the poll that would settle it — so the refund on failure would never run
  // and the credits would just vanish. Make the user wait for it to land.
  if (video.status === "queued" || video.status === "running") {
    return NextResponse.json(
      {
        error:
          "This video is still rendering. Wait for it to finish, then remove it — " +
          "deleting it now would forfeit the credits it already cost.",
      },
      { status: 409 }
    );
  }

  const { error } = await supabase.from("project_videos").delete().eq("id", videoId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Re-pack positions so the remaining clips stay 0..n-1 and the next one to be
  // added doesn't collide with an existing position.
  const remaining = await listVideos(supabase, video.project_id);
  await Promise.all(
    remaining.map((v, i) =>
      v.position === i
        ? Promise.resolve()
        : supabase.from("project_videos").update({ position: i }).eq("id", v.id)
    )
  );

  await syncPrimaryVideo(createSupabaseAdmin(), video.project_id);
  return NextResponse.json({ ok: true });
}
