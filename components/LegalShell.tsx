import Link from "next/link";
import type { ReactNode } from "react";
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
      <header className="flex items-center justify-between px-6 md:px-10 py-5 border-b border-line">
        <Link href="/" className="flex items-center gap-3">
          <span className="rec-dot" aria-hidden />
          <span className="font-semibold tracking-tight text-lg">
            Reel<span className="text-primary">form</span>
          </span>
        </Link>
        <nav className="flex items-center gap-6">
          <Link href="/pricing" className="text-sm text-muted hover:text-ink transition-colors">
            Pricing
          </Link>
          <Link href="/login" className="text-sm text-muted hover:text-ink transition-colors">
            Sign in
          </Link>
        </nav>
      </header>

      <main className="flex-1 px-6 md:px-10 py-16 max-w-3xl mx-auto w-full">
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
