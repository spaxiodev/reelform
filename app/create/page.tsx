import { redirect } from "next/navigation";
import Link from "next/link";
import { AccountBadge } from "@/components/AccountBadge";
import { createSupabaseServer } from "@/lib/supabase/server";
import { isAdminUser } from "@/lib/admin";
import { CreateFlow } from "@/components/CreateFlow";
import { SiteFooter } from "@/components/SiteFooter";
import { PRIVATE_PAGE } from "@/lib/seo";

export const metadata = { title: "Create a website", ...PRIVATE_PAGE };

export default async function CreatePage() {
  const supabase = await createSupabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // The whole point of the entry flow: "Start building" lands here, and anyone
  // without an account is sent to sign up and returned straight back.
  if (!user) redirect("/login?mode=signup&next=%2Fcreate");

  const { data: profile } = await supabase
    .from("profiles")
    .select("free_site_used")
    .eq("id", user.id)
    .single();

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
            My projects
          </Link>
          <AccountBadge />
        </nav>
      </header>

      <main id="main" className="flex-1 px-6 md:px-10 py-12 md:py-16 max-w-4xl mx-auto w-full">
        <CreateFlow isFirstBuild={!profile?.free_site_used} isAdmin={isAdminUser(user.id)} />
      </main>

      <SiteFooter />
    </div>
  );
}
