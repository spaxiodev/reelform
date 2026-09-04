import Link from "next/link";
import type { ReactNode } from "react";
import { BrandMark } from "@/components/BrandMark";

/**
 * The header worn by every signed-in screen: dashboard, account and create.
 *
 * All three used to build the same row inline, and all three ran off the side
 * of a phone once the logo, two or three section links and an identity had to
 * share 390px. The shape here is the one the marketing header uses: the logo
 * and the persistent controls hold the top row at every width, and the section
 * links drop to a row of their own below `sm` rather than disappearing behind a
 * menu the visitor has to find.
 */
export function AppHeader({
  links,
  children,
}: {
  /** Section links: inline on desktop, a second row on phones. */
  links: { href: string; label: string }[];
  /** Always-visible controls, e.g. the account badge and sign-out. */
  children?: ReactNode;
}) {
  const linkCls = "text-sm text-muted hover:text-ink transition-colors";

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
          {children}
        </nav>
      </div>

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
