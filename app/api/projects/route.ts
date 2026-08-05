import { NextResponse, type NextRequest } from "next/server";
import { createSupabaseServer } from "@/lib/supabase/server";
import { DEFAULT_MODEL } from "@/lib/pricing";

export async function POST(request: NextRequest) {
  const supabase = await createSupabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const body = await request.json().catch(() => ({}));
  const name = typeof body.name === "string" && body.name.trim() ? body.name.trim() : "Untitled project";
  const industry = typeof body.industry === "string" && body.industry.trim() ? body.industry.trim() : null;

  const { data, error } = await supabase
    .from("projects")
    .insert({ user_id: user.id, name, industry, model: DEFAULT_MODEL })
    .select("id")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ id: data.id });
}
