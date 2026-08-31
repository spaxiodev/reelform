import Link from "next/link";
import { AccountBadge } from "@/components/AccountBadge";
import { createSupabaseServer } from "@/lib/supabase/server";

// Shared marketing-page header. Reads the session server-side so a signed-in
// member never sees "Sign in / Start free" after clicking the logo.
//
// Below `sm` the whole row won't fit: logo, two section links, an identity and
// a call to action come to well over 390px, and the old single row simply ran
// off the side of the screen. So the section links drop to their own row
// underneath, which keeps every destination reachable without hiding anything
// behind a menu button.
export async function SiteHeader() {
  const supabase = await createSupabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const linkCls = "text-sm text-muted hover:text-ink transition-colors";

  return (
    <header className="bg-bg border-b border-line">
      <div className="flex items-center justify-between gap-3 px-5 md:px-10 py-4 md:py-5">
        <Link href="/" className="flex items-center gap-3 shrink-0">
          <span className="rec-dot" aria-hidden />
          <span className="font-semibold tracking-tight text-lg">
            Reel<span className="text-primary">form</span>
          </span>
        </Link>
        <nav className="flex items-center gap-4 sm:gap-6">
          <Link href="/showcase" className={`hidden sm:inline ${linkCls}`}>
            Showcase
          </Link>
          <Link href="/pricing" className={`hidden sm:inline ${linkCls}`}>
            Pricing
          </Link>
          {user ? (
            <AccountBadge />
          ) : (
            <Link href="/login" className={`hidden sm:inline ${linkCls}`}>
              Sign in
            </Link>
          )}
          <Link href="/create" className="btn-primary !py-2 !px-3.5 sm:!px-4 !text-xs sm:!text-sm">
            {/* "Start building" is 150px of uppercase on a 390px screen. */}
            <span className="sm:hidden">Start</span>
            <span className="hidden sm:inline">Start building</span>
          </Link>
        </nav>
      </div>

      {/* Phone-only second row for the links dropped above. */}
      <nav className="flex items-center gap-5 px-5 pb-3 sm:hidden">
        <Link href="/showcase" className={linkCls}>
          Showcase
        </Link>
        <Link href="/pricing" className={linkCls}>
          Pricing
        </Link>
        {!user && (
          <Link href="/login" className={linkCls}>
            Sign in
          </Link>
        )}
      </nav>
    </header>
  );
}
