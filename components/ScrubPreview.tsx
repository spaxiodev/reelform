"use client";

import { useEffect, useRef, useState } from "react";
import {
  createScrollScrubber,
  canScrub,
  loadScrubSource,
  playSafely,
  prefersStill,
  primeForSeeking,
  scrubSource,
  LOOP_SRC,
  SCRUB_POSTER,
} from "@/lib/video";

// A mock browser window showing a real-estate site whose hero video scrubs
// frame-by-frame as the visitor scrolls: the product's headline playback mode,
// demonstrated on the landing page itself. The card pins for ~1.2 extra
// viewports so there's room to scrub through the whole clip.
//
// Phones scrub here too, on the same buffered-first all-intra encode the hero
// uses; the download is shared between the two sections. Visitors on Save-Data
// get a plain loop and a caption that describes the scroll behaviour instead of
// performing it.
export function ScrubPreview() {
  const wrapRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const barRef = useRef<HTMLDivElement>(null);
  const timeRef = useRef<HTMLSpanElement>(null);
  const hintRef = useRef<HTMLDivElement>(null);
  const [scrubbing, setScrubbing] = useState<boolean | null>(null);
  const [still, setStill] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const wrap = wrapRef.current;
    const video = videoRef.current;
    if (!wrap || !video) return;

    // This section demonstrates scroll-scrubbing, but the demonstration is
    // still unrequested motion. Under prefers-reduced-motion the mock browser
    // holds one frame; the caption below already explains what it does.
    const stillOnly = prefersStill();
    const scrub = !stillOnly && canScrub();
    setScrubbing(scrub);
    setStill(stillOnly);

    // The element has a frame to show: cross-fade it in over the poster. In
    // scrub mode this can only fire after the buffered clip is attached, which
    // is exactly when scrubbing becomes instant.
    const onLoaded = () => setReady(true);
    video.addEventListener("loadeddata", onLoaded, { once: true });

    const clock = (time: number, duration: number) => {
      if (!timeRef.current || !duration) return;
      timeRef.current.textContent = `0:${String(Math.floor(time)).padStart(2, "0")} / 0:${String(
        Math.floor(duration),
      ).padStart(2, "0")}`;
    };

    // Looping playback drives the mock's transport bar off playback position
    // rather than scroll position, so the readout still means something.
    const onTime = () => {
      const d = video.duration;
      if (!Number.isFinite(d) || !d) return;
      if (barRef.current) barRef.current.style.width = `${(video.currentTime / d) * 100}%`;
      clock(video.currentTime, d);
    };

    let cancelled = false;

    if (scrub) {
      loadScrubSource(scrubSource()).then((src) => {
        if (cancelled) return;
        video.src = src;
        video.load();
        primeForSeeking(video);
      });
    } else if (!stillOnly) {
      // Save-Data / 2G: a small ordinary loop rather than a scrub encode.
      video.src = LOOP_SRC;
      video.load();
      video.addEventListener("timeupdate", onTime);
      video.loop = true;
      playSafely(video);
    }
    // Under prefers-reduced-motion no video loads at all: the poster behind the
    // element stands in, and the transport readout below is hidden rather than
    // sitting at a frozen 0:00.

    const stop = createScrollScrubber({
      wrap,
      video,
      scrub,
      onProgress: (progress, time, duration) => {
        if (!scrub) return; // looping devices drive the bar from timeupdate
        clock(time, duration);
        if (barRef.current) barRef.current.style.width = `${progress * 100}%`;
        if (hintRef.current) {
          hintRef.current.style.opacity = String(1 - Math.min(progress / 0.12, 1));
        }
      },
    });

    return () => {
      cancelled = true;
      video.removeEventListener("loadeddata", onLoaded);
      video.removeEventListener("timeupdate", onTime);
      stop();
    };
  }, []);

  return (
    <section
      ref={wrapRef}
      className={`relative px-4 sm:px-6 pt-20 md:pt-28 ${
        scrubbing === false ? "h-auto pb-16" : "h-[180vh] md:h-[220vh]"
      }`}
    >
      <div
        className={`flex flex-col items-center justify-center ${
          scrubbing === false ? "" : "sticky top-0 h-[100svh]"
        }`}
      >
        <div className="card w-full max-w-5xl overflow-hidden !rounded-[1.75rem]">
          <div className="flex items-center gap-3 border-b border-line bg-bg-raise px-4 py-3 sm:px-5">
            <span className="flex gap-1.5" aria-hidden>
              <span className="h-2.5 w-2.5 rounded-full bg-line-strong" />
              <span className="h-2.5 w-2.5 rounded-full bg-line-strong" />
              <span className="h-2.5 w-2.5 rounded-full bg-line-strong" />
            </span>
            <span className="mx-auto max-w-sm flex-1 truncate rounded-full border border-line bg-bg px-4 py-1 text-center text-xs text-faint">
              cliffsideresidences.com
            </span>
          </div>

          {/* 21:9 is a cinema crop that leaves no room for the overlaid copy on
              a phone, so the mock keeps a taller frame until there's width. */}
          <div
            className="relative flex aspect-[4/3] items-end overflow-hidden bg-ink bg-cover bg-center sm:aspect-[16/9] lg:aspect-[21/9]"
            style={{ backgroundImage: `url(${SCRUB_POSTER})` }}
          >
            <video
              ref={videoRef}
              poster={SCRUB_POSTER}
              muted
              playsInline
              preload="none"
              disablePictureInPicture
              className={`absolute inset-0 h-full w-full object-cover transition-opacity duration-500 ${
                ready ? "opacity-100" : "opacity-0"
              }`}
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

            <div aria-hidden className="absolute right-4 top-4 flex items-center gap-2 sm:right-6 sm:top-6">
              <span className="rec-dot" />
              <span className="text-[0.65rem] font-bold tracking-widest text-white/70 sm:text-xs">
                {still ? "STILL" : scrubbing === false ? "LOOP" : "SCRUB"}
              </span>
            </div>

            <div className="relative max-w-lg p-5 pb-10 text-white sm:p-8 md:p-12">
              <p className="text-[0.6rem] font-bold tracking-[0.2em] text-white/70 sm:text-xs">
                CLIFFSIDE RESIDENCES · PRIVATE LISTINGS
              </p>
              <p className="mt-2 text-xl font-medium leading-tight sm:mt-3 sm:text-2xl md:text-4xl">
                Homes that are worth the drive out.
              </p>
              <span className="mt-4 inline-block rounded-full bg-white px-4 py-2.5 text-[0.65rem] font-bold uppercase tracking-wider text-ink sm:mt-5 sm:text-xs">
                Book a viewing
              </span>
            </div>

            {/* Scrub position: tracks scroll through the pinned section */}
            <div aria-hidden className="absolute inset-x-0 bottom-0" hidden={still}>
              <div className="flex items-center justify-between px-4 pb-2 text-[0.6rem] font-bold tracking-widest text-white/60 sm:text-[0.65rem]">
                <span ref={timeRef}>0:00 / 0:00</span>
                <span>{scrubbing === false ? "PLAYING" : "SCROLL-SCRUBBED"}</span>
              </div>
              <div className="h-1 bg-white/20">
                <div ref={barRef} className="h-full w-0 bg-primary" />
              </div>
            </div>
          </div>
        </div>

        <p className="mt-4 max-w-xl text-center text-sm text-faint">
          {still
            ? "A real AI-generated shot inside a Claude-built site. Your system asks for reduced motion, so this frame is held; normally the footage advances as you scroll."
            : scrubbing === false
              ? "A real AI-generated shot inside a Claude-built site. On a normal connection this same footage advances frame by frame as you scroll; on Save-Data it loops instead."
              : "A real AI-generated shot inside a Claude-built site. Keep scrolling and the footage advances frame by frame, exactly as your visitors will see it."}
        </p>
        {scrubbing !== false && (
          <div
            ref={hintRef}
            className="mt-3 flex items-center gap-2 text-[0.7rem] font-bold uppercase tracking-[0.2em] text-primary"
          >
            Scroll to scrub
            <span aria-hidden className="text-base leading-none">
              ↓
            </span>
          </div>
        )}
      </div>
    </section>
  );
}
