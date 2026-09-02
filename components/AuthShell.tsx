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
      <header className="px-6 md:px-10 py-5 border-b border-line">
        <Link href="/" className="flex items-center gap-3 w-fit">
          <span className="rec-dot" aria-hidden />
          <span className="font-semibold tracking-tight text-lg">
            Reel<span className="text-primary">form</span>
          </span>
        </Link>
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
