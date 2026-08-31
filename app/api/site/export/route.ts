import { NextResponse, type NextRequest } from "next/server";
import { createSupabaseServer } from "@/lib/supabase/server";
import { enforceRateLimit } from "@/lib/rate-limit";
import { createZip } from "@/lib/zip";
import { BundleError, buildSiteBundle } from "@/lib/site-bundle";

// Packages a finished site as a self-contained zip: index.html plus every video
// it features, with the remote video URLs rewritten to the local files.
// Downloading only the HTML left the videos pointing at Supabase Storage URLs.
export const runtime = "nodejs";
export const maxDuration = 120;

export async function POST(request: NextRequest) {
  const supabase = await createSupabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  // Bounds provider spend per account — credits cap total spend, not rate.
  const limited = await enforceRateLimit(user.id, "site_export");
  if (limited) return limited;

  const { projectId } = (await request.json()) as { projectId?: string };
  if (!projectId) return NextResponse.json({ error: "Missing project" }, { status: 400 });

  // RLS scopes this to the signed-in user's own projects.
  const { data: project } = await supabase
    .from("projects")
    .select("id, name, site_html")
    .eq("id", projectId)
    .single();
  if (!project?.site_html) {
    return NextResponse.json({ error: "Nothing to download yet" }, { status: 404 });
  }

  let bundle;
  try {
    bundle = await buildSiteBundle(supabase, project);
  } catch (err) {
    if (err instanceof BundleError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    throw err;
  }

  const zip = createZip(bundle.files);

  return new NextResponse(new Uint8Array(zip), {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="${bundle.slug}.zip"`,
      "Content-Length": String(zip.length),
      "Cache-Control": "no-store",
    },
  });
}
