import { NextResponse, type NextRequest } from "next/server";
import { createSupabaseServer } from "@/lib/supabase/server";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { spendCredits, grantCredits } from "@/lib/credits";
import { isAdminUser } from "@/lib/admin";
import { generateSite, buildInitialBrief, buildEditBrief } from "@/lib/claude";
import { MODELS, type ModelId } from "@/lib/pricing";

// Streams the generated HTML as plain text. If something goes wrong after
// the stream has started, an error sentinel line is appended for the client.
export const maxDuration = 300;

// Kept in sync with components/Studio.tsx (route files may only export handlers).
const ERROR_SENTINEL = "\n<<<REELFORM_ERROR>>>";

interface Body {
  projectId: string;
  mode: "create" | "edit";
  model: ModelId;
  videoMode: "loop" | "scrub";
  // create
  name?: string;
  industry?: string;
  siteBrief?: string;
  // edit
  instruction?: string;
}

export async function POST(request: NextRequest) {
  const supabase = await createSupabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const body = (await request.json()) as Body;
  const model = MODELS[body.model] ? body.model : null;
  if (!model) return NextResponse.json({ error: "Unknown model" }, { status: 400 });
  const videoMode = body.videoMode === "scrub" ? "scrub" : "loop";

  const { data: project } = await supabase
    .from("projects")
    .select("id, name, industry, site_brief, video_brief, video_url, site_html")
    .eq("id", body.projectId)
    .single();
  if (!project) return NextResponse.json({ error: "Project not found" }, { status: 404 });
  if (!project.video_url) {
    return NextResponse.json({ error: "Generate and approve a video first" }, { status: 400 });
  }

  let brief: string;
  let userMessage: string;
  if (body.mode === "edit") {
    if (!body.instruction?.trim() || !project.site_html) {
      return NextResponse.json({ error: "Nothing to edit" }, { status: 400 });
    }
    userMessage = body.instruction.trim();
    brief = buildEditBrief({
      instruction: userMessage,
      currentHtml: project.site_html,
      videoUrl: project.video_url,
      videoMode,
    });
  } else {
    if (!body.siteBrief?.trim()) {
      return NextResponse.json({ error: "Describe the website first" }, { status: 400 });
    }
    userMessage = body.siteBrief.trim();
    brief = buildInitialBrief({
      name: body.name?.trim() || project.name,
      industry: body.industry?.trim() || "General",
      siteBrief: userMessage,
      videoBrief: project.video_brief ?? "",
      videoUrl: project.video_url,
      videoMode,
    });
  }

  const isAdmin = isAdminUser(user.id);
  const cost = isAdmin ? 0 : MODELS[model].credits;
  if (!isAdmin) {
    const ok = await spendCredits(user.id, cost, "site_generation", body.projectId);
    if (!ok) {
      return NextResponse.json({ error: "insufficient_credits", cost }, { status: 402 });
    }
  }

  const admin = createSupabaseAdmin();
  // Persist brief metadata up front so the project reflects the latest inputs.
  await admin
    .from("projects")
    .update({
      name: body.name?.trim() || project.name,
      industry: body.industry?.trim() || project.industry,
      site_brief: body.mode === "create" ? userMessage : project.site_brief,
      video_mode: videoMode,
      model,
      updated_at: new Date().toISOString(),
    })
    .eq("id", body.projectId);

  const encoder = new TextEncoder();

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        const result = await generateSite({
          model,
          brief,
          onText: (delta) => controller.enqueue(encoder.encode(delta)),
        });

        if (result.refused || !result.html.trim()) {
          if (!isAdmin) await grantCredits(user.id, cost, "refund", body.projectId);
          controller.enqueue(
            encoder.encode(`${ERROR_SENTINEL}The model declined this request. Credits were refunded — try rephrasing.`)
          );
          controller.close();
          return;
        }

        await admin
          .from("projects")
          .update({ site_html: result.html, updated_at: new Date().toISOString() })
          .eq("id", body.projectId);

        await admin.from("messages").insert([
          {
            project_id: body.projectId,
            user_id: user.id,
            role: "user",
            target: "claude",
            content: userMessage,
          },
          {
            project_id: body.projectId,
            user_id: user.id,
            role: "assistant",
            target: "claude",
            content: body.mode === "edit" ? "Updated the site." : "Built the first version of the site.",
          },
        ]);

        controller.close();
      } catch (err) {
        if (!isAdmin) await grantCredits(user.id, cost, "refund", body.projectId).catch(() => {});
        const message = err instanceof Error ? err.message : "Generation failed";
        controller.enqueue(encoder.encode(`${ERROR_SENTINEL}${message} — credits were refunded.`));
        controller.close();
      }
    },
  });

  return new NextResponse(stream, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Accel-Buffering": "no",
    },
  });
}
