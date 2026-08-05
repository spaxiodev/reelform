import Link from "next/link";
import { createSupabaseServer } from "@/lib/supabase/server";

// Shared marketing-page header. Reads the session server-side so a signed-in
// member never sees "Sign in / Start free" after clicking the logo.
export async function SiteHeader() {
  const supabase = await createSupabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return (
    <header className="bg-bg flex items-center justify-between px-6 md:px-10 py-5 border-b border-line">
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
        {user ? (
          <>
            <Link href="/account" className="text-sm text-muted hover:text-ink transition-colors">
              Account
            </Link>
            <Link href="/dashboard" className="btn-primary !py-2 !px-4 text-sm">
              Open studio
            </Link>
          </>
        ) : (
          <>
            <Link href="/login" className="text-sm text-muted hover:text-ink transition-colors">
              Sign in
            </Link>
            <Link href="/login?mode=signup" className="btn-primary !py-2 !px-4 text-sm">
              Start free
            </Link>
          </>
        )}
      </nav>
    </header>
  );
}
