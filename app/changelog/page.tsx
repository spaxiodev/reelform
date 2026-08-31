import Link from "next/link";
import { SiteHeader } from "@/components/SiteHeader";
import { SiteFooter } from "@/components/SiteFooter";
import { pageMeta } from "@/lib/seo";
import { RELEASES } from "@/lib/changelog";

export const metadata = pageMeta({
  title: "Changelog",
  description:
    "Everything we've shipped to Reelform — new capabilities, refinements and fixes, newest first.",
  path: "/changelog",
});

const KIND_STYLES: Record<string, { label: string; cls: string }> = {
  added: { label: "NEW", cls: "bg-primary text-white" },
  improved: { label: "BETTER", cls: "bg-primary-soft text-primary-deep" },
  fixed: { label: "FIXED", cls: "bg-bg-raise text-faint border border-line-strong" },
};

function formatDate(iso: string) {
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
}

export default function ChangelogPage() {
  return (
    <div className="flex flex-col min-h-screen">
      <SiteHeader />

      <main id="main" className="flex-1 px-6 md:px-10 py-16 max-w-3xl mx-auto w-full">
        <p className="mono-label">RELEASE LOG</p>
        <h1 className="mt-3 text-4xl md:text-6xl font-medium tracking-tight">Changelog</h1>
        <p className="mt-4 text-lg text-muted leading-relaxed">
          Everything we&apos;ve shipped, newest first. Have something you want to see here?{" "}
          <Link href="/contact" className="text-primary underline underline-offset-2">
            Tell us
          </Link>
          .
        </p>

        <ol className="mt-14 space-y-14">
          {RELEASES.map((release) => (
            <li key={release.version} className="relative">
              {/* Version rail — the marker and the line down to the next entry */}
              <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
                <h2 className="text-2xl font-medium tracking-tight">{release.title}</h2>
                <span className="rounded-full bg-bg-raise border border-line px-2.5 py-0.5 font-mono text-xs font-semibold text-muted">
                  v{release.version}
                </span>
                <time dateTime={release.date} className="text-sm text-faint">
                  {formatDate(release.date)}
                </time>
              </div>

              <ul className="mt-5 space-y-3">
                {release.changes.map((change, i) => {
                  const style = KIND_STYLES[change.kind];
                  return (
                    <li key={i} className="flex items-start gap-3">
                      {/* Fixed width so NEW / BETTER / FIXED all start their
                          text on the same column instead of stepping in and out. */}
                      <span
                        className={`mt-0.5 w-16 shrink-0 rounded py-0.5 text-center text-[0.6rem] font-bold tracking-widest ${style.cls}`}
                      >
                        {style.label}
                      </span>
                      <p className="text-[0.95rem] text-muted leading-relaxed">{change.text}</p>
                    </li>
                  );
                })}
              </ul>
            </li>
          ))}
        </ol>
      </main>

      <SiteFooter />
    </div>
  );
}
