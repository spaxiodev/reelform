"use client";

import { useEffect, useRef } from "react";
import Link from "next/link";

export interface ShowcaseSite {
  id: string;
  name: string;
  industry: string | null;
  video_url: string | null;
  video_mode: "loop" | "scrub";
  published_at: string | null;
  username?: string | null;
}

export function ShowcaseGrid({ sites }: { sites: ShowcaseSite[] }) {
  const gridRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const grid = gridRef.current;
    if (!grid) return;
    const videos = Array.from(grid.querySelectorAll<HTMLVideoElement>("video[data-src]"));

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          const video = entry.target as HTMLVideoElement;
          if (entry.isIntersecting) {
            if (!video.src) video.src = video.dataset.src!;
            video.play().catch(() => {});
          } else {
            video.pause();
          }
        }
      },
      { rootMargin: "200px" }
    );

    videos.forEach((v) => observer.observe(v));
    return () => observer.disconnect();
  }, []);

  return (
    <div ref={gridRef} className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
      {sites.map((site) => (
        <div
          key={site.id}
          className="card relative overflow-hidden group hover:border-primary/50 transition-colors"
        >
          {/* Stretched link keeps the whole card clickable without nesting
              the creator link inside another anchor. */}
          <a
            href={`/showcase/${site.id}`}
            target="_blank"
            rel="noopener"
            aria-label={`View ${site.name}`}
            className="absolute inset-0 z-0"
          />
          <div className="relative aspect-video bg-ink overflow-hidden">
            {site.video_url ? (
              <video
                data-src={site.video_url}
                muted
                loop
                playsInline
                preload="none"
                className="w-full h-full object-cover"
              />
            ) : (
              <span className="absolute inset-0 flex items-center justify-center text-4xl" aria-hidden>
                🎬
              </span>
            )}
            <span className="absolute top-3 left-3 flex items-center gap-2 bg-ink/70 backdrop-blur-sm rounded px-2.5 py-1">
              <span className="rec-dot !w-2 !h-2" aria-hidden />
              <span className="text-[0.65rem] font-bold tracking-[0.15em] text-white/80 uppercase">
                {site.video_mode === "scrub" ? "Scroll scrub" : "Ambient loop"}
              </span>
            </span>
          </div>
          <div className="p-5">
            <h3 className="text-lg font-medium tracking-tight group-hover:text-primary transition-colors">
              {site.name}
            </h3>
            <div className="mt-1 flex items-center justify-between gap-3">
              <p className="text-sm text-faint truncate">{site.industry ?? "—"}</p>
              <span className="text-sm font-medium text-primary shrink-0">View site ↗</span>
            </div>
            {site.username && (
              <Link
                href={`/u/${site.username}`}
                className="relative z-10 mt-2 inline-block text-sm text-muted hover:text-primary transition-colors"
              >
                by @{site.username}
              </Link>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
