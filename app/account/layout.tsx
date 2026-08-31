import { AppHeader } from "@/components/AppHeader";
import type { ReactNode } from "react";
import { SignOutButton } from "@/components/DashboardActions";
import { AccountNav } from "@/components/AccountNav";
import { SiteFooter } from "@/components/SiteFooter";

export default function AccountLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen flex flex-col bg-bg-raise">
      <AppHeader
        links={[
          { href: "/dashboard", label: "Dashboard" },
          { href: "/pricing", label: "Pricing" },
        ]}
      >
        <SignOutButton />
      </AppHeader>

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
