"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { createSupabaseBrowser } from "@/lib/supabase/client";
import { toast } from "@/components/ui/Toaster";
import { MODELS, videoCost, type ModelId, type Resolution, type Duration } from "@/lib/pricing";
import { SITE_TEMPLATES, VIDEO_TEMPLATES } from "@/lib/templates";

const ERROR_SENTINEL = "\n<<<REELFORM_ERROR>>>";

interface ProjectRow {
  id: string;
  name: string;
  industry: string | null;
  site_brief: string | null;
  video_brief: string | null;
  video_mode: "loop" | "scrub";
  video_status: string;
  video_url: string | null;
  video_settings: { resolution?: Resolution; duration?: Duration; ratio?: string } | null;
  site_html: string | null;
  model: string;
  published: boolean;
}

interface MessageRow {
  role: string;
  target: string;
  content: string;
  created_at: string;
}

type Ratio = "16:9" | "9:16" | "1:1" | "21:9";

function stripFences(text: string): string {
  const trimmed = text.trim();
  const match = trimmed.match(/^```(?:html)?\s*([\s\S]*?)\s*```$/);
  return match ? match[1] : trimmed;
}

const chipCls =
  "rounded-full border border-line-strong px-3 py-1.5 text-xs font-medium text-muted hover:border-primary hover:text-primary transition-colors cursor-pointer";

