"use client";

import { useEffect, useRef } from "react";

// Same all-intra (every frame a keyframe) re-encode the hero uses, so the
// scroll-driven currentTime seeks land instantly instead of stuttering.
const VIDEO_SRC = "/ReferenceVids/hero-scrub.mp4";

// A mock browser window showing a real-estate site whose hero video scrubs
// frame-by-frame as the visitor scrolls — the product's headline playback mode,
// demonstrated on the landing page itself. The card pins for ~1.2 extra
// viewports so there's room to scrub through the whole clip.
export function ScrubPreview() {
  const wrapRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const barRef = useRef<HTMLDivElement>(null);
  const timeRef = useRef<HTMLSpanElement>(null);
  const hintRef = useRef<HTMLDivElement>(null);
  const durationRef = useRef(0);

  useEffect(() => {
    const wrap = wrapRef.current;
    const video = videoRef.current;
    if (!wrap || !video) return;

    // This section demonstrates scroll-scrubbing, but the demonstration is
    // still unrequested motion. Under prefers-reduced-motion the mock browser
    // holds one frame; the caption below already explains what it does.
    const stillOnly = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    const readDuration = () => {
      if (Number.isFinite(video.duration) && video.duration > 0) {
        durationRef.current = video.duration;
        if (stillOnly) {
          try {
            video.currentTime = video.duration * 0.35;
          } catch {
            /* seek unsupported before metadata settles — harmless */
          }
        }
      }
    };
    readDuration();
    video.addEventListener("loadedmetadata", readDuration);

    // Coalesced seeking: hold one target time and issue the next seek only when
    // the previous finishes, so fast scrolls collapse to the latest position.
    let targetTime = 0;
    let seeking = false;

    const applySeek = () => {
      const d = durationRef.current;
      if (!d || seeking) return;
      if (Math.abs(video.currentTime - targetTime) < 0.01) return;
      seeking = true;
      try {
        video.currentTime = targetTime;
      } catch {
        seeking = false;
      }
    };
    const onSeeked = () => {
      seeking = false;
      applySeek();
    };
    video.addEventListener("seeked", onSeeked);

    let ticking = false;
    const update = () => {
      ticking = false;
      const total = wrap.offsetHeight - window.innerHeight;
      const scrolled = -wrap.getBoundingClientRect().top;
      const progress = total > 0 ? Math.min(Math.max(scrolled / total, 0), 1) : 0;

      const d = durationRef.current;
      if (d && !stillOnly) {
        targetTime = progress * (d - 0.05);
        applySeek();
        if (timeRef.current) {
          const secs = Math.floor(targetTime);
          timeRef.current.textContent = `0:${String(secs).padStart(2, "0")} / 0:${String(
            Math.floor(d),
          ).padStart(2, "0")}`;
        }
      }

      if (barRef.current) barRef.current.style.width = `${progress * 100}%`;
      if (hintRef.current) {
        hintRef.current.style.opacity = String(1 - Math.min(progress / 0.12, 1));
      }
    };

    const onScroll = () => {
      if (!ticking) {
        ticking = true;
        requestAnimationFrame(update);
      }
    };

    update();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      video.removeEventListener("loadedmetadata", readDuration);
      video.removeEventListener("seeked", onSeeked);
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
    };
  }, []);

  return (
    <section ref={wrapRef} className="relative h-[220vh] px-6 pt-20 md:pt-28">
      <div className="sticky top-0 flex h-[100svh] flex-col items-center justify-center">
        <div className="card w-full max-w-5xl overflow-hidden !rounded-[1.75rem]">
          <div className="flex items-center gap-3 border-b border-line bg-bg-raise px-5 py-3">
            <span className="flex gap-1.5" aria-hidden>
              <span className="h-2.5 w-2.5 rounded-full bg-line-strong" />
              <span className="h-2.5 w-2.5 rounded-full bg-line-strong" />
              <span className="h-2.5 w-2.5 rounded-full bg-line-strong" />
            </span>
            <span className="mx-auto max-w-sm flex-1 rounded-full border border-line bg-bg px-4 py-1 text-center text-xs text-faint">
              cliffsideresidences.com
            </span>
          </div>

          <div className="relative flex aspect-[21/9] items-end overflow-hidden bg-ink">
            <video
              ref={videoRef}
              src={VIDEO_SRC}
              muted
              playsInline
              preload="auto"
              disablePictureInPicture
              className="absolute inset-0 h-full w-full object-cover"
            />
            {/* Legibility scrim over the footage */}
            <div
              aria-hidden
              className="absolute inset-0"
              style={{
                background:
                  "linear-gradient(90deg, rgba(30,18,13,0.72) 0%, rgba(30,18,13,0.38) 48%, rgba(30,18,13,0.12) 100%)",
              }}
            />

            <div aria-hidden className="absolute right-6 top-6 flex items-center gap-2">
              <span className="rec-dot" />
              <span className="text-xs font-bold tracking-widest text-white/70">SCRUB</span>
            </div>

            <div className="relative max-w-lg p-8 text-white md:p-12">
              <p className="text-xs font-bold tracking-[0.2em] text-white/70">
                CLIFFSIDE RESIDENCES — PRIVATE LISTINGS
              </p>
              <p className="mt-3 text-2xl font-medium leading-tight md:text-4xl">
                Homes that are worth the drive out.
              </p>
              <span className="mt-5 inline-block rounded-full bg-white px-4 py-2.5 text-xs font-bold uppercase tracking-wider text-ink">
                Book a viewing
              </span>
            </div>

            {/* Scrub position — tracks scroll through the pinned section */}
            <div aria-hidden className="absolute inset-x-0 bottom-0">
              <div className="flex items-center justify-between px-4 pb-2 text-[0.65rem] font-bold tracking-widest text-white/60">
                <span ref={timeRef}>0:00 / 0:00</span>
                <span>SCROLL-SCRUBBED</span>
              </div>
              <div className="h-1 bg-white/20">
                <div ref={barRef} className="h-full w-0 bg-primary" />
              </div>
            </div>
          </div>
        </div>

        <p className="mt-4 max-w-xl text-center text-sm text-faint">
          A real Seedance shot inside a Claude-built site — keep scrolling and the footage advances
          frame by frame, exactly as your visitors will see it.
        </p>
        <div
          ref={hintRef}
          className="mt-3 flex items-center gap-2 text-[0.7rem] font-bold uppercase tracking-[0.2em] text-primary"
        >
          Scroll to scrub
          <span aria-hidden className="text-base leading-none">
            ↓
          </span>
        </div>
      </div>
    </section>
  );
}
