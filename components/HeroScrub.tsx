"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { canScrub, playSafely, prefersStill } from "@/lib/video";

// All-intra (every frame a keyframe) 720p re-encode of the reference clip, so
// scroll-driven currentTime seeks resolve instantly instead of stuttering.
// That density costs bytes, which is a fair trade on a desktop connection and a
// bad one on a phone that isn't going to scrub at all, so touch devices get a
// smaller, normally-encoded loop instead.
const SCRUB_SRC = "/ReferenceVids/hero-scrub.mp4";
const LOOP_SRC = "/ReferenceVids/hero-scrub-mobile.mp4";
const POSTER = "/ReferenceVids/hero-scrub.jpg";

// Full-screen hero whose background video scrubs frame-by-frame with scroll.
// The overlaid text fades and rises away past a threshold, then the pinned
// stage releases and the rest of the page flows underneath.
//
// On phones the video simply loops: see canScrub() for why. The pinned stage
// also shrinks there, because without scrubbing there's nothing to scroll
// through, and 240vh of unmoving hero is just a long wall between the visitor
// and the page.
export function HeroScrub() {
  const wrapRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const textRef = useRef<HTMLDivElement>(null);
  const cueRef = useRef<HTMLDivElement>(null);
  const durationRef = useRef(0);
  // Undecided until the effect measures the device. Rendering no <source> on
  // the server keeps us from shipping the 7MB scrub encode to a phone.
  const [scrubbing, setScrubbing] = useState<boolean | null>(null);

  useEffect(() => {
    const wrap = wrapRef.current;
    const video = videoRef.current;
    const text = textRef.current;
    if (!wrap || !video || !text) return;

    // Scroll-driven scrubbing and the parallax text exit are both motion the
    // visitor didn't ask for. Under prefers-reduced-motion we hold a single
    // representative frame and fade the copy without moving, scaling or
    // blurring it. The hero still reads, it just stops animating.
    const stillOnly = prefersStill();
    const scrub = canScrub();
    setScrubbing(scrub);

    video.src = scrub ? SCRUB_SRC : LOOP_SRC;
    video.load();

    if (!scrub && !stillOnly) {
      video.loop = true;
      playSafely(video);
    }

    const readDuration = () => {
      if (Number.isFinite(video.duration) && video.duration > 0) {
        durationRef.current = video.duration;
        // Park on a frame with the subject in it rather than a black first frame.
        if (stillOnly) {
          try {
            video.currentTime = video.duration * 0.25;
          } catch {
            /* seek unsupported before metadata settles: harmless */
          }
        }
      }
    };
    readDuration();
    video.addEventListener("loadedmetadata", readDuration);

    // Coalesced seeking: we only ever hold one *target* time and issue the next
    // seek when the previous one finishes. Fast scrolls collapse to the latest
    // position instead of queuing a backlog of slow seeks (the source of jank).
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
      applySeek(); // chase the latest target if scroll moved on mid-seek
    };
    video.addEventListener("seeked", onSeeked);

    let ticking = false;
    const update = () => {
      ticking = false;
      const total = wrap.offsetHeight - window.innerHeight;
      const scrolled = -wrap.getBoundingClientRect().top;
      const progress = total > 0 ? Math.min(Math.max(scrolled / total, 0), 1) : 0;

      const d = durationRef.current;
      if (d && scrub && !stillOnly) {
        targetTime = progress * (d - 0.05);
        applySeek();
      }

      // Text leaves between 40% and 72% of the hero scroll.
      const exit = Math.min(Math.max((progress - 0.4) / 0.32, 0), 1);
      text.style.opacity = String(1 - exit);
      if (!stillOnly) {
        text.style.transform = `translateY(${-exit * 48}px) scale(${1 - exit * 0.04})`;
        text.style.filter = `blur(${exit * 5}px)`;
      }
      text.style.pointerEvents = exit > 0.6 ? "none" : "auto";

      if (cueRef.current) {
        cueRef.current.style.opacity = String(1 - Math.min(progress / 0.08, 1));
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
    <section
      ref={wrapRef}
      className={`relative ${scrubbing === false ? "h-[150svh]" : "h-[240vh]"}`}
    >
      <div className="sticky top-0 h-[100svh] w-full overflow-hidden bg-ink">
        <video
          ref={videoRef}
          poster={POSTER}
          muted
          playsInline
          preload="none"
          disablePictureInPicture
          className="absolute inset-0 h-full w-full object-cover"
        />
        {/* Sunset-tinted legibility scrim + vignette */}
        <div
          aria-hidden
          className="absolute inset-0"
          style={{
            background:
              "radial-gradient(115% 80% at 50% 38%, rgba(42,26,19,0.18), rgba(42,26,19,0.62) 100%), linear-gradient(180deg, rgba(221,79,38,0.28) 0%, rgba(42,26,19,0.30) 55%, rgba(42,26,19,0.55) 100%)",
          }}
        />

        {/* Hero copy: fades/rises away on scroll */}
        <div
          ref={textRef}
          className="relative z-10 flex h-full flex-col items-center justify-center px-6 text-center"
        >
          {/* On a short phone screen the whole block is taller than the
              viewport, and this eyebrow is the line the hero can spare. */}
          <span className="hidden [@media(min-height:620px)]:inline-flex items-center gap-2 rounded-full border border-white/40 bg-white/15 px-4 py-1.5 text-[0.7rem] sm:text-xs font-semibold tracking-wide text-white backdrop-blur-sm">
            <span className="rec-dot" aria-hidden /> AI VIDEO-FIRST WEBSITES
          </span>
          <h1 className="mt-0 [@media(min-height:620px)]:mt-7 max-w-4xl text-white font-bold tracking-tight text-[2.25rem] min-[380px]:text-[2.75rem] sm:text-6xl md:text-8xl leading-[0.98] [text-shadow:0_2px_30px_rgba(0,0,0,0.35)]">
            Websites that
            <br />
            move people.
          </h1>
          <p className="mx-auto mt-4 sm:mt-7 max-w-xl text-[0.95rem] min-[380px]:text-base sm:text-lg md:text-xl text-white/90 leading-relaxed [text-shadow:0_1px_12px_rgba(0,0,0,0.4)]">
            Direct a cinematic hero video with the AI model of your choice. Approve the footage, then Claude builds your
            whole site around it: looping, or scrubbing frame-by-frame as visitors scroll.
          </p>
          <div className="mt-6 sm:mt-9 flex w-full max-w-sm sm:max-w-none flex-col sm:flex-row flex-wrap items-stretch sm:items-center justify-center gap-3">
            <Link
              href="/create"
              className="rounded-full bg-white px-7 py-3.5 text-center text-base font-semibold text-ink shadow-[0_8px_24px_rgba(0,0,0,0.28)] hover:bg-white/90 transition-colors"
            >
              Start building · first site free
            </Link>
            <Link
              href="/pricing"
              className="rounded-full border border-white/60 px-7 py-3.5 text-center text-base font-semibold text-white hover:bg-white/10 transition-colors"
            >
              See pricing
            </Link>
          </div>
        </div>

        {/* Scroll cue */}
        <div
          ref={cueRef}
          className="scroll-cue absolute inset-x-0 bottom-7 z-10 hidden [@media(min-height:620px)]:flex flex-col items-center gap-2 text-white/80"
        >
          <span className="text-[0.7rem] font-bold uppercase tracking-[0.2em]">Scroll</span>
          <span aria-hidden className="text-lg leading-none">
            ↓
          </span>
        </div>
      </div>
    </section>
  );
}
