// Browser-side video helpers. Everything here runs in a client component's
// effect, never on the server.

/** The visitor asked the OS to stop unrequested motion. */
export function prefersStill(): boolean {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/**
 * Whether this device should drive a video with scroll position.
 *
 * Scroll-scrubbing needs cheap, repeated `currentTime` seeks. Phones and
 * tablets give us the opposite: a hardware decoder tuned for linear playback
 * where every seek costs a frame budget, plus a URL bar that resizes the
 * viewport mid-scroll and re-runs the whole calculation. The effect that reads
 * as cinematic on a trackpad reads as a stutter on a phone, so touch devices
 * and narrow viewports get plain looping playback instead.
 */
export function canScrub(): boolean {
  return (
    window.matchMedia("(hover: hover) and (pointer: fine)").matches &&
    window.innerWidth >= 768
  );
}

/**
 * Start a muted background video, and cope with the browser saying no.
 *
 * iOS refuses `play()` outright in Low Power Mode, and Android does the same
 * under Data Saver. The promise rejects, nothing renders, and the visitor is
 * left with an empty black rectangle where the footage should be. So on a
 * rejection we nudge `currentTime` off zero, which paints a real frame without
 * playback, and then retry once the visitor next touches the page: by then the
 * gesture makes playback allowed again.
 */
export function playSafely(video: HTMLVideoElement): void {
  video.play().catch(() => {
    // Decode one frame so the element shows footage rather than a void. A tenth
    // of a second in avoids the black fade-in most generated clips open on.
    if (video.currentTime < 0.1) {
      try {
        video.currentTime = 0.1;
      } catch {
        /* not seekable yet; the poster is still covering the element */
      }
    }
    const retry = () => {
      video.play().catch(() => {});
      document.removeEventListener("touchend", retry);
      document.removeEventListener("click", retry);
    };
    document.addEventListener("touchend", retry, { once: true, passive: true });
    document.addEventListener("click", retry, { once: true });
  });
}

/**
 * Lazily load and loop every `video[data-src]` inside `root` while it's on
 * screen. Shared by the reference reel, the showcase grid and the ambient
 * panels, which all want the same thing: nothing downloads until it's nearly
 * in view, and what is in view is playing.
 *
 * Returns a teardown function for the effect that called it.
 */
export function observeAmbientVideos(root: HTMLElement): () => void {
  const stillOnly = prefersStill();
  const videos = Array.from(root.querySelectorAll<HTMLVideoElement>("video[data-src]"));

  const observer = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        const video = entry.target as HTMLVideoElement;
        if (!entry.isIntersecting) {
          video.pause();
          continue;
        }
        if (!video.src) {
          video.src = video.dataset.src!;
          // Assigning .src on an element that was preload="none" doesn't start
          // a fetch on Safari; load() does.
          video.load();
        }
        if (stillOnly) {
          video.pause();
          continue;
        }
        playSafely(video);
      }
    },
    { rootMargin: "200px" },
  );

  videos.forEach((v) => observer.observe(v));
  return () => observer.disconnect();
}
