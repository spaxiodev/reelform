import { NextResponse, type NextRequest } from "next/server";
import { createSupabaseServer } from "@/lib/supabase/server";
import { deleteIntegration, listIntegrationStatus, type Provider } from "@/lib/integrations";

// Connection status for the studio's deploy panel, and disconnecting.
export const runtime = "nodejs";

function isProvider(value: string | null): value is Provider {
  return value === "vercel" || value === "supabase";
}

export async function GET() {
  const supabase = await createSupabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  return NextResponse.json({ integrations: await listIntegrationStatus(user.id) });
}

export async function DELETE(request: NextRequest) {
  const supabase = await createSupabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const provider = new URL(request.url).searchParams.get("provider");
  if (!isProvider(provider)) {
    return NextResponse.json({ error: "Unknown provider" }, { status: 400 });
  }

  // Only our copy of the token goes away, sites already deployed keep
  // running, since they live in the user's own account.
  await deleteIntegration(user.id, provider);
  return NextResponse.json({ ok: true });
}
