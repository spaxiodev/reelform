import { NextResponse, type NextRequest } from "next/server";
import { createSupabaseServer } from "@/lib/supabase/server";
import { enforceRateLimit } from "@/lib/rate-limit";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { spendCredits, grantCredits } from "@/lib/credits";
import { isAdminUser } from "@/lib/admin";
import { authorizeSiteBuild } from "@/lib/entitlements";
import { editSite } from "@/lib/claude";
import {
  meteredCredits,
  estimateEditCredits,
  EDIT_MIN_CREDITS,
  resolveModel,
  type ModelId,
  type TokenUsage,
} from "@/lib/pricing";
import { listVideos, readyVideos } from "@/lib/videos";

// Agentic, Claude-Code-style edits. Streams newline-delimited JSON events:
//   {"type":"text","text":"..."}      Claude's narration, token by token
//   {"type":"step","label":"..."}      a tool action landed
//   {"type":"done","html":"...","credits":N,"summary":"..."}
//   {"type":"error","message":"..."}
// Billing is metered: a generous hold is reserved up front, then reconciled to
// the real token usage after the run (the unused portion is refunded).
export const runtime = "nodejs";
export const maxDuration = 180;

interface Body {
  projectId: string;
  model: ModelId;
  instruction: string;
}

export async function POST(request: NextRequest) {
  const supabase = await createSupabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  // Bounds provider spend per account, credits cap total spend, not rate.
  const limited = await enforceRateLimit(user.id, "site_edit");
  if (limited) return limited;

  const body = (await request.json()) as Body;
  // Retired ids resolve to their successor rather than erroring: a stale
  // client or an old project row should not fail a build.
  const model = resolveModel(body.model);
  if (!body.instruction?.trim()) {
    return NextResponse.json({ error: "Describe the change first" }, { status: 400 });
  }

  const { data: project } = await supabase
    .from("projects")
    .select("id, site_html")
    .eq("id", body.projectId)
    .single();
  if (!project) return NextResponse.json({ error: "Project not found" }, { status: 404 });
  if (!project.site_html) {
    return NextResponse.json({ error: "Build the site before editing it" }, { status: 400 });
  }

  const videos = readyVideos(await listVideos(supabase, project.id));
  if (videos.length === 0) {
    return NextResponse.json({ error: "This project has no video yet" }, { status: 400 });
  }

  // Prior turns of the site chat, so follow-ups resolve against what was just
  // discussed. Shot messages are a different thread, skip them.
  const { data: priorMessages } = await supabase
    .from("messages")
    .select("role, content")
    .eq("project_id", project.id)
    .eq("target", "claude")
    .order("created_at", { ascending: true })
    .limit(40);
  const history = (priorMessages ?? []).map((m) => ({
    role: m.role === "assistant" ? ("assistant" as const) : ("user" as const),
    content: m.content,
  }));

  const instruction = body.instruction.trim();
  const isAdmin = isAdminUser(user.id);
  // Editing a finished site is a subscriber feature; the free build is one shot.
  if (!isAdmin) {
    const grant = await authorizeSiteBuild(supabase, user.id, "edit");
    if (!grant.ok) {
      return NextResponse.json({ error: grant.reason, message: grant.message }, { status: 402 });
    }
  }
  const { hold, outputBudget } = estimateEditCredits(model, project.site_html.length);

  // Reserve the hold up front so we never run unpaid work.
  if (!isAdmin) {
    const ok = await spendCredits(user.id, hold, "site_edit", body.projectId);
    if (!ok) {
      return NextResponse.json({ error: "insufficient_credits", cost: hold }, { status: 402 });
    }
  }

  const admin = createSupabaseAdmin();
  const encoder = new TextEncoder();
  const send = (controller: ReadableStreamDefaultController<Uint8Array>, obj: unknown) =>
    controller.enqueue(encoder.encode(JSON.stringify(obj) + "\n"));

  // Return the full hold. Only for the hard-failure path, where the request
  // never reached the provider and so cost nothing.
  const refundHold = async () => {
    if (!isAdmin && hold > 0) await grantCredits(user.id, hold, "refund", body.projectId).catch(() => {});
  };

  /**
   * Settle the hold against what the turn really spent, and return the charge.
   *
   * An edit that refuses or changes nothing still ran at the provider and still
   * cost us input and output tokens. Refunding those in full made a
   * no-op instruction free to issue, and the rate limiter allows 120 an hour,
   * which on a large site is real money per account per hour. The user pays
   * only for what was used, which for a genuine no-op is the minimum charge.
   */
  const settleHold = async (usage: TokenUsage): Promise<number> => {
    if (isAdmin) return 0;
    const actual = Math.max(EDIT_MIN_CREDITS, meteredCredits(model, usage));
    if (actual < hold) {
      await grantCredits(user.id, hold - actual, "refund", body.projectId).catch(() => {});
    } else if (actual > hold) {
      await spendCredits(user.id, actual - hold, "site_edit", body.projectId).catch(() => {});
    }
    return actual;
  };

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        const result = await editSite({
          model,
          currentHtml: project.site_html!,
          instruction,
          videos,
          history,
          outputBudget,
          onText: (delta) => send(controller, { type: "text", text: delta }),
          onStep: (label) => send(controller, { type: "step", label }),
        });

        if (result.refused) {
          const spent = await settleHold(result.usage);
          send(controller, {
            type: "error",
            message: `The model declined this request. You were charged ${spent} credits for what it used, so try rephrasing.`,
          });
          controller.close();
          return;
        }

        if (!result.changed || !result.html.trim()) {
          const spent = await settleHold(result.usage);
          send(controller, {
            type: "error",
            message: `No change was made. You were charged ${spent} credits for the attempt, so try being more specific.`,
          });
          controller.close();
          return;
        }

        // Reconcile the hold against the real usage-based charge.
        const charged = await settleHold(result.usage);

        await admin
          .from("projects")
          .update({ site_html: result.html, updated_at: new Date().toISOString() })
          .eq("id", body.projectId);

        const summary = result.summary || "Applied your change.";
        await admin.from("messages").insert([
          { project_id: body.projectId, user_id: user.id, role: "user", target: "claude", content: instruction },
          { project_id: body.projectId, user_id: user.id, role: "assistant", target: "claude", content: summary },
        ]);

        send(controller, { type: "done", html: result.html, credits: charged, summary });
        controller.close();
      } catch (err) {
        await refundHold();
        const message = err instanceof Error ? err.message : "Edit failed";
        send(controller, { type: "error", message: `${message} Credits were refunded.` });
        controller.close();
      }
    },
  });

  return new NextResponse(stream, {
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Accel-Buffering": "no",
    },
  });
}
