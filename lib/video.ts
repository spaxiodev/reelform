// Browser-side video helpers. Everything here runs in a client component's
// effect, never on the server.

/** All-intra (every frame a keyframe) encodes: every seek lands on a real
 *  frame with no backwards decode, which is what makes scrolling smooth. */
export const SCRUB_SRC = "/ReferenceVids/hero-scrub.mp4"; // 720p, ~7MB
export const SCRUB_SM_SRC = "/ReferenceVids/hero-scrub-sm.mp4"; // 576p, ~2.6MB
/** Normally-encoded loop for visitors we won't scrub for (Save-Data, 2G). */
export const LOOP_SRC = "/ReferenceVids/hero-scrub-mobile.mp4";
export const SCRUB_POSTER = "/ReferenceVids/hero-scrub.jpg";
/** Frame rate of the scrub encodes; seeks snap to this grid. */
export const SCRUB_FPS = 24;

/** The visitor asked the OS to stop unrequested motion. */
export function prefersStill(): boolean {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

type SaveDataConnection = { saveData?: boolean; effectiveType?: string };

function connection(): SaveDataConnection | undefined {
  return (navigator as Navigator & { connection?: SaveDataConnection }).connection;
}

/**
 * Whether this device should drive a video with scroll position.
 *
 * Scroll-scrubbing needs cheap, repeated `currentTime` seeks. That used to rule
 * out phones outright, but the cost was never the hardware: it was seeking into
 * a file the browser hadn't finished downloading, where every seek is a range
 * request. Buffer the whole clip first (see `loadScrubSource`) and a phone
 * scrubs an all-intra 480p encode perfectly well.
 *
 * What we still won't do is pull down a multi-megabyte clip behind the back of
 * someone who asked us not to.
 */
export function canScrub(): boolean {
  const conn = connection();
  if (conn?.saveData) return false;
  if (conn?.effectiveType && /^(slow-)?2g$/.test(conn.effectiveType)) return false;
  return true;
}

/** The scrub encode to use here: the small one on phones and narrow windows. */
export function scrubSource(): string {
  const coarse = !window.matchMedia("(hover: hover) and (pointer: fine)").matches;
  return coarse || window.innerWidth < 768 ? SCRUB_SM_SRC : SCRUB_SRC;
}

// One in-flight download per URL, shared by every component that wants it: the
// hero and the product mock ask for the same file within a second of each other.
const blobs = new Map<string, Promise<string>>();

/**
 * Download a scrub encode in full and hand back a URL that seeks locally.
 *
 * This is the whole fix for scrub jank. Pointing a <video> at a network URL and
 * seeking it makes each seek a byte-range request: the first few seconds of
 * scrolling stutter while the browser fetches, and on a phone it gives up and
 * just plays. Fetching the file into a blob costs one honest download up front,
 * after which every seek is memory-local.
 *
 * Falls back to the network URL if the fetch fails, so a scrub that degrades is
 * still a video.
 */
export function loadScrubSource(src: string): Promise<string> {
  let pending = blobs.get(src);
  if (!pending) {
    pending = fetch(src, { cache: "force-cache" })
      .then((res) => {
        if (!res.ok) throw new Error(`${res.status}`);
        return res.blob();
      })
      .then((blob) => URL.createObjectURL(blob))
      .catch(() => src);
    blobs.set(src, pending);
  }
  return pending;
}

/**
 * Wake the decoder so the first seek isn't the slow one.
 *
 * Safari (iOS especially) treats a video that has never played as cold: the
 * first `currentTime` write can take hundreds of milliseconds. A play/pause
 * pair costs one frame and makes every later seek prompt. Autoplay refusals
 * (Low Power Mode, Data Saver) are fine here, since seeking works regardless.
 *
 * The returned promise settles once the pause has actually landed. Callers
 * that reveal the element on a timer of their own (a cross-fade in from the
 * poster) should wait for it: revealing before the pause lands risks catching
 * the video mid "play," which shows as a frame or two of unrequested motion
 * right as it fades in, worse under the load a fresh page start puts on the
 * main thread.
 */
export function primeForSeeking(video: HTMLVideoElement): Promise<void> {
  return video
    .play()
    .then(() => video.pause())
    .catch(() => {});
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

type ScrubberOptions = {
  /** The tall section whose scroll range maps onto the clip. */
  wrap: HTMLElement;
  video: HTMLVideoElement;
  /** False for loop/reduced-motion devices: progress still reports, no seeking. */
  scrub: boolean;
  /** Called every animation frame the scroll position changed. */
  onProgress?: (progress: number, time: number, duration: number) => void;
};

/**
 * Map scroll position through a pinned section onto a video's currentTime.
 *
 * Two things keep it smooth. Seeks are coalesced: we hold one target time and
 * only issue the next seek when the previous finishes, so a flick of the wheel
 * collapses to the latest position instead of queuing a backlog. And targets
 * snap to the clip's frame grid, so scrolling a third of a frame doesn't cost a
 * seek that can't change a pixel.
 *
 * Returns a teardown function for the effect that called it.
 */
export function createScrollScrubber({ wrap, video, scrub, onProgress }: ScrubberOptions) {
  const frame = 1 / SCRUB_FPS;

  // Measured, not read per-frame: on a phone `innerHeight` changes as the URL
  // bar hides, and recomputing the range mid-scroll makes the clip jump.
  let viewportW = window.innerWidth;
  let viewportH = window.innerHeight;
  let range = Math.max(wrap.offsetHeight - viewportH, 0);
  const measure = () => {
    viewportW = window.innerWidth;
    viewportH = window.innerHeight;
    range = Math.max(wrap.offsetHeight - viewportH, 0);
  };

  let duration = 0;
  const readDuration = () => {
    if (Number.isFinite(video.duration) && video.duration > 0) {
      duration = video.duration;
      measure(); // the section's height may depend on the scrub decision
      onScroll();
    }
  };
  readDuration();
  video.addEventListener("loadedmetadata", readDuration);
  video.addEventListener("durationchange", readDuration);

  let target = 0;
  let seeking = false;
  const applySeek = () => {
    if (!duration || seeking) return;
    if (Math.abs(video.currentTime - target) < frame / 2) return;
    seeking = true;
    try {
      video.currentTime = target;
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
    const scrolled = -wrap.getBoundingClientRect().top;
    const progress = range > 0 ? Math.min(Math.max(scrolled / range, 0), 1) : 0;

    if (scrub && duration) {
      const raw = progress * (duration - frame);
      target = Math.round(raw / frame) * frame;
      applySeek();
    }
    onProgress?.(progress, target, duration);
  };

  function onScroll() {
    if (!ticking) {
      ticking = true;
      requestAnimationFrame(update);
    }
  }

  const onResize = () => {
    // A height-only change of about a URL bar is the URL bar. Keep the metrics
    // we started with rather than re-deriving progress underneath the visitor.
    const urlBar = window.innerWidth === viewportW && Math.abs(window.innerHeight - viewportH) <= 140;
    if (!urlBar) measure();
    onScroll();
  };

  update();
  window.addEventListener("scroll", onScroll, { passive: true });
  window.addEventListener("resize", onResize);

  return () => {
    video.removeEventListener("loadedmetadata", readDuration);
    video.removeEventListener("durationchange", readDuration);
    video.removeEventListener("seeked", onSeeked);
    window.removeEventListener("scroll", onScroll);
    window.removeEventListener("resize", onResize);
  };
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
