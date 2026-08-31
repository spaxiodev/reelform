import { NextResponse, type NextRequest } from "next/server";
import { createSupabaseServer } from "@/lib/supabase/server";
import { enforceRateLimit } from "@/lib/rate-limit";
import {
  DeployError,
  deployProject,
  markProjectOffline,
  refreshDeploymentStatus,
  type SupabaseTargetInput,
} from "@/lib/deploy";

// Pushes a finished site live: Supabase for the backend, Vercel for hosting.
// Uploading a bundle with several videos takes a while, hence the long ceiling.
export const runtime = "nodejs";
export const maxDuration = 300;

interface Body {
  projectId?: string;
  vercel?: boolean;
  supabase?: SupabaseTargetInput | null;
}

export async function POST(request: NextRequest) {
  const supabase = await createSupabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const limited = await enforceRateLimit(user.id, "site_deploy");
  if (limited) return limited;

  const body = (await request.json()) as Body;
  if (!body.projectId) return NextResponse.json({ error: "Missing project" }, { status: 400 });
  if (!body.vercel && !body.supabase) {
    return NextResponse.json({ error: "Pick somewhere to deploy to" }, { status: 400 });
  }

  try {
    const result = await deployProject(user.id, {
      projectId: body.projectId,
      vercel: Boolean(body.vercel),
      supabase: body.supabase ?? null,
    });
    return NextResponse.json(result);
  } catch (err) {
    if (err instanceof DeployError) {
      return NextResponse.json({ error: err.message, code: err.code }, { status: err.status });
    }
    console.error("[deploy] failed", err);
    return NextResponse.json(
      { error: "The deploy failed. Try again, or check your provider dashboard." },
      { status: 502 }
    );
  }
}

/** Deploy history for a project, with the newest Vercel build re-checked. */
export async function GET(request: NextRequest) {
  const supabase = await createSupabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const projectId = new URL(request.url).searchParams.get("projectId");
  if (!projectId) return NextResponse.json({ error: "Missing project" }, { status: 400 });

  const latest = await refreshDeploymentStatus(user.id, projectId);

  // RLS keeps this to the caller's own rows.
  const { data: deployments } = await supabase
    .from("deployments")
    .select("id, provider, target, status, url, error, created_at")
    .eq("project_id", projectId)
    .order("created_at", { ascending: false })
    .limit(10);

  return NextResponse.json({ latest, deployments: deployments ?? [] });
}

/** Takes a site off the books, freeing a live-site slot under the plan cap. */
export async function DELETE(request: NextRequest) {
  const supabase = await createSupabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const projectId = new URL(request.url).searchParams.get("projectId");
  if (!projectId) return NextResponse.json({ error: "Missing project" }, { status: 400 });

  // The deployment itself lives in the user's own Vercel account, only they
  // can delete it there, so this just stops us counting it as live.
  await markProjectOffline(user.id, projectId);
  return NextResponse.json({ ok: true });
}
