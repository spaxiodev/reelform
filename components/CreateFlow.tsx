"use client";

import { useCallback, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { DEFAULT_VIDEO_MODEL } from "@/lib/higgsfield";
import { ShotControls, type ShotSettings } from "@/components/ShotControls";
import { DEFAULT_MODEL } from "@/lib/pricing";
import { trackEvent } from "@/lib/analytics";
import ProviderStatus from "@/components/ProviderStatus";

type Mode = "scrub" | "loop";
type Stage = "format" | "brief" | "building";

const FORMATS: { id: Mode; title: string; tagline: string; desc: string }[] = [
  {
    id: "scrub",
    title: "Scrub website",
    tagline: "Scrolling plays the video",
    desc:
      "Your scroll wheel becomes the play button. Scroll down and the footage advances frame by frame; scroll up and it rewinds. The video never plays on its own; the visitor drives it, so the page feels like something they're operating rather than watching. Best for reveals, product shots and anything where the motion is the story.",
  },
  {
    id: "loop",
    title: "Looping video",
    tagline: "Plays by itself, on repeat",
    desc:
      "The footage runs continuously behind your hero section like a moving background, muted and seamless. Nothing for the visitor to do. Best for mood, atmosphere and brand sites where the video sets a tone rather than carrying information.",
  },
];

// Rough wall-clock for the whole run, used only to pace the progress copy.
const STEPS = ["Setting up your project", "Writing the shot", "Rendering the video", "Building the site"];

function nameFrom(brief: string): string {
  const words = brief.trim().split(/\s+/).slice(0, 5).join(" ");
  return words.length > 2 ? words.slice(0, 60) : "My website";
}

export function CreateFlow({
  isFirstBuild,
  isAdmin = false,
}: {
  isFirstBuild: boolean;
  isAdmin?: boolean;
}) {
  const router = useRouter();
  const [stage, setStage] = useState<Stage>("format");
  const [mode, setMode] = useState<Mode>("scrub");
  const [brief, setBrief] = useState("");
  const [shot, setShot] = useState<ShotSettings>({
    model: DEFAULT_VIDEO_MODEL,
    resolution: "1080p",
    duration: 5,
    ratio: "16:9",
  });

  const [step, setStep] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [upgrade, setUpgrade] = useState(false);

  const fail = useCallback((message: string, needsPlan = false) => {
    setError(message);
    setUpgrade(needsPlan);
    setStage("brief");
  }, []);

  async function run(e: React.FormEvent) {
    e.preventDefault();
    if (!brief.trim()) return;
    setError(null);
    setUpgrade(false);
    setStage("building");
    setStep(0);

    try {
      // 1. The project, plus its empty hero slot.
      const projectRes = await fetch("/api/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: nameFrom(brief), videoMode: mode }),
      });
      const project = await projectRes.json();
      if (!projectRes.ok || !project.id) {
        return fail(
          project.message ?? project.error ?? "Could not start the project.",
          projectRes.status === 402
        );
      }
      trackEvent("project_created", { videoMode: mode, via: "create_flow" });

      // 2. Turn the website brief into a shot prompt. Free, and it keeps the
      // form down to a single box: the user describes the site, not the camera.
      setStep(1);
      const shotRes = await fetch("/api/site/suggest-shot", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: nameFrom(brief), siteBrief: brief, role: "Hero video" }),
      });
      const suggestion = await shotRes.json();
      // A failed suggestion isn't fatal: the brief itself is a usable prompt.
      const prompt: string = suggestion.prompt?.trim() || brief.trim();

      // 3. Shoot it.
      setStep(2);
      const videoRes = await fetch("/api/video/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          videoId: project.heroVideoId,
          prompt,
          resolution: shot.resolution,
          duration: shot.duration,
          ratio: shot.ratio,
          model: shot.model,
        }),
      });
      const video = await videoRes.json();
      if (!videoRes.ok) {
        return fail(
          video.message ?? video.error ?? "Could not start the video.",
          videoRes.status === 402
        );
      }

      // Poll until the render settles. The status route re-hosts the file and
      // re-encodes it all-intra, which is what makes scrubbing smooth.
      // Renders land in ~1-2 minutes; give up well past that rather than
      // polling a stuck request forever. The shot itself is still charged (or
      // still holding the free slot) until the provider settles it, so the
      // studio is where a genuinely slow render gets picked back up.
      const deadline = Date.now() + 10 * 60 * 1000;
      let status = "queued";
      while (status !== "succeeded") {
        if (Date.now() > deadline) {
          return fail(
            "The video is taking unusually long. It's still rendering; open it from your projects in a minute."
          );
        }
        await new Promise((r) => setTimeout(r, 10000));
        const res = await fetch(`/api/video/status?videoId=${project.heroVideoId}`);
        const data = await res.json();
        status = data.status;
        if (status === "failed") {
          return fail(data.error ?? "The video failed to render. Nothing was charged, so try again.");
        }
      }

      // 4. Hand the footage to Claude and let it build the page.
      setStep(3);
      const siteRes = await fetch("/api/site/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId: project.id,
          mode: "create",
          model: DEFAULT_MODEL,
          name: nameFrom(brief),
          siteBrief: brief,
        }),
      });
      if (!siteRes.ok) {
        const data = await siteRes.json().catch(() => ({}));
        return fail(
          data.message ?? data.error ?? "Could not build the site.",
          siteRes.status === 402
        );
      }
      // The build streams; we only need it to finish before showing the studio.
      const reader = siteRes.body?.getReader();
      if (reader) {
        for (;;) {
          const { done } = await reader.read();
          if (done) break;
        }
      }

      trackEvent("site_build_completed", { via: "create_flow", videoMode: mode });
      router.push(`/studio/${project.id}`);
    } catch {
      fail("Network error and nothing was charged. Please try again.");
    }
  }

  // ── Stage 1: how the video behaves ────────────────────────────────
  if (stage === "format") {
    return (
      <div>
        <p className="mono-label">STEP 1 OF 2</p>
        <h1 className="mt-2 text-4xl md:text-5xl font-medium tracking-tight">
          How should your video play?
        </h1>
        <p className="mt-3 text-muted leading-relaxed max-w-2xl">
          This shapes the whole page, so it&apos;s the one thing worth deciding first. You can
          change it later in the studio.
        </p>

        <div className="mt-8 grid md:grid-cols-2 gap-4">
          {FORMATS.map((f) => (
            <button
              key={f.id}
              type="button"
              onClick={() => {
                setMode(f.id);
                setStage("brief");
              }}
              className="card text-left p-6 transition-colors hover:border-primary hover:bg-primary-soft/20 focus-visible:border-primary"
            >
              <p className="mono-label">{f.tagline}</p>
              <p className="mt-2 text-xl font-semibold">{f.title}</p>
              <p className="mt-3 text-sm text-muted leading-relaxed">{f.desc}</p>
              <span className="mt-5 inline-block text-sm font-medium text-primary">
                Choose this →
              </span>
            </button>
          ))}
        </div>
      </div>
    );
  }

  // ── Stage 3: the run ──────────────────────────────────────────────
  if (stage === "building") {
    return (
      <div className="max-w-xl">
        <p className="mono-label">NOW SHOOTING</p>
        <h1 className="mt-2 text-4xl font-medium tracking-tight">Building your website</h1>
        <p className="mt-3 text-muted leading-relaxed">
          This takes a couple of minutes, most of it waiting on the video. Keep this tab open.
        </p>
        <ol className="mt-8 space-y-3">
          {STEPS.map((label, i) => (
            <li key={label} className="flex items-center gap-3 text-sm">
              <span
                className={`grid h-6 w-6 shrink-0 place-items-center rounded-full font-mono text-xs ${
                  i < step
                    ? "bg-primary text-white"
                    : i === step
                      ? "bg-primary-soft text-primary-deep"
                      : "bg-bg-raise text-faint"
                }`}
                aria-hidden
              >
                {i < step ? "✓" : i + 1}
              </span>
              <span className={i <= step ? "text-ink" : "text-faint"}>{label}</span>
              {i === step && <span className="rec-dot ml-1" aria-hidden />}
            </li>
          ))}
        </ol>
      </div>
    );
  }

  // ── Stage 2: the brief, plus the shot controls ────────────────────
  return (
    <form onSubmit={run}>
      <button
        type="button"
        onClick={() => setStage("format")}
        className="mono-label hover:!text-ink transition-colors"
      >
        ← {mode === "scrub" ? "Scrub website" : "Looping video"}
      </button>
      <h1 className="mt-3 text-4xl md:text-5xl font-medium tracking-tight">
        Describe your website
      </h1>
      <p className="mt-3 text-muted leading-relaxed max-w-2xl">
        Say what the business is and how it should feel. Claude writes the page and directs the
        hero shot from this, so you don&apos;t need to describe the video separately.
      </p>

      <div className="mt-8 card p-2">
        <textarea
          className="w-full resize-none bg-transparent px-4 py-3 text-base leading-relaxed outline-none placeholder:text-faint"
          rows={5}
          autoFocus
          value={brief}
          onChange={(e) => setBrief(e.target.value)}
          placeholder="A specialty coffee roastery in Lisbon. Warm, unhurried, a bit industrial. Needs a menu, our story, and a way to book a tasting."
        />
        <div className="flex items-center justify-between gap-4 border-t border-line px-4 py-3">
          <p className="text-xs text-faint">
            {isFirstBuild
              ? "Your first website is free, no card needed."
              : "Building another site uses your plan's credits."}
          </p>
          <button type="submit" disabled={!brief.trim()} className="btn-primary shrink-0">
            Generate my website
          </button>
        </div>
      </div>

      {error && (
        <div className="mt-4 card border-danger/40 bg-danger/5 p-4 text-sm">
          <p className="text-danger">{error}</p>
          {upgrade && (
            <Link href="/pricing" className="mt-3 inline-block btn-primary !py-2 !px-4 text-sm">
              See plans →
            </Link>
          )}
        </div>
      )}

      {/* Shot controls, deliberately below the brief: sensible defaults mean
          most people never touch them. The price of the shot they describe is
          right here, so nobody has to guess before pressing generate. */}
      <div className="mt-8 flex items-center justify-between gap-4">
        <p className="mono-label">SHOT CONTROLS</p>
        <ProviderStatus />
      </div>
      <ShotControls
        className="mt-3"
        value={shot}
        onChange={(patch) => setShot((s) => ({ ...s, ...patch }))}
        isAdmin={isAdmin}
        costLabel={(credits) =>
          isFirstBuild ? `${credits} credits, free on your first build` : `${credits} credits`
        }
      />
    </form>
  );
}
