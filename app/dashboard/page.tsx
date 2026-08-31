import Link from "next/link";
import { AccountBadge } from "@/components/AccountBadge";
import { PRIVATE_PAGE } from "@/lib/seo";
import { redirect } from "next/navigation";
import { createSupabaseServer } from "@/lib/supabase/server";
import { NewProjectButton, SignOutButton } from "@/components/DashboardActions";
import { PortalButton } from "@/components/CheckoutButton";
import { SiteFooter } from "@/components/SiteFooter";
import { ReferenceReel } from "@/components/ReferenceReel";

export const metadata = { title: "Dashboard", ...PRIVATE_PAGE };

const STATUS: Record<string, { label: string; cls: string }> = {
  none: { label: "Pre-production", cls: "bg-bg-raise text-faint" },
  queued: { label: "Rendering video", cls: "bg-primary-soft text-primary-deep" },
  running: { label: "Rendering video", cls: "bg-primary-soft text-primary-deep" },
  succeeded: { label: "Footage ready", cls: "bg-primary-soft text-primary-deep" },
  failed: { label: "Video failed", cls: "bg-danger/10 text-danger" },
};

export default async function DashboardPage() {
  const supabase = await createSupabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [{ data: profile }, { data: projects }] = await Promise.all([
    supabase.from("profiles").select("credits, plan, plan_status").eq("id", user.id).single(),
    supabase
      .from("projects")
      .select("id, name, industry, video_status, site_html, updated_at")
      .order("updated_at", { ascending: false }),
  ]);

  const liveCount = projects?.filter((p) => p.site_html).length ?? 0;
  const plan = profile?.plan ?? "free";

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
          <Link href="/showcase" className="text-sm text-muted hover:text-ink transition-colors">
            Showcase
          </Link>
          <Link href="/pricing" className="text-sm text-muted hover:text-ink transition-colors">
            Pricing
          </Link>
          <AccountBadge />
          <SignOutButton />
        </nav>
      </header>

      <main id="main" className="flex-1 px-6 md:px-10 py-10 max-w-6xl mx-auto w-full">
        <div className="flex flex-wrap items-end justify-between gap-6">
          <div>
            <p className="mono-label">YOUR STUDIO</p>
            <h1 className="mt-2 text-4xl md:text-5xl font-medium tracking-tight">Productions</h1>
          </div>
          <NewProjectButton />
        </div>

        {/* Stats row */}
        <div className="mt-8 grid sm:grid-cols-3 gap-4">
          <div className="card p-6">
            <p className="mono-label">CREDIT BALANCE</p>
            <p className="mt-2 text-3xl font-medium">{profile?.credits?.toLocaleString() ?? 0}</p>
            <Link href="/pricing" className="mt-2 inline-block text-sm font-medium text-primary hover:text-primary-deep">
              Top up →
            </Link>
          </div>
          <div className="card p-6">
            <p className="mono-label">PLAN</p>
            <p className="mt-2 text-3xl font-medium capitalize">
              {plan}
              {profile?.plan_status && profile.plan_status !== "active" && (
                <span className="ml-2 text-sm text-danger align-middle capitalize">{profile.plan_status}</span>
              )}
            </p>
            {plan === "free" ? (
              <Link href="/pricing" className="mt-2 inline-block text-sm font-medium text-primary hover:text-primary-deep">
                Upgrade →
              </Link>
            ) : (
              <PortalButton className="mt-2 inline-block text-sm font-medium text-primary hover:text-primary-deep">
                Manage billing →
              </PortalButton>
            )}
          </div>
          <div className="card p-6">
            <p className="mono-label">SITES SHIPPED</p>
            <p className="mt-2 text-3xl font-medium">
              {liveCount}
              <span className="text-base text-faint font-normal"> of {projects?.length ?? 0}</span>
            </p>
            <p className="mt-2 text-sm text-faint">productions with a live cut</p>
          </div>
        </div>

        {/* Projects */}
        {!projects || projects.length === 0 ? (
          <div className="mt-10 card p-10 md:p-14">
            <div className="max-w-xl">
              <p className="mono-label !text-primary">FIRST TAKE</p>
              <h2 className="mt-2 text-3xl font-medium tracking-tight">
                Your set is ready. Roll camera.
              </h2>
              <p className="mt-3 text-muted leading-relaxed">
                A production takes about two minutes end-to-end: describe your business, direct a
                cinematic hero video, approve the footage, and Claude builds the site around it.
              </p>
              <ol className="mt-6 space-y-3">
                {[
                  "Describe the website — who it's for and what it should say",
                  "Direct the video — Seedance renders it while you watch",
                  "Send to Claude — a complete site, streamed in live",
                ].map((step, i) => (
                  <li key={i} className="flex items-start gap-3 text-sm text-muted">
                    <span className="mt-0.5 w-5 h-5 rounded-full bg-primary-soft text-primary-deep text-xs font-bold flex items-center justify-center shrink-0">
                      {i + 1}
                    </span>
                    {step}
                  </li>
                ))}
              </ol>
              <div className="mt-8">
                <NewProjectButton />
              </div>
            </div>
          </div>
        ) : (
          <div className="mt-10 grid md:grid-cols-2 lg:grid-cols-3 gap-4">
            {projects.map((p) => {
              const status = p.site_html
                ? { label: "Live cut", cls: "bg-primary text-white" }
                : STATUS[p.video_status] ?? STATUS.none;
              return (
                <Link key={p.id} href={`/studio/${p.id}`} className="card p-6 hover:border-primary/50 transition-colors group">
                  <span className={`inline-block text-xs font-bold px-2.5 py-1 rounded-lg ${status.cls}`}>
                    {status.label}
                  </span>
                  <h3 className="mt-4 text-xl font-medium tracking-tight group-hover:text-primary transition-colors">
                    {p.name}
                  </h3>
                  <p className="mt-1 text-sm text-faint">{p.industry ?? "No industry set"}</p>
                  <p className="mt-5 text-xs text-faint">
                    Updated{" "}
                    {new Date(p.updated_at).toLocaleDateString(undefined, {
                      month: "short",
                      day: "numeric",
                      year: "numeric",
                    })}
                  </p>
                </Link>
              );
            })}
          </div>
        )}
      </main>

      {/* Inspiration reel — same reference footage as the home page */}
      <ReferenceReel
        eyebrow="INSPIRATION — SHOT ON REELFORM"
        title="Need a starting point? Steal a shot."
        subtitle="Reference footage generated with Seedance — study the mood, motion and lighting, then direct your own take in the studio."
        action={
          <Link
            href="/showcase"
            className="text-sm font-medium text-primary-soft hover:text-white transition-colors"
          >
            Browse finished sites in the showcase →
          </Link>
        }
      />

      <SiteFooter />
    </div>
  );
}
