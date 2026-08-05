import { createSupabaseServer } from "@/lib/supabase/server";

// Serves a published site's full HTML. The CSP `sandbox` directive makes the
// browser treat the document as a unique origin, so user-generated markup can
// never read Reelform cookies or call our APIs as the visitor.
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = await createSupabaseServer();
  const { data: project } = await supabase
    .from("projects")
    .select("site_html, published")
    .eq("id", id)
    .eq("published", true)
    .single();

  if (!project?.site_html) {
    return new Response("This site is not published.", { status: 404 });
  }

  return new Response(project.site_html, {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Content-Security-Policy": "sandbox allow-scripts",
      "Cache-Control": "public, max-age=0, s-maxage=300",
    },
  });
}
