"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS = [
  { href: "/account", label: "Overview" },
  { href: "/account/billing", label: "Billing & invoices" },
  { href: "/account/credits", label: "Credits & activity" },
  { href: "/account/security", label: "Security" },
];

export function AccountNav() {
  const pathname = usePathname();

  return (
    <nav aria-label="Account sections" className="flex md:flex-col gap-1 overflow-x-auto md:overflow-visible -mx-1 px-1">
      {TABS.map((tab) => {
        const active = pathname === tab.href;
        return (
          <Link
            key={tab.href}
            href={tab.href}
            aria-current={active ? "page" : undefined}
            className={`whitespace-nowrap rounded-xl px-4 py-2.5 text-sm font-medium transition-colors ${
              active
                ? "bg-primary-soft text-primary-deep"
                : "text-muted hover:text-ink hover:bg-bg"
            }`}
          >
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}
