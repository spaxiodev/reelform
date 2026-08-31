import { NextResponse, type NextRequest } from "next/server";
import { createSupabaseServer } from "@/lib/supabase/server";
import { enforceRateLimit } from "@/lib/rate-limit";
import { suggestShot } from "@/lib/claude";

// Turns the user's website brief into a ready-to-use hero-video prompt.
// Free helper (tiny Haiku call): no credits are spent.
export const maxDuration = 60;

export async function POST(request: NextRequest) {
  const supabase = await createSupabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  // Bounds provider spend per account, credits cap total spend, not rate.
  const limited = await enforceRateLimit(user.id, "suggest_shot");
  if (limited) return limited;

  const body = await request.json().catch(() => ({}));
  const name = typeof body.name === "string" ? body.name.trim() : "";
  const industry = typeof body.industry === "string" ? body.industry.trim() : "";
  const siteBrief = typeof body.siteBrief === "string" ? body.siteBrief.trim() : "";
  // Which slot on the page this shot is for, e.g. "Hero video". It keeps the
  // suggestions for a project's several clips from all coming back the same.
  const role = typeof body.role === "string" ? body.role.trim().slice(0, 60) : "";

  if (!industry && !siteBrief) {
    return NextResponse.json(
      { error: "Add an industry or a short description first." },
      { status: 400 }
    );
  }

  try {
    const prompt = await suggestShot({ name, industry, siteBrief, role });
    if (!prompt) {
      return NextResponse.json({ error: "Could not suggest a shot. Try again." }, { status: 502 });
    }
    return NextResponse.json({ prompt });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Could not suggest a shot.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
