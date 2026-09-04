import Link from "next/link";
import { AccountBadge } from "@/components/AccountBadge";
import { createSupabaseServer } from "@/lib/supabase/server";
import { BrandMark } from "@/components/BrandMark";

// Shared marketing-page header. Reads the session server-side so a signed-in
// member never sees "Sign in / Start free" after clicking the logo, and so the
// way back into the app — dashboard and account — is one click from any
// marketing or legal page rather than only from inside the app.
//
// Below `sm` the whole row won't fit: logo, section links, an identity and a
// call to action come to well over 390px, and the old single row simply ran
// off the side of the screen. So the section links drop to their own row
// underneath, which keeps every destination reachable without hiding anything
// behind a menu button.
export async function SiteHeader() {
  const supabase = await createSupabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const linkCls = "text-sm text-muted hover:text-ink transition-colors";

  // Signed-in members get the two ways back into the app ahead of the
  // marketing links; signed-out visitors get the marketing links and sign-in.
  const links = user
    ? [
        { href: "/dashboard", label: "Dashboard" },
        { href: "/showcase", label: "Showcase" },
        { href: "/pricing", label: "Pricing" },
      ]
    : [
        { href: "/showcase", label: "Showcase" },
        { href: "/pricing", label: "Pricing" },
        { href: "/login", label: "Sign in" },
      ];

  return (
    <header className="bg-bg border-b border-line">
      <div className="flex items-center justify-between gap-3 px-5 md:px-10 py-4 md:py-5">
        <Link href="/" className="flex items-center gap-3 shrink-0">
          <BrandMark />
          <span className="font-semibold tracking-tight text-lg">
            Reel<span className="text-primary">form</span>
          </span>
        </Link>
        <nav className="flex items-center gap-4 sm:gap-6">
          {links.map((l) => (
            <Link key={l.href} href={l.href} className={`hidden sm:inline ${linkCls}`}>
              {l.label}
            </Link>
          ))}
          {user && <AccountBadge />}
          <Link href="/create" className="btn-primary !py-2 !px-3.5 sm:!px-4 !text-xs sm:!text-sm">
            {/* "Start building" is 150px of uppercase on a 390px screen. */}
            <span className="sm:hidden">Start</span>
            <span className="hidden sm:inline">Start building</span>
          </Link>
        </nav>
      </div>

      {/* Phone-only second row for the links dropped above. The account badge
          stays in the top row: on a phone it is the identity, not a link. */}
      <nav className="flex items-center gap-5 px-5 pb-3 sm:hidden">
        {links.map((l) => (
          <Link key={l.href} href={l.href} className={linkCls}>
            {l.label}
          </Link>
        ))}
      </nav>
    </header>
  );
}
