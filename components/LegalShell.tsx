import type { ReactNode } from "react";
import { SiteHeader } from "@/components/SiteHeader";
import { SiteFooter } from "@/components/SiteFooter";

export function LegalShell({
  label,
  title,
  updated,
  children,
}: {
  label: string;
  title: string;
  updated?: string;
  children: ReactNode;
}) {
  return (
    <div className="min-h-screen flex flex-col">
      {/* Session-aware, so the legal and support pages are not a dead end:
          a signed-in reader gets their account and dashboard back rather than
          a "Sign in" link they have no use for. */}
      <SiteHeader />

      <main id="main" className="flex-1 px-6 md:px-10 py-16 max-w-3xl mx-auto w-full">
        <p className="mono-label">{label}</p>
        <h1 className="mt-3 text-4xl md:text-5xl font-medium tracking-tight">{title}</h1>
        {updated && <p className="mt-3 text-sm text-faint">Last updated: {updated}</p>}
        <div className="legal-body mt-10 space-y-8">{children}</div>
      </main>

      <SiteFooter />
    </div>
  );
}

export function LegalSection({ heading, children }: { heading: string; children: ReactNode }) {
  return (
    <section>
      <h2 className="text-xl font-medium tracking-tight">{heading}</h2>
      <div className="mt-3 space-y-3 text-muted leading-relaxed text-[0.95rem]">{children}</div>
    </section>
  );
}
