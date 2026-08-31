"use client";

import { useEffect, useState } from "react";

// A live/offline badge for the video provider, shown wherever someone is about
// to spend credits on a render. It answers one question: is it worth pressing
// generate right now? So it stays a dot and three words, and it never blocks
// or disables anything: the API can recover between the poll and the click.

type Health = { status: "live" | "offline"; detail?: string } | null;

const POLL_MS = 60_000;

export default function ProviderStatus({ className = "" }: { className?: string }) {
  const [health, setHealth] = useState<Health>(null);

  useEffect(() => {
    let alive = true;

    async function check() {
      try {
        const res = await fetch("/api/video/health", { cache: "no-store" });
        const data = (await res.json()) as { status?: string; detail?: string };
        if (!alive) return;
        setHealth({
          status: data.status === "live" ? "live" : "offline",
          detail: data.detail,
        });
      } catch {
        // The badge reports the provider, not our own network; an unreachable
        // check is the same news to the user either way.
        if (alive) setHealth({ status: "offline", detail: "Unreachable" });
      }
    }

    check();
    const timer = setInterval(check, POLL_MS);
    // Coming back to a tab that has been idle for an hour should not show an
    // hour-old answer.
    const onFocus = () => check();
    window.addEventListener("focus", onFocus);

    return () => {
      alive = false;
      clearInterval(timer);
      window.removeEventListener("focus", onFocus);
    };
  }, []);

  const label = health === null ? "Checking…" : health.status === "live" ? "Live" : "Offline";
  const dot =
    health === null ? "bg-line-strong" : health.status === "live" ? "bg-live" : "bg-danger";

  return (
    <span
      className={`inline-flex items-center gap-2 text-xs text-muted ${className}`}
      role="status"
      aria-live="polite"
      title={health?.detail ?? undefined}
    >
      <span className={`h-2 w-2 shrink-0 rounded-full ${dot}`} aria-hidden />
      <span>
        Higgsfield API Status: <span className="font-medium text-ink">{label}</span>
        {health?.detail && health.status === "offline" ? ` · ${health.detail}` : ""}
      </span>
    </span>
  );
}
