import Link from "next/link";
import type { ReactNode } from "react";
import { SiteFooter } from "@/components/SiteFooter";

// The narrow, centred frame every sign-in style page shares: wordmark up top,
// one column of content, the site footer below. Keeps /login,
// /forgot-password and /reset-password looking like one flow.
export function AuthShell({
  label,
  title,
  intro,
  children,
}: {
  label: string;
  title: string;
  intro?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="min-h-screen flex flex-col">
      {/* Signing in is a stage of the site, not a trapdoor: the marketing
          pages stay reachable from here without a back button. */}
      <header className="flex items-center justify-between gap-4 px-6 md:px-10 py-5 border-b border-line">
        <Link href="/" className="flex items-center gap-3 w-fit">
          <span className="rec-dot" aria-hidden />
          <span className="font-semibold tracking-tight text-lg">
            Reel<span className="text-primary">form</span>
          </span>
        </Link>
        <nav className="flex items-center gap-5">
          <Link href="/showcase" className="text-sm text-muted hover:text-ink transition-colors">
            Showcase
          </Link>
          <Link href="/pricing" className="text-sm text-muted hover:text-ink transition-colors">
            Pricing
          </Link>
        </nav>
      </header>

      <main id="main" className="flex-1 flex items-center justify-center px-6 py-16">
        <div className="w-full max-w-md">
          <p className="mono-label">{label}</p>
          <h1 className="mt-3 text-4xl font-medium tracking-tight">{title}</h1>
          {intro && <p className="mt-2 text-muted">{intro}</p>}
          {children}
        </div>
      </main>

      <SiteFooter />
    </div>
  );
}
