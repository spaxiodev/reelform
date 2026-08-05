import Link from "next/link";
import { createSupabaseServer } from "@/lib/supabase/server";

// Landing nav: two separate frosted pills (logo left, actions right) rather
// than one centered bar — a distinct layout, with a coral CTA instead of a
// black pill. Fixed so it floats over the scrubbing video hero.
export async function LandingNav() {
  const supabase = await createSupabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const ctaCls =
    "rounded-full bg-primary px-4 py-2 text-sm font-semibold text-white shadow-[0_4px_14px_rgba(221,79,38,0.35)] hover:bg-primary-deep transition-colors";
  const linkCls =
    "hidden sm:inline-flex rounded-full px-3.5 py-2 text-sm font-medium text-muted hover:text-ink hover:bg-black/[0.04] transition-colors";

  return (
    <header className="fixed inset-x-0 top-3 md:top-4 z-50 px-4">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-3">
        {/* Logo pill */}
        <Link
          href="/"
          className="glass-pill flex items-center gap-2.5 rounded-full px-4 py-2.5 md:px-5"
        >
          <span className="rec-dot" aria-hidden />
          <span className="font-semibold tracking-tight text-lg">
            Reel<span className="text-primary">form</span>
          </span>
        </Link>

        {/* Actions pill */}
        <nav className="glass-pill flex items-center gap-1 rounded-full px-1.5 py-1.5 sm:px-2">
          <Link href="/showcase" className={linkCls}>
            Showcase
          </Link>
          <Link href="/pricing" className={linkCls}>
            Pricing
          </Link>
          {user ? (
            <Link href="/dashboard" className={ctaCls}>
              Open studio
            </Link>
          ) : (
            <>
              <Link href="/login" className={linkCls}>
                Log in
              </Link>
              <Link href="/login?mode=signup" className={ctaCls}>
                Get started
              </Link>
            </>
          )}
        </nav>
      </div>
    </header>
  );
}
