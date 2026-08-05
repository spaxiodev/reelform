import { NextResponse, type NextRequest } from "next/server";
import { createSupabaseServer } from "@/lib/supabase/server";
import { createZip } from "@/lib/zip";

// Packages a finished site as a self-contained zip: index.html plus the hero
// video, with the remote video URL rewritten to the local file. Downloading
// only the HTML left the hero pointing at a Supabase Storage URL.
export const runtime = "nodejs";
export const maxDuration = 120;

function slugify(name: string) {
  return name.trim().replace(/\s+/g, "-").replace(/[^a-zA-Z0-9._-]/g, "").toLowerCase() || "site";
}

export async function POST(request: NextRequest) {
  const supabase = await createSupabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const { projectId } = (await request.json()) as { projectId?: string };
  if (!projectId) return NextResponse.json({ error: "Missing project" }, { status: 400 });

  // RLS scopes this to the signed-in user's own projects.
  const { data: project } = await supabase
    .from("projects")
    .select("id, name, video_url, site_html")
    .eq("id", projectId)
    .single();
  if (!project?.site_html) {
    return NextResponse.json({ error: "Nothing to download yet" }, { status: 404 });
  }

  const slug = slugify(project.name ?? "site");
  let html = project.site_html;
  const files = [] as { name: string; data: Uint8Array }[];

  if (project.video_url) {
    const ext = (new URL(project.video_url).pathname.match(/\.(mp4|webm|mov|m4v)$/i)?.[1] ?? "mp4").toLowerCase();
    const localName = `video.${ext}`;
    try {
      const res = await fetch(project.video_url);
      if (!res.ok) throw new Error(`video fetch failed: ${res.status}`);
      files.push({ name: localName, data: new Uint8Array(await res.arrayBuffer()) });

      // The generator embeds the URL verbatim; it can also appear HTML-escaped
      // (&amp;) inside attributes, so swap both spellings.
      for (const variant of [project.video_url, project.video_url.replace(/&/g, "&amp;")]) {
        html = html.split(variant).join(localName);
      }
    } catch {
      return NextResponse.json(
        { error: "Could not fetch the hero video — try again in a moment." },
        { status: 502 }
      );
    }
  }

  files.unshift({ name: "index.html", data: new TextEncoder().encode(html) });
  const zip = createZip(files);

  return new NextResponse(new Uint8Array(zip), {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="${slug}.zip"`,
      "Content-Length": String(zip.length),
      "Cache-Control": "no-store",
    },
  });
}
