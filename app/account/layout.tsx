import Link from "next/link";
import type { ReactNode } from "react";
import { SignOutButton } from "@/components/DashboardActions";
import { AccountNav } from "@/components/AccountNav";
import { SiteFooter } from "@/components/SiteFooter";

export default function AccountLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen flex flex-col bg-bg-raise">
      <header className="bg-bg flex items-center justify-between px-6 md:px-10 py-5 border-b border-line">
        <Link href="/" className="flex items-center gap-3">
          <span className="rec-dot" aria-hidden />
          <span className="font-semibold tracking-tight text-lg">
            Reel<span className="text-primary">form</span>
          </span>
        </Link>
        <nav className="flex items-center gap-6">
          <Link href="/dashboard" className="text-sm text-muted hover:text-ink transition-colors">
            Dashboard
          </Link>
          <Link href="/pricing" className="text-sm text-muted hover:text-ink transition-colors">
            Pricing
          </Link>
          <SignOutButton />
        </nav>
      </header>

      <main id="main" className="flex-1 px-6 md:px-10 py-10 max-w-6xl mx-auto w-full">
        <p className="mono-label">YOUR ACCOUNT</p>
        <h1 className="mt-2 text-4xl md:text-5xl font-medium tracking-tight">Account</h1>

        <div className="mt-8 flex flex-col md:flex-row gap-6 md:gap-10 items-start">
          <aside className="w-full md:w-52 shrink-0 md:sticky md:top-8">
            <AccountNav />
          </aside>
          <div className="flex-1 min-w-0 w-full">{children}</div>
        </div>
      </main>

      <SiteFooter />
    </div>
  );
}
