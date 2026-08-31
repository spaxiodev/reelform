import Link from "next/link";
import { SiteFooter } from "@/components/SiteFooter";
import { StatusScreen } from "@/components/ui/StatusScreen";

export const metadata = {
  title: "Page not found",
  robots: { index: false, follow: true },
};

export default function NotFound() {
  return (
    <div className="flex flex-col min-h-screen">
      {/* Deliberately NOT <SiteHeader />. That component reads the session,
          which touches cookies — and because the root not-found renders into
          every route's shell, one cookie read here forces the whole site to
          render dynamically. This static header keeps the marketing and legal
          pages prerendered. */}
      <header className="flex items-center justify-between px-6 md:px-10 py-5 border-b border-line">
        <Link href="/" className="flex items-center gap-3">
          <span className="rec-dot" aria-hidden />
          <span className="font-semibold tracking-tight text-lg">
            Reel<span className="text-primary">form</span>
          </span>
        </Link>
        <nav className="flex items-center gap-6">
          <Link href="/showcase" className="text-sm text-muted hover:text-ink transition-colors">
            Showcase
          </Link>
          <Link href="/pricing" className="text-sm text-muted hover:text-ink transition-colors">
            Pricing
          </Link>
          <Link href="/dashboard" className="btn-primary !py-2 !px-4 text-sm">
            Open studio
          </Link>
        </nav>
      </header>

      <StatusScreen
        code="404"
        eyebrow="TAKE NOT FOUND"
        title="This one ended up on the cutting-room floor."
        body={
          <>
            The page you asked for doesn&apos;t exist — it may have been renamed, unpublished, or
            the link may have a typo in it.
          </>
        }
        actions={
          <>
            <Link href="/" className="btn-primary">
              Back to home
            </Link>
            <Link href="/showcase" className="btn-ghost">
              Browse the showcase
            </Link>
          </>
        }
        detail={
          <>
            Looking for your own work? It&apos;s all in your{" "}
            <Link href="/dashboard" className="text-primary underline underline-offset-2">
              dashboard
            </Link>
            .
          </>
        }
      />
      <SiteFooter />
    </div>
  );
}
