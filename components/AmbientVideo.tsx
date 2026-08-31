"use client";

import { useEffect, useRef } from "react";

// Muted looping footage that only downloads and plays once it's on screen —
// used to fill the feature thumbnails and the full-width sunset bands.
export function AmbientVideo({
  src,
  className = "",
  overlay,
}: {
  src: string;
  className?: string;
  /** CSS background painted over the footage, e.g. a legibility scrim. */
  overlay?: string;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    // Looping motion behind content is exactly what prefers-reduced-motion is
    // for, and CSS can't pause a <video>. Load the clip and hold frame one so
    // the panel still has its imagery, but never animate it.
    const stillOnly = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          if (!video.src) video.src = src;
          if (stillOnly) {
            video.pause();
            return;
          }
          video.play().catch(() => {});
        } else {
          video.pause();
        }
      },
      { rootMargin: "200px" },
    );

    observer.observe(video);
    return () => observer.disconnect();
  }, [src]);

  return (
    <div aria-hidden className={`absolute inset-0 overflow-hidden ${className}`}>
      <video
        ref={videoRef}
        muted
        loop
        playsInline
        preload="none"
        disablePictureInPicture
        className="h-full w-full object-cover"
      />
      {overlay && <div className="absolute inset-0" style={{ background: overlay }} />}
    </div>
  );
}
