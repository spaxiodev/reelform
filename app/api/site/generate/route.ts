import { NextResponse, type NextRequest } from "next/server";
import { createSupabaseServer } from "@/lib/supabase/server";
import { enforceRateLimit } from "@/lib/rate-limit";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { spendCredits, grantCredits } from "@/lib/credits";
import { isAdminUser } from "@/lib/admin";
import { generateSite, buildInitialBrief, buildEditBrief } from "@/lib/claude";
import { MODELS, type ModelId } from "@/lib/pricing";
import { listVideos, readyVideos } from "@/lib/videos";
import { authorizeSiteBuild, releaseFree } from "@/lib/entitlements";

// Streams the generated HTML as plain text. If something goes wrong after
// the stream has started, an error sentinel line is appended for the client.
export const maxDuration = 300;

// Kept in sync with components/Studio.tsx (route files may only export handlers).
const ERROR_SENTINEL = "\n<<<REELFORM_ERROR>>>";

interface Body {
  projectId: string;
  mode: "create" | "edit";
  model: ModelId;
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

  // Bounds provider spend per account, credits cap total spend, not rate.
  const limited = await enforceRateLimit(user.id, "site_generate");
  if (limited) return limited;

  const body = (await request.json()) as Body;
  const model = MODELS[body.model] ? body.model : null;
  if (!model) return NextResponse.json({ error: "Unknown model" }, { status: 400 });

  const { data: project } = await supabase
    .from("projects")
    .select("id, name, industry, site_brief, site_html")
    .eq("id", body.projectId)
    .single();
  if (!project) return NextResponse.json({ error: "Project not found" }, { status: 404 });

  const videos = readyVideos(await listVideos(supabase, project.id));
  if (videos.length === 0) {
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
      videos,
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
      videos,
    });
  }

  // The free build covers one *create*; edits are subscribers-only.
  const isAdmin = isAdminUser(user.id);
  let freeBuild = false;
  let cost = 0;
  if (!isAdmin) {
    const grant = await authorizeSiteBuild(supabase, user.id, body.mode === "edit" ? "edit" : "create");
    if (!grant.ok) {
      return NextResponse.json({ error: grant.reason, message: grant.message }, { status: 402 });
    }
    freeBuild = grant.billing === "free";
    if (!freeBuild) {
      cost = MODELS[model].credits;
      const ok = await spendCredits(user.id, cost, "site_generation", body.projectId);
      if (!ok) {
        return NextResponse.json({ error: "insufficient_credits", cost }, { status: 402 });
      }
    }
  }

  // Undoes whichever form the charge took, for the two failure paths below.
  const refund = async () => {
    if (freeBuild) await releaseFree(user.id, "site");
    else if (!isAdmin) await grantCredits(user.id, cost, "refund", body.projectId);
  };

  const admin = createSupabaseAdmin();
  // Persist brief metadata up front so the project reflects the latest inputs.
  await admin
    .from("projects")
    .update({
      name: body.name?.trim() || project.name,
      industry: body.industry?.trim() || project.industry,
      site_brief: body.mode === "create" ? userMessage : project.site_brief,
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
          await refund();
          controller.enqueue(
            encoder.encode(`${ERROR_SENTINEL}The model declined this request. You have not been charged, so try rephrasing.`)
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
        await refund().catch(() => {});
        const message = err instanceof Error ? err.message : "Generation failed";
        controller.enqueue(encoder.encode(`${ERROR_SENTINEL}${message} You have not been charged.`));
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
