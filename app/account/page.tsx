import Link from "next/link";
import { PRIVATE_PAGE } from "@/lib/seo";
import { redirect } from "next/navigation";
import { createSupabaseServer } from "@/lib/supabase/server";
import { PortalButton } from "@/components/CheckoutButton";
import { PLANS } from "@/lib/pricing";
import { getBillingHistory, formatMoney } from "@/lib/billing";
import { ledgerLabel } from "@/lib/ledger";
import { ProfileSettings } from "@/components/ProfileSettings";
import { AvatarPicker } from "@/components/AvatarPicker";
import { FollowRequests } from "@/components/FollowRequests";

export const metadata = { title: "Account", ...PRIVATE_PAGE };

export default async function AccountOverviewPage() {
  const supabase = await createSupabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/account");

  const [{ data: profile }, { data: recent }, { count: projectCount }] = await Promise.all([
    supabase
      .from("profiles")
      .select(
        "email, username, full_name, is_private, avatar_url, credits, plan, plan_status, stripe_customer_id, created_at"
      )
      .eq("id", user.id)
      .single(),
    supabase
      .from("credit_ledger")
      .select("id, delta, reason, created_at")
      .order("created_at", { ascending: false })
      .limit(5),
    supabase.from("projects").select("id", { count: "exact", head: true }),
  ]);

  const billing = profile?.stripe_customer_id
    ? await getBillingHistory(profile.stripe_customer_id)
    : null;

  const plan = profile?.plan ?? "free";
  const planInfo = PLANS.find((p) => p.id === plan);

  return (
    <div className="space-y-4">
      {/* Stats */}
      <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="card p-5">
          <p className="mono-label">CREDITS</p>
          <p className="mt-2 text-2xl font-medium tabular-nums">
            {profile?.credits?.toLocaleString() ?? 0}
          </p>
          <Link href="/account/credits" className="mt-1 inline-block text-sm font-medium text-primary hover:text-primary-deep">
            View activity →
          </Link>
        </div>
        <div className="card p-5">
          <p className="mono-label">TOTAL SPENT</p>
          <p className="mt-2 text-2xl font-medium tabular-nums">
            {billing ? formatMoney(billing.totalSpentCents, billing.currency) : "$0.00"}
          </p>
          <Link href="/account/billing" className="mt-1 inline-block text-sm font-medium text-primary hover:text-primary-deep">
            View charges →
          </Link>
        </div>
        <div className="card p-5">
          <p className="mono-label">PRODUCTIONS</p>
          <p className="mt-2 text-2xl font-medium tabular-nums">{projectCount ?? 0}</p>
          <Link href="/dashboard" className="mt-1 inline-block text-sm font-medium text-primary hover:text-primary-deep">
            Open studio →
          </Link>
        </div>
        <div className="card p-5">
          <p className="mono-label">MEMBER SINCE</p>
          <p className="mt-2 text-2xl font-medium">
            {new Date(profile?.created_at ?? user.created_at).toLocaleDateString(undefined, {
              month: "short",
              year: "numeric",
            })}
          </p>
        </div>
      </div>

      {/* Pending follower requests (renders only when there are any) */}
      <FollowRequests userId={user.id} />

      {/* Public profile */}
      <section className="card p-6 md:p-8">
        <h2 className="text-xl font-medium tracking-tight">Public profile</h2>
        <p className="mt-2 text-sm text-muted">
          Your name and username appear on everything you publish to the showcase.
        </p>
        <div className="mt-5">
          <AvatarPicker
            userId={user.id}
            name={profile?.full_name ?? profile?.username ?? null}
            email={profile?.email ?? user.email ?? null}
            credits={profile?.credits ?? 0}
            plan={profile?.plan ?? null}
            initialAvatarUrl={profile?.avatar_url ?? null}
          />
        </div>
        <div className="mt-6 border-t border-line pt-6">
          <ProfileSettings
            userId={user.id}
            initialUsername={profile?.username ?? null}
            initialFullName={profile?.full_name ?? null}
            initialIsPrivate={profile?.is_private ?? false}
          />
        </div>
      </section>

      {/* Profile */}
      <section className="card p-6 md:p-8">
        <h2 className="text-xl font-medium tracking-tight">Profile</h2>
        <dl className="mt-5 grid sm:grid-cols-2 gap-x-8 gap-y-5">
          <div>
            <dt className="mono-label">EMAIL</dt>
            <dd className="mt-1 text-sm">{profile?.email ?? user.email}</dd>
          </div>
          <div>
            <dt className="mono-label">JOINED</dt>
            <dd className="mt-1 text-sm">
              {new Date(profile?.created_at ?? user.created_at).toLocaleDateString(undefined, {
                month: "long",
                day: "numeric",
                year: "numeric",
              })}
            </dd>
          </div>
          <div>
            <dt className="mono-label">USER ID</dt>
            <dd className="mt-1 text-sm text-faint break-all">{user.id}</dd>
          </div>
          <div>
            <dt className="mono-label">SECURITY</dt>
            <dd className="mt-1 text-sm">
              <Link href="/account/security" className="text-primary hover:text-primary-deep font-medium">
                Change password, sessions & account deletion →
              </Link>
            </dd>
          </div>
        </dl>
      </section>

      {/* Plan */}
      <section className="card p-6 md:p-8">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h2 className="text-xl font-medium tracking-tight">Current plan</h2>
            <p className="mt-2 text-sm text-muted">
              <span className="capitalize font-medium text-ink">{plan}</span>
              {planInfo && (
                <>
                  {" "}
                  — ${planInfo.priceUsd}/mo, {planInfo.creditsPerMonth.toLocaleString()} credits monthly
                </>
              )}
              {profile?.plan_status && profile.plan_status !== "active" && (
                <span className="ml-2 text-danger capitalize">({profile.plan_status})</span>
              )}
            </p>
          </div>
          <div className="flex gap-3">
            {plan === "free" ? (
              <Link href="/pricing" className="btn-primary">
                Upgrade
              </Link>
            ) : (
              <PortalButton className="btn-primary">Manage billing</PortalButton>
            )}
            <Link href="/account/billing" className="btn-ghost">
              Billing details
            </Link>
          </div>
        </div>
      </section>

      {/* Recent activity */}
      <section className="card p-6 md:p-8">
        <div className="flex items-center justify-between gap-4">
          <h2 className="text-xl font-medium tracking-tight">Recent credit activity</h2>
          <Link href="/account/credits" className="text-sm font-medium text-primary hover:text-primary-deep">
            View all →
          </Link>
        </div>
        {!recent || recent.length === 0 ? (
          <p className="mt-4 text-sm text-faint">No credit activity yet.</p>
        ) : (
          <ul className="mt-4 divide-y divide-line">
            {recent.map((entry) => (
              <li key={entry.id} className="py-3 flex items-center justify-between gap-4">
                <div>
                  <p className="text-sm">{ledgerLabel(entry.reason)}</p>
                  <p className="text-xs text-faint">
                    {new Date(entry.created_at).toLocaleDateString(undefined, {
                      month: "short",
                      day: "numeric",
                      year: "numeric",
                    })}
                  </p>
                </div>
                <span
                  className={`text-sm font-medium tabular-nums ${
                    entry.delta >= 0 ? "text-primary" : "text-ink"
                  }`}
                >
                  {entry.delta >= 0 ? "+" : ""}
                  {entry.delta.toLocaleString()}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