export function Studio({
  project,
  initialCredits,
  initialMessages,
  isAdmin = false,
}: {
  project: ProjectRow;
  initialCredits: number;
  initialMessages: MessageRow[];
  isAdmin?: boolean;
}) {
  // Brief
  const [name, setName] = useState(project.name);
  const [industry, setIndustry] = useState(project.industry ?? "");
  const [siteBrief, setSiteBrief] = useState(project.site_brief ?? "");

  // Video
  const [videoPrompt, setVideoPrompt] = useState(project.video_brief ?? "");
  const [resolution, setResolution] = useState<Resolution>(
    project.video_settings?.resolution ?? "720p"
  );
  const [duration, setDuration] = useState<Duration>(project.video_settings?.duration ?? 5);
  const [ratio, setRatio] = useState<Ratio>((project.video_settings?.ratio as Ratio) ?? "16:9");
  const [videoStatus, setVideoStatus] = useState(project.video_status);
  const [videoUrl, setVideoUrl] = useState(project.video_url);

  // Build
  const [videoMode, setVideoMode] = useState<"loop" | "scrub">(project.video_mode);
  const [model, setModel] = useState<ModelId>(
    (project.model as ModelId) in MODELS ? (project.model as ModelId) : "claude-opus-4-8"
  );
  const [siteHtml, setSiteHtml] = useState(project.site_html);
  const [instruction, setInstruction] = useState("");
  const [published, setPublished] = useState(project.published);
  const [publishing, setPublishing] = useState(false);
  const [downloading, setDownloading] = useState(false);

  // UI
  const [credits, setCredits] = useState(initialCredits);
  const [messages, setMessages] = useState(initialMessages);
  const [busyVideo, setBusyVideo] = useState(false);
  const [suggestingShot, setSuggestingShot] = useState(false);
  const [showVideoAdvanced, setShowVideoAdvanced] = useState(false);
  const [showBuildAdvanced, setShowBuildAdvanced] = useState(false);
  const [building, setBuilding] = useState(false);
  const [streamedChars, setStreamedChars] = useState(0);
  const [streamTail, setStreamTail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [previewVersion, setPreviewVersion] = useState(0);

  // Agentic editing ("like Claude Code"): live narration + metered cost.
  const [editing, setEditing] = useState(false);
  const [editTranscript, setEditTranscript] = useState("");
  const [lastEditCost, setLastEditCost] = useState<number | null>(null);
  const editScrollRef = useRef<HTMLDivElement>(null);

  // Wizard: one step owns the whole screen at a time.
  const [step, setStep] = useState<1 | 2 | 3>(
    project.site_html ? 3 : project.video_url ? 2 : 1
  );
  const [reshooting, setReshooting] = useState(false); // show shot controls again over ready footage
  const [showChanges, setShowChanges] = useState(false); // "ask Claude for changes" panel over the preview
  const [showLog, setShowLog] = useState(false); // collapsed project history on step 1

  const streamRef = useRef("");

  const refreshCredits = useCallback(async () => {
    const supabase = createSupabaseBrowser();
    const { data } = await supabase.from("profiles").select("credits").single();
    if (data) setCredits(data.credits);
  }, []);

  // ── Video polling ──────────────────────────────────────────────────
  useEffect(() => {
    if (videoStatus !== "queued" && videoStatus !== "running") return;
    const timer = setInterval(async () => {
      try {
        const res = await fetch(`/api/video/status?projectId=${project.id}`);
        const data = await res.json();
        if (data.status === "succeeded") {
          setVideoStatus("succeeded");
          setVideoUrl(data.videoUrl);
          setReshooting(false); // show the fresh footage, not the shot controls
          toast("Footage is ready — review it in the preview.", "success");
          clearInterval(timer);
        } else if (data.status === "failed") {
          setVideoStatus("failed");
          setError(data.error ?? "Video generation failed — credits refunded.");
          refreshCredits();
          clearInterval(timer);
        } else if (data.status) {
          setVideoStatus(data.status);
        }
      } catch {
        // transient network error — keep polling
      }
    }, 10000); // seedance2.ai asks for <=1 poll per 10s
    return () => clearInterval(timer);
  }, [videoStatus, project.id, refreshCredits]);

  // ── Actions ────────────────────────────────────────────────────────
  const vCost = videoCost(resolution, duration);

  async function generateVideo() {
    if (!videoPrompt.trim()) {
      setError("Describe the video first — or start from a shot style below.");
      return;
    }
    setError(null);
    setBusyVideo(true);
    try {
      const res = await fetch("/api/video/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId: project.id,
          prompt: videoPrompt,
          resolution,
          duration,
          ratio,
        }),
      });
      const data = await res.json();
      if (res.status === 402) {
        setError(`Not enough credits (${data.cost} needed). Top up on the pricing page.`);
      } else if (!res.ok) {
        setError(data.error ?? "Video generation failed.");
      } else {
        setVideoStatus("queued");
        setVideoUrl(null);
        setMessages((m) => [
          ...m,
          { role: "user", target: "seedance", content: videoPrompt, created_at: new Date().toISOString() },
        ]);
      }
    } finally {
      setBusyVideo(false);
      refreshCredits();
    }
  }

  async function suggestShot() {
    if (!industry.trim() && !siteBrief.trim()) {
      setError("Fill in the brief above first — then I'll suggest a shot.");
      return;
    }
    setError(null);
    setSuggestingShot(true);
    try {
      const res = await fetch("/api/site/suggest-shot", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, industry, siteBrief }),
      });
      const data = await res.json();
      if (!res.ok || !data.prompt) {
        setError(data.error ?? "Could not suggest a shot — try again.");
        return;
      }
      setVideoPrompt(data.prompt);
      toast("Shot suggested — tweak it or generate as-is.", "success");
    } catch {
      setError("Could not suggest a shot — check your connection and try again.");
    } finally {
      setSuggestingShot(false);
    }
  }

  async function runClaude(mode: "create" | "edit") {
    setError(null);
    setBuilding(true);
    setStreamedChars(0);
    setStreamTail("");
    streamRef.current = "";

    const userMessage = mode === "edit" ? instruction.trim() : siteBrief.trim();

    try {
      const res = await fetch("/api/site/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId: project.id,
          mode,
          model,
          videoMode,
          name,
          industry,
          siteBrief,
          instruction: mode === "edit" ? userMessage : undefined,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        setError(
          res.status === 402
            ? `Not enough credits (${data.cost} needed). Top up on the pricing page.`
            : data.error ?? "Generation failed."
        );
        return;
      }

      const reader = res.body!.getReader();
      const decoder = new TextDecoder();
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        streamRef.current += decoder.decode(value, { stream: true });
        setStreamedChars(streamRef.current.length);
        setStreamTail(streamRef.current.slice(-600));
      }

      const full = streamRef.current;
      const sentinelAt = full.indexOf(ERROR_SENTINEL);
      if (sentinelAt !== -1) {
        setError(full.slice(sentinelAt + ERROR_SENTINEL.length));
        return;
      }

      const html = stripFences(full);
      setSiteHtml(html);
      toast(mode === "edit" ? "Site updated." : "First cut is live in the preview.", "success");
      setPreviewVersion((v) => v + 1);
      setInstruction("");
      setMessages((m) => [
        ...m,
        { role: "user", target: "claude", content: userMessage, created_at: new Date().toISOString() },
        {
          role: "assistant",
          target: "claude",
          content: mode === "edit" ? "Updated the site." : "Built the first version of the site.",
          created_at: new Date().toISOString(),
        },
      ]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Generation failed.");
    } finally {
      setBuilding(false);
      refreshCredits();
    }
  }

  // Claude-Code-style edit: streams narration live and charges by real usage.
  async function runEdit() {
    const change = instruction.trim();
    if (!change || editing) return;
    setError(null);
    setEditing(true);
    setLastEditCost(null);
    setEditTranscript("");

    try {
      const res = await fetch("/api/site/edit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId: project.id, model, instruction: change }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(
          res.status === 402
            ? `Not enough credits (~${data.cost} needed to start). Top up on the pricing page.`
            : data.error ?? "Edit failed."
        );
        return;
      }

      const reader = res.body!.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let done = false;

      for (;;) {
        const { done: streamDone, value } = await reader.read();
        if (streamDone) break;
        buffer += decoder.decode(value, { stream: true });

        // Newline-delimited JSON events.
        let nl: number;
        while ((nl = buffer.indexOf("\n")) !== -1) {
          const line = buffer.slice(0, nl).trim();
          buffer = buffer.slice(nl + 1);
          if (!line) continue;
          let evt: { type: string; text?: string; label?: string; html?: string; credits?: number; summary?: string; message?: string };
          try {
            evt = JSON.parse(line);
          } catch {
            continue;
          }
          if (evt.type === "text" && evt.text) {
            setEditTranscript((t) => t + evt.text);
            requestAnimationFrame(() => {
              editScrollRef.current?.scrollTo({ top: editScrollRef.current.scrollHeight });
            });
          } else if (evt.type === "step" && evt.label) {
            setEditTranscript((t) => t + `\n· ${evt.label}\n`);
          } else if (evt.type === "error") {
            setError(evt.message ?? "Edit failed.");
          } else if (evt.type === "done") {
            done = true;
            if (evt.html) {
              setSiteHtml(evt.html);
              setPreviewVersion((v) => v + 1);
            }
            if (typeof evt.credits === "number") setLastEditCost(evt.credits);
            setInstruction("");
            setMessages((m) => [
              ...m,
              { role: "user", target: "claude", content: change, created_at: new Date().toISOString() },
              {
                role: "assistant",
                target: "claude",
                content: evt.summary ?? "Applied your change.",
                created_at: new Date().toISOString(),
              },
            ]);
            toast(
              isAdmin ? "Change applied." : `Change applied · ${evt.credits} credits.`,
              "success"
            );
          }
        }
      }

      if (!done && !editTranscript) setError("The edit ended unexpectedly — please try again.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Edit failed.");
    } finally {
      setEditing(false);
      refreshCredits();
    }
  }

  async function togglePublish() {
    if (!siteHtml || publishing) return;
    setPublishing(true);
    const next = !published;
    try {
      const supabase = createSupabaseBrowser();
      const { error } = await supabase
        .from("projects")
        .update({ published: next, published_at: next ? new Date().toISOString() : null })
        .eq("id", project.id);
      if (error) {
        toast("Could not update the showcase status — try again.", "error");
        return;
      }
      setPublished(next);
      toast(
        next
          ? "Published — your site is now featured in the showcase."
          : "Removed from the showcase.",
        "success"
      );
    } finally {
      setPublishing(false);
    }
  }

  async function downloadHtml() {
    if (!siteHtml || downloading) return;
    setDownloading(true);
    toast("Packaging your site and video…", "info");
    try {
      const res = await fetch("/api/site/export", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId: project.id }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        toast(data?.error ?? "Could not package the download — try again.", "error");
        return;
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${name.replace(/\s+/g, "-").toLowerCase() || "site"}.zip`;
      a.click();
      URL.revokeObjectURL(url);
      toast("Downloaded — unzip and host the folder anywhere.", "success");
    } catch {
      toast("Could not package the download — try again.", "error");
    } finally {
      setDownloading(false);
    }
  }

  function openInNewTab() {
    if (!siteHtml) return;
    const blob = new Blob([siteHtml], { type: "text/html" });
    window.open(URL.createObjectURL(blob), "_blank");
  }

  function applySiteTemplate(id: string) {
    const t = SITE_TEMPLATES.find((x) => x.id === id);
    if (!t) return;
    setIndustry(t.industry);
    setSiteBrief(t.brief);
    toast("Template loaded — replace the [bracketed] parts with your details.", "info");
  }

  function applyVideoTemplate(id: string) {
    const t = VIDEO_TEMPLATES.find((x) => x.id === id);
    if (!t) return;
    setVideoPrompt(t.prompt);
    toast("Shot style loaded — replace the [bracketed] part with your subject.", "info");
  }

  const videoBusy = videoStatus === "queued" || videoStatus === "running";
  const claudeCost = MODELS[model].credits;

  // Admins never spend credits — show "Free" wherever a cost would appear.
  const costLabel = (n: number) => (isAdmin ? "Free" : `${n} credits`);

  const steps = [
    { n: 1 as const, label: "Brief", done: siteBrief.trim().length > 0 },
    { n: 2 as const, label: "Video", done: Boolean(videoUrl) },
    { n: 3 as const, label: "Build", done: Boolean(siteHtml) },
  ];

  function goStep(n: 1 | 2 | 3) {
    setError(null);
    setReshooting(false);
    setShowChanges(false);
    setStep(n);
  }

  // ── Render ─────────────────────────────────────────────────────────
  return (
    <div className="h-screen flex flex-col overflow-hidden">
      {/* ── Top bar: identity + credits + (once built) export actions ── */}
      <header className="flex items-center justify-between px-6 py-3.5 border-b border-line shrink-0 bg-bg">
        <div className="flex items-center gap-4 min-w-0">
          <Link href="/dashboard" className="mono-label hover:!text-ink transition-colors shrink-0">
            ← DASHBOARD
          </Link>
          <span className="text-line-strong">/</span>
          <span className="font-medium truncate">{name}</span>
        </div>
        <div className="flex items-center gap-3 shrink-0">
          {isAdmin ? (
            <span className="mono-label !text-primary mr-2">ADMIN · UNLIMITED</span>
          ) : (
            <>
              <span className="mono-label !text-primary mr-2">{credits.toLocaleString()} CREDITS</span>
              <Link href="/pricing" className="btn-ghost !py-2 !px-3.5 !text-xs">
                Top up
              </Link>
            </>
          )}
          {siteHtml && (
            <>
              <button
                onClick={togglePublish}
                disabled={publishing}
                title={
                  published
                    ? "Your site is live in the public showcase — click to remove it"
                    : "Feature your site in the public Reelform showcase"
                }
                className={`!py-2 !px-3.5 !text-xs ${published ? "btn-primary" : "btn-ghost"}`}
              >
                {publishing ? "…" : published ? "★ Featured" : "☆ Get featured"}
              </button>
              <button
                onClick={downloadHtml}
                disabled={downloading}
                className="btn-primary !py-2 !px-4 !text-xs"
              >
                {downloading ? "Packaging…" : "⬇ Download site"}
              </button>
            </>
          )}
        </div>
      </header>

      {/* ── Stepper: full width, click to jump between steps ─────────── */}
      <nav className="flex items-center justify-center gap-3 sm:gap-6 px-6 py-3 border-b border-line shrink-0 bg-bg">
        {steps.map((s, i) => {
          const active = step === s.n;
          return (
            <div key={s.n} className="flex items-center gap-3 sm:gap-6">
              <button
                onClick={() => goStep(s.n)}
                className="flex items-center gap-2 group"
                aria-current={active ? "step" : undefined}
              >
                <span
                  className={`w-7 h-7 rounded-full text-xs font-bold flex items-center justify-center transition-colors ${
                    s.done
                      ? "bg-primary text-white"
                      : active
                      ? "bg-bg text-primary border-2 border-primary"
                      : "bg-bg-raise text-faint border border-line-strong group-hover:border-primary"
                  }`}
                >
                  {s.done ? "✓" : s.n}
                </span>
                <span
                  className={`text-xs font-bold uppercase tracking-wider transition-colors ${
                    active ? "text-ink" : s.done ? "text-muted" : "text-faint group-hover:text-muted"
                  }`}
                >
                  {s.label}
                </span>
              </button>
              {i < steps.length - 1 && <span className="w-8 sm:w-14 h-px bg-line-strong" aria-hidden />}
            </div>
          );
        })}
      </nav>

      {/* ── Body: one step owns the whole area ───────────────────────── */}
      <div className="flex-1 min-h-0 flex flex-col bg-bg-raise">
        {error && (
          <div className="mx-auto mt-4 w-full max-w-2xl px-6 shrink-0">
            <div className="p-3 border border-danger/40 bg-danger/5 text-danger text-sm rounded-lg">
              {error}
            </div>
          </div>
        )}

        {/* ══ STEP 1 · BRIEF ══ */}
        {step === 1 && (
          <div className="flex-1 min-h-0 overflow-y-auto">
            <div className="mx-auto w-full max-w-2xl px-6 py-10">
              <p className="mono-label !text-primary">STEP 1 · THE BRIEF</p>
              <h1 className="mt-2 text-3xl font-bold tracking-tight">What are we building?</h1>
              <p className="mt-2 text-muted">
                A sentence or two is enough to start. The more specific you are, the better the result.
              </p>

              <div className="mt-8">
                <p className="mono-label mb-2">START FROM A TEMPLATE</p>
                <div className="flex flex-wrap gap-1.5">
                  {SITE_TEMPLATES.map((t) => (
                    <button key={t.id} className={chipCls} onClick={() => applySiteTemplate(t.id)}>
                      {t.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="mt-6 space-y-4">
                <div>
                  <label className="mono-label block mb-1.5">PROJECT NAME</label>
                  <input className="field" value={name} onChange={(e) => setName(e.target.value)} />
                </div>
                <div>
                  <label className="mono-label block mb-1.5">INDUSTRY</label>
                  <input
                    className="field"
                    placeholder="e.g. Specialty coffee roastery"
                    value={industry}
                    onChange={(e) => setIndustry(e.target.value)}
                  />
                </div>
                <div>
                  <label className="mono-label block mb-1.5">DESCRIBE THE WEBSITE</label>
                  <textarea
                    className="field min-h-[160px] resize-y"
                    placeholder="Who is it for, what should it say, what sections do you want, what's the vibe…"
                    value={siteBrief}
                    onChange={(e) => setSiteBrief(e.target.value)}
                  />
                </div>
              </div>

              <div className="mt-8 flex justify-end">
                <button
                  onClick={() => goStep(2)}
                  disabled={!siteBrief.trim()}
                  className="btn-primary !py-3 !px-6"
                >
                  Next: create your hero video →
                </button>
              </div>

              {messages.length > 0 && (
                <div className="mt-10 border-t border-line pt-4">
                  <button
                    type="button"
                    onClick={() => setShowLog((v) => !v)}
                    className="flex items-center gap-2"
                  >
                    <span className="mono-label">PROJECT HISTORY · {messages.length}</span>
                    <span className="text-faint text-xs">{showLog ? "▲" : "▾"}</span>
                  </button>
                  {showLog && (
                    <ul className="mt-3 space-y-2.5">
                      {messages.map((m, i) => (
                        <li key={i} className="text-xs leading-relaxed">
                          <span
                            className={`font-bold ${
                              m.target === "seedance" ? "text-coral" : "text-primary"
                            }`}
                          >
                            {m.target === "seedance"
                              ? "SEEDANCE"
                              : m.role === "user"
                              ? "YOU → CLAUDE"
                              : "CLAUDE"}
                          </span>{" "}
                          <span className="text-muted">{m.content.slice(0, 160)}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )}
            </div>
          </div>
        )}

        {/* ══ STEP 2 · VIDEO ══ */}
        {step === 2 && (
          <div className="flex-1 min-h-0 flex flex-col">
            {videoBusy ? (
              // Rendering — full screen
              <div className="flex-1 flex flex-col">
                <div className="stream-bar" />
                <div className="flex-1 flex flex-col items-center justify-center p-10 gap-4 text-center">
                  <p className="mono-label flex items-center gap-2">
                    <span className="rec-dot" /> RENDERING YOUR FOOTAGE
                  </p>
                  <p className="text-2xl font-bold">Rolling camera…</p>
                  <p className="text-muted max-w-sm">
                    This usually takes under two minutes. You can stay right here — it&apos;ll appear
                    the moment it&apos;s ready.
                  </p>
                </div>
              </div>
            ) : videoUrl && !reshooting ? (
              // Footage ready — big, front and centre
              <div className="flex-1 min-h-0 flex flex-col p-6 gap-5">
                <div className="text-center shrink-0">
                  <p className="mono-label !text-primary">STEP 2 · YOUR HERO VIDEO</p>
                  <h1 className="mt-1 text-2xl font-bold">Here&apos;s your footage — happy with it?</h1>
                </div>
                <div className="flex-1 min-h-0 flex items-center justify-center">
                  <video
                    src={videoUrl}
                    controls
                    autoPlay
                    muted
                    loop
                    playsInline
                    className="max-h-full max-w-full rounded-2xl border border-line shadow-[0_8px_24px_rgba(26,26,26,0.12)]"
                  />
                </div>
                <div className="shrink-0 flex items-center justify-center gap-3">
                  <button
                    onClick={() => {
                      setError(null);
                      setReshooting(true);
                    }}
                    className="btn-ghost !py-3 !px-5"
                  >
                    ↺ Reshoot / adjust the shot
                  </button>
                  <button onClick={() => goStep(3)} className="btn-primary !py-3 !px-6">
                    Build my website →
                  </button>
                </div>
              </div>
            ) : (
              // Shot controls — describe / suggest / generate
              <div className="flex-1 min-h-0 overflow-y-auto">
                <div className="mx-auto w-full max-w-2xl px-6 py-10">
                  {reshooting && videoUrl && (
                    <button
                      onClick={() => setReshooting(false)}
                      className="mono-label hover:!text-ink transition-colors mb-4"
                    >
                      ← Back to current footage
                    </button>
                  )}
                  <p className="mono-label !text-primary">STEP 2 · THE HERO VIDEO</p>
                  <h1 className="mt-2 text-3xl font-bold tracking-tight">Direct the opening shot</h1>
                  <p className="mt-2 text-muted">
                    This is the video that opens your site. You&apos;ll preview it before building
                    anything — reshoot as often as you like.
                  </p>

                  <div className="mt-8">
                    <p className="mono-label mb-2">START FROM A SHOT STYLE</p>
                    <div className="flex flex-wrap gap-1.5">
                      {VIDEO_TEMPLATES.map((t) => (
                        <button
                          key={t.id}
                          className={chipCls}
                          title={t.hint}
                          onClick={() => applyVideoTemplate(t.id)}
                        >
                          {t.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="mt-6 space-y-3">
                    <textarea
                      className="field min-h-[130px] resize-y"
                      placeholder="Describe the shot: subject, camera movement, lighting, mood… — or let us suggest one from your brief."
                      value={videoPrompt}
                      onChange={(e) => setVideoPrompt(e.target.value)}
                    />
                    <button
                      onClick={suggestShot}
                      disabled={suggestingShot || building}
                      className="btn-ghost w-full !text-xs"
                    >
                      {suggestingShot ? "Thinking up a shot…" : "✨ Suggest a shot from my brief · free"}
                    </button>

                    <div className="rounded-lg border border-line">
                      <button
                        type="button"
                        onClick={() => setShowVideoAdvanced((v) => !v)}
                        className="w-full flex items-center justify-between px-3 py-2 text-left"
                      >
                        <span className="mono-label">
                          ADVANCED · {resolution} · {duration}s · {ratio}
                        </span>
                        <span className="text-faint text-xs">{showVideoAdvanced ? "▲" : "▾"}</span>
                      </button>
                      {showVideoAdvanced && (
                        <div className="grid grid-cols-3 gap-2 px-3 pb-3">
                          <div>
                            <label className="mono-label block mb-1.5">QUALITY</label>
                            <select
                              className="field"
                              value={resolution}
                              onChange={(e) => setResolution(e.target.value as Resolution)}
                            >
                              <option value="720p">720p</option>
                              <option value="1080p">1080p</option>
                            </select>
                          </div>
                          <div>
                            <label className="mono-label block mb-1.5">LENGTH</label>
                            <select
                              className="field"
                              value={duration}
                              onChange={(e) => setDuration(Number(e.target.value) as Duration)}
                            >
                              <option value={5}>5 sec</option>
                              <option value={10}>10 sec</option>
                            </select>
                          </div>
                          <div>
                            <label className="mono-label block mb-1.5">SHAPE</label>
                            <select
                              className="field"
                              value={ratio}
                              onChange={(e) => setRatio(e.target.value as Ratio)}
                            >
                              <option value="16:9">Wide 16:9</option>
                              <option value="21:9">Cinema 21:9</option>
                              <option value="1:1">Square 1:1</option>
                              <option value="9:16">Tall 9:16</option>
                            </select>
                          </div>
                        </div>
                      )}
                    </div>

                    <button
                      onClick={generateVideo}
                      disabled={busyVideo || videoBusy || building}
                      className="btn-primary w-full !py-3.5"
                    >
                      {videoUrl
                        ? `Reshoot video · ${costLabel(vCost)}`
                        : `Generate video · ${costLabel(vCost)}`}
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ══ STEP 3 · BUILD ══ */}
        {step === 3 && (
          <div className="flex-1 min-h-0 flex flex-col">
            {building ? (
              // Streaming — full screen
              <div className="flex-1 flex flex-col">
                <div className="stream-bar" />
                <div className="flex-1 flex flex-col items-center justify-center p-10 gap-6">
                  <p className="mono-label flex items-center gap-2">
                    <span className="rec-dot" /> CLAUDE IS WRITING YOUR SITE —{" "}
                    {streamedChars.toLocaleString()} CHARACTERS
                  </p>
                  <pre className="w-full max-w-2xl h-64 overflow-hidden card !rounded-lg p-4 text-[11px] leading-relaxed text-faint whitespace-pre-wrap">
                    {streamTail || "…"}
                  </pre>
                </div>
              </div>
            ) : siteHtml ? (
              // Site ready — full-screen browser preview
              <>
                <div className="flex items-center justify-between px-5 py-2.5 border-b border-line bg-bg shrink-0">
                  <p className="mono-label flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-primary" aria-hidden /> LIVE PREVIEW
                  </p>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setShowChanges((v) => !v)}
                      className="btn-ghost !py-1.5 !px-3 !text-xs"
                    >
                      {showChanges ? "Close changes" : "✎ Ask for changes"}
                    </button>
                    <button onClick={openInNewTab} className="btn-ghost !py-1.5 !px-3 !text-xs">
                      Open in new tab ↗
                    </button>
                    <button
                      onClick={downloadHtml}
                      disabled={downloading}
                      className="btn-primary !py-1.5 !px-3.5 !text-xs"
                    >
                      {downloading ? "Packaging…" : "⬇ Download site"}
                    </button>
                  </div>
                </div>
                <iframe
                  key={previewVersion}
                  srcDoc={siteHtml}
                  title="Site preview"
                  className="flex-1 w-full bg-white min-h-0"
                  sandbox="allow-scripts allow-same-origin"
                />
                {showChanges && (
                  <div className="border-t border-line bg-bg p-4 shrink-0">
                    <div className="mx-auto w-full max-w-3xl space-y-2">
                      {/* Live narration — Claude working like Claude Code */}
                      {(editing || editTranscript) && (
                        <div
                          ref={editScrollRef}
                          className="max-h-40 overflow-y-auto rounded-lg border border-line bg-bg-raise p-3 text-[12px] leading-relaxed text-muted whitespace-pre-wrap"
                        >
                          {editTranscript || "…"}
                          {editing && <span className="rec-dot ml-1 inline-block align-middle" />}
                        </div>
                      )}
                      <div className="flex flex-col sm:flex-row gap-2">
                        <textarea
                          className="field flex-1 min-h-[52px] resize-y"
                          placeholder="e.g. 'Make the palette darker and add a testimonials section', 'Fix the button contrast on mobile', or after a reshoot: 'Swap in the new video'"
                          value={instruction}
                          onChange={(e) => setInstruction(e.target.value)}
                          disabled={editing}
                          onKeyDown={(e) => {
                            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) runEdit();
                          }}
                        />
                        <div className="flex sm:flex-col gap-2 shrink-0">
                          <button
                            onClick={runEdit}
                            disabled={editing || building || !instruction.trim()}
                            className="btn-primary flex-1 !text-xs whitespace-nowrap"
                          >
                            {editing ? "Working…" : "Send change"}
                          </button>
                          <button
                            onClick={() => runClaude("create")}
                            disabled={editing || building || !siteBrief.trim()}
                            className="btn-ghost flex-1 !text-xs whitespace-nowrap"
                          >
                            Start over
                          </button>
                        </div>
                      </div>
                      <p className="text-[11px] text-faint">
                        {isAdmin
                          ? "Edits run free for admins."
                          : lastEditCost !== null
                          ? `Last change cost ${lastEditCost} credits. Edits are billed by usage — small tweaks cost little, big redesigns cost more.`
                          : "Edits are billed by usage — small tweaks cost little, big redesigns cost more. ⌘/Ctrl+Enter to send."}
                      </p>
                    </div>
                  </div>
                )}
              </>
            ) : !videoUrl ? (
              // Guard — need footage first
              <div className="flex-1 flex flex-col items-center justify-center p-10 text-center gap-5">
                <p className="text-6xl" aria-hidden>
                  🎬
                </p>
                <p className="text-2xl font-bold">Create your hero video first</p>
                <p className="text-muted max-w-sm">
                  Claude builds the whole site around your approved footage — so let&apos;s shoot that
                  first.
                </p>
                <button onClick={() => goStep(2)} className="btn-primary !py-3 !px-6">
                  ← Back to the video
                </button>
              </div>
            ) : (
              // Ready to build
              <div className="flex-1 min-h-0 overflow-y-auto">
                <div className="mx-auto w-full max-w-2xl px-6 py-10">
                  <p className="mono-label !text-primary">STEP 3 · BUILD THE WEBSITE</p>
                  <h1 className="mt-2 text-3xl font-bold tracking-tight">Build your website</h1>
                  <p className="mt-2 text-muted">
                    Claude writes the whole site around your approved footage and streams it live.
                    You can ask for changes afterwards.
                  </p>

                  <div className="mt-8">
                    <label className="mono-label block mb-2">HOW SHOULD THE VIDEO PLAY?</label>
                    <div className="grid grid-cols-2 gap-2">
                      {(
                        [
                          { id: "loop", title: "Ambient loop", desc: "Plays continuously behind the hero" },
                          { id: "scrub", title: "Scroll scrub", desc: "Plays forward as visitors scroll" },
                        ] as const
                      ).map((m) => (
                        <button
                          key={m.id}
                          onClick={() => setVideoMode(m.id)}
                          className={`text-left rounded-lg border p-3 transition-colors ${
                            videoMode === m.id
                              ? "border-primary bg-primary-soft/40"
                              : "border-line-strong hover:border-primary"
                          }`}
                        >
                          <p
                            className={`text-sm font-bold ${
                              videoMode === m.id ? "text-primary-deep" : "text-ink"
                            }`}
                          >
                            {m.title}
                          </p>
                          <p className="mt-0.5 text-xs text-muted leading-snug">{m.desc}</p>
                        </button>
                      ))}
                    </div>
                    <p className="mt-2 text-xs text-muted leading-relaxed">
                      {videoMode === "scrub" ? (
                        <>
                          <span className="font-bold text-ink">Scrubbing</span> means your scroll wheel
                          becomes the play button: scroll down and the video moves forward frame by
                          frame, scroll back up and it rewinds. It stops wherever you stop — like
                          dragging the slider on a video player. Great for reveals and product shots.
                        </>
                      ) : (
                        <>
                          <span className="font-bold text-ink">Ambient loop</span> just plays on repeat
                          on its own, like a moving background. Prefer{" "}
                          <button
                            type="button"
                            onClick={() => setVideoMode("scrub")}
                            className="underline text-primary-deep"
                          >
                            scroll scrub
                          </button>{" "}
                          if you want the visitor&apos;s scrolling to drive the video forward and
                          backward, like dragging the slider on a video player.
                        </>
                      )}
                    </p>
                  </div>

                  <div className="mt-6 rounded-lg border border-line">
                    <button
                      type="button"
                      onClick={() => setShowBuildAdvanced((v) => !v)}
                      className="w-full flex items-center justify-between px-3 py-2.5 text-left"
                    >
                      <span className="mono-label">ADVANCED · {MODELS[model].label}</span>
                      <span className="text-faint text-xs">{showBuildAdvanced ? "▲" : "▾"}</span>
                    </button>
                    {showBuildAdvanced && (
                      <div className="px-3 pb-3 space-y-4">
                        <div>
                          <label className="mono-label block mb-1.5">WHO WRITES YOUR SITE?</label>
                          <select
                            className="field"
                            value={model}
                            onChange={(e) => setModel(e.target.value as ModelId)}
                          >
                            {(Object.keys(MODELS) as ModelId[]).map((id) => (
                              <option key={id} value={id}>
                                {MODELS[id].label} — {MODELS[id].blurb} · {MODELS[id].credits} credits
                              </option>
                            ))}
                          </select>
                          <p className="mt-1.5 text-xs text-faint">
                            Better models design better sites and cost more credits. Opus is the sweet
                            spot.
                          </p>
                        </div>
                      </div>
                    )}
                  </div>

                  <button
                    onClick={() => runClaude("create")}
                    disabled={building || !videoUrl || !siteBrief.trim()}
                    className="btn-primary w-full !py-4 mt-6"
                  >
                    Build my website · {costLabel(claudeCost)}
                  </button>
                  <p className="mt-2 text-xs text-faint text-center">
                    Streams live — usually 1–3 minutes.
                  </p>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
