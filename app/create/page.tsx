import { redirect } from "next/navigation";
import { AppHeader } from "@/components/AppHeader";
import { AccountBadge } from "@/components/AccountBadge";
import { createSupabaseServer } from "@/lib/supabase/server";
import { isAdminUser } from "@/lib/admin";
import { isSubscribed } from "@/lib/entitlements";
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
    .select("plan, plan_status, free_site_used, free_video_used")
    .eq("id", user.id)
    .single();

  return (
    <div className="min-h-screen flex flex-col bg-bg-raise">
      <AppHeader
        links={[
          { href: "/dashboard", label: "My projects" },
          { href: "/showcase", label: "Showcase" },
          { href: "/pricing", label: "Pricing" },
        ]}
      >
        <AccountBadge />
      </AppHeader>

      <main id="main" className="flex-1 px-6 md:px-10 py-12 md:py-16 max-w-4xl mx-auto w-full">
        <CreateFlow
          isFirstBuild={!profile?.free_site_used}
          isAdmin={isAdminUser(user.id)}
          pinnedShot={
            !isAdminUser(user.id) && !isSubscribed(profile) && !profile?.free_video_used
          }
        />
      </main>

      <SiteFooter />
    </div>
  );
}
