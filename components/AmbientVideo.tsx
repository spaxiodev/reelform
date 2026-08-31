"use client";

import { useEffect, useRef } from "react";
import { observeAmbientVideos } from "@/lib/video";

// Muted looping footage that only downloads and plays once it's on screen,
// used to fill the feature thumbnails and the full-width sunset bands.
export function AmbientVideo({
  src,
  poster,
  className = "",
  overlay,
}: {
  src: string;
  /**
   * Still frame shown until the clip decodes. Every clip in /ReferenceVids
   * ships one beside it, so that's the default; on a slow phone this poster is
   * what the visitor actually sees for the first second or two.
   */
  poster?: string;
  className?: string;
  /** CSS background painted over the footage, e.g. a legibility scrim. */
  overlay?: string;
}) {
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const wrap = wrapRef.current;
    if (!wrap) return;
    return observeAmbientVideos(wrap);
  }, [src]);

  return (
    <div aria-hidden ref={wrapRef} className={`absolute inset-0 overflow-hidden ${className}`}>
      <video
        data-src={src}
        poster={poster ?? src.replace(/\.mp4$/, ".jpg")}
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
