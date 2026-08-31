import Link from "next/link";
import { PRIVATE_PAGE } from "@/lib/seo";
import { redirect } from "next/navigation";
import { createSupabaseServer } from "@/lib/supabase/server";
import { LEDGER_REASONS, ledgerLabel } from "@/lib/ledger";
import { ROLLOVER_MONTHS } from "@/lib/pricing";

export const metadata = { title: "Credits & activity", ...PRIVATE_PAGE };

const PAGE_SIZE = 50;

export default async function CreditsPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; type?: string }>;
}) {
  const { page: pageParam, type } = await searchParams;
  const page = Math.max(1, parseInt(pageParam ?? "1", 10) || 1);
  const filter = type && type in LEDGER_REASONS ? type : null;

  const supabase = await createSupabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/account/credits");

  let query = supabase
    .from("credit_ledger")
    .select("id, delta, reason, created_at", { count: "exact" })
    .order("created_at", { ascending: false })
    .range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1);
  if (filter) query = query.eq("reason", filter);

  const [{ data: profile }, { data: ledger, count }, { data: allDeltas }] = await Promise.all([
    supabase.from("profiles").select("credits, subscription_credits").eq("id", user.id).single(),
    query,
    supabase.from("credit_ledger").select("delta"),
  ]);

  const earned = allDeltas?.filter((l) => l.delta > 0).reduce((s, l) => s + l.delta, 0) ?? 0;
  const spent = allDeltas?.filter((l) => l.delta < 0).reduce((s, l) => s - l.delta, 0) ?? 0;
  const totalPages = Math.max(1, Math.ceil((count ?? 0) / PAGE_SIZE));
  const expiring = profile?.subscription_credits ?? 0;

  const pageHref = (p: number) =>
    `/account/credits?page=${p}${filter ? `&type=${filter}` : ""}`;

  return (
    <div className="space-y-4">
      {/* Balance summary */}
      <div className="grid sm:grid-cols-3 gap-4">
        <div className="card p-6">
          <p className="mono-label">AVAILABLE</p>
          <p className="mt-2 text-3xl font-medium tabular-nums">
            {profile?.credits?.toLocaleString() ?? 0}
          </p>
          {/* Plan credits roll over for one month; top-ups never expire. Worth
              stating alongside the balance rather than only in the terms. */}
          {expiring > 0 && (
            <p className="mt-1 text-sm text-faint">
              {expiring.toLocaleString()} from your plan, spent first and kept for up to{" "}
              {ROLLOVER_MONTHS} months
            </p>
          )}
          <Link href="/pricing" className="mt-1 inline-block text-sm font-medium text-primary hover:text-primary-deep">
            Top up →
          </Link>
        </div>
        <div className="card p-6">
          <p className="mono-label">LIFETIME EARNED</p>
          <p className="mt-2 text-3xl font-medium tabular-nums">{earned.toLocaleString()}</p>
          <p className="mt-1 text-sm text-faint">bonuses, plans &amp; top-ups</p>
        </div>
        <div className="card p-6">
          <p className="mono-label">LIFETIME SPENT</p>
          <p className="mt-2 text-3xl font-medium tabular-nums">{spent.toLocaleString()}</p>
          <p className="mt-1 text-sm text-faint">videos &amp; site builds</p>
        </div>
      </div>

      {/* Full ledger */}
      <section className="card p-6 md:p-8">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <h2 className="text-xl font-medium tracking-tight">All credit activity</h2>
          <p className="text-sm text-faint">
            {count ?? 0} {filter ? ledgerLabel(filter).toLowerCase() : ""} transaction
            {(count ?? 0) === 1 ? "" : "s"}
          </p>
        </div>

        {/* Filters */}
        <div className="mt-4 flex flex-wrap gap-2">
          <Link
            href="/account/credits"
            className={`text-xs font-bold px-3 py-1.5 rounded-lg transition-colors ${
              !filter ? "bg-primary text-white" : "bg-bg-raise text-muted hover:text-ink"
            }`}
          >
            All
          </Link>
          {Object.entries(LEDGER_REASONS).map(([key, label]) => (
            <Link
              key={key}
              href={`/account/credits?type=${key}`}
              className={`text-xs font-bold px-3 py-1.5 rounded-lg transition-colors ${
                filter === key ? "bg-primary text-white" : "bg-bg-raise text-muted hover:text-ink"
              }`}
            >
              {label}
            </Link>
          ))}
        </div>

        {!ledger || ledger.length === 0 ? (
          <p className="mt-6 py-6 text-center text-sm text-faint">
            No {filter ? `${ledgerLabel(filter).toLowerCase()} ` : ""}activity yet.
          </p>
        ) : (
          <ul className="mt-5 divide-y divide-line">
            {ledger.map((entry) => (
              <li key={entry.id} className="py-3.5 flex items-center justify-between gap-4">
                <div>
                  <p className="text-sm">{ledgerLabel(entry.reason)}</p>
                  <p className="text-xs text-faint">
                    {new Date(entry.created_at).toLocaleDateString(undefined, {
                      month: "short",
                      day: "numeric",
                      year: "numeric",
                    })}{" "}
                    ·{" "}
                    {new Date(entry.created_at).toLocaleTimeString(undefined, {
                      hour: "2-digit",
                      minute: "2-digit",
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

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="mt-6 pt-4 border-t border-line flex items-center justify-between">
            {page > 1 ? (
              <Link href={pageHref(page - 1)} className="btn-ghost !py-2 !px-4 text-sm">
                ← Newer
              </Link>
            ) : (
              <span />
            )}
            <p className="text-sm text-faint">
              Page {page} of {totalPages}
            </p>
            {page < totalPages ? (
              <Link href={pageHref(page + 1)} className="btn-ghost !py-2 !px-4 text-sm">
                Older →
              </Link>
            ) : (
              <span />
            )}
          </div>
        )}
      </section>

      <p className="text-xs text-faint px-1">
        Credits from failed generations are refunded automatically. Looking for money charges?
        They&apos;re under{" "}
        <Link href="/account/billing" className="text-primary hover:underline">
          Billing &amp; invoices
        </Link>
        .
      </p>
    </div>
  );
}
