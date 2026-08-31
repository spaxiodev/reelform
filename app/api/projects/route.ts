import { NextResponse, type NextRequest } from "next/server";
import { createSupabaseServer } from "@/lib/supabase/server";
import { enforceRateLimit } from "@/lib/rate-limit";
import { DEFAULT_MODEL } from "@/lib/pricing";
import { authorizeProject } from "@/lib/entitlements";
import { isAdminUser } from "@/lib/admin";

export async function POST(request: NextRequest) {
  const supabase = await createSupabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  // Bounds provider spend per account, credits cap total spend, not rate.
  const limited = await enforceRateLimit(user.id, "project_create");
  if (limited) return limited;

  // One free website means one free project; more needs a subscription.
  if (!isAdminUser(user.id)) {
    const grant = await authorizeProject(supabase, user.id);
    if (!grant.ok) {
      return NextResponse.json({ error: grant.reason, message: grant.message }, { status: 402 });
    }
  }

  const body = await request.json().catch(() => ({}));
  const name = typeof body.name === "string" && body.name.trim() ? body.name.trim() : "Untitled project";
  const industry = typeof body.industry === "string" && body.industry.trim() ? body.industry.trim() : null;
  // Chosen up front in the new-production dialog, it shapes the whole build.
  const videoMode = body.videoMode === "scrub" ? "scrub" : "loop";

  const { data, error } = await supabase
    .from("projects")
    .insert({ user_id: user.id, name, industry, model: DEFAULT_MODEL, video_mode: videoMode })
    .select("id")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Every production starts with one empty hero slot to direct. Its id goes
  // back with the response so the create flow can shoot it without a round-trip.
  const { data: hero } = await supabase
    .from("project_videos")
    .insert({
      project_id: data.id,
      user_id: user.id,
      position: 0,
      label: "Hero video",
      mode: videoMode,
    })
    .select("id")
    .single();

  return NextResponse.json({ id: data.id, heroVideoId: hero?.id ?? null });
}
