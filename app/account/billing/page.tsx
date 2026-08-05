import Link from "next/link";
import { redirect } from "next/navigation";
import { createSupabaseServer } from "@/lib/supabase/server";
import { PortalButton } from "@/components/CheckoutButton";
import { PLANS } from "@/lib/pricing";
import { getBillingHistory, formatMoney } from "@/lib/billing";

export const metadata = { title: "Billing & invoices — Reelform" };

const STATUS_STYLES: Record<string, string> = {
  paid: "bg-primary-soft text-primary-deep",
  refunded: "bg-bg-raise text-faint",
  open: "bg-danger/10 text-danger",
  uncollectible: "bg-danger/10 text-danger",
};

export default async function BillingPage() {
  const supabase = await createSupabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/account/billing");

  const { data: profile } = await supabase
    .from("profiles")
    .select("plan, plan_status, stripe_customer_id")
    .eq("id", user.id)
    .single();

  const billing = profile?.stripe_customer_id
    ? await getBillingHistory(profile.stripe_customer_id)
    : null;

  const plan = profile?.plan ?? "free";
  const planInfo = PLANS.find((p) => p.id === plan);
  const paidCount = billing?.items.filter((i) => i.status === "paid").length ?? 0;

  return (
    <div className="space-y-4">
      {/* Plan & subscription */}
      <section className="card p-6 md:p-8">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h2 className="text-xl font-medium tracking-tight">Plan &amp; subscription</h2>
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
              <PortalButton className="btn-primary">Manage subscription</PortalButton>
            )}
          </div>
        </div>
        {profile?.stripe_customer_id && (
          <p className="mt-4 text-xs text-faint">
            Payment methods, plan changes, and cancellation are handled securely in the Stripe
            billing portal.
          </p>
        )}
      </section>

      {/* Spend summary */}
      <div className="grid sm:grid-cols-2 gap-4">
        <div className="card p-6">
          <p className="mono-label">TOTAL SPENT</p>
          <p className="mt-2 text-3xl font-medium tabular-nums">
            {billing ? formatMoney(billing.totalSpentCents, billing.currency) : "$0.00"}
          </p>
          <p className="mt-1 text-sm text-faint">across all payments, minus refunds</p>
        </div>
        <div className="card p-6">
          <p className="mono-label">PAYMENTS</p>
          <p className="mt-2 text-3xl font-medium tabular-nums">{paidCount}</p>
          <p className="mt-1 text-sm text-faint">successful charges on your account</p>
        </div>
      </div>

      {/* Payment history */}
      <section className="card p-6 md:p-8">
        <h2 className="text-xl font-medium tracking-tight">Payment history</h2>
        <p className="mt-2 text-sm text-muted">
          Every charge on your account. Download a PDF invoice or view the receipt for any payment.
        </p>

        {!profile?.stripe_customer_id || !billing || billing.items.length === 0 ? (
          <div className="mt-6 py-8 text-center">
            <p className="text-sm text-faint">
              {profile?.stripe_customer_id && billing === null
                ? "Billing history is temporarily unavailable — please try again shortly."
                : "No payments yet. Your charges and invoices will appear here after your first purchase."}
            </p>
            <Link href="/pricing" className="mt-4 inline-block btn-ghost">
              See plans &amp; top-ups
            </Link>
          </div>
        ) : (
          <div className="mt-5 overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left border-b border-line">
                  <th className="mono-label font-normal py-2.5 pr-4">DATE</th>
                  <th className="mono-label font-normal py-2.5 pr-4">DESCRIPTION</th>
                  <th className="mono-label font-normal py-2.5 pr-4">AMOUNT</th>
                  <th className="mono-label font-normal py-2.5 pr-4">STATUS</th>
                  <th className="mono-label font-normal py-2.5 text-right">INVOICE</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {billing.items.map((item) => (
                  <tr key={item.id}>
                    <td className="py-3.5 pr-4 whitespace-nowrap text-muted">
                      {new Date(item.created * 1000).toLocaleDateString(undefined, {
                        month: "short",
                        day: "numeric",
                        year: "numeric",
                      })}
                    </td>
                    <td className="py-3.5 pr-4">{item.description}</td>
                    <td className="py-3.5 pr-4 tabular-nums font-medium whitespace-nowrap">
                      {formatMoney(item.amountCents, item.currency)}
                    </td>
                    <td className="py-3.5 pr-4">
                      <span
                        className={`inline-block text-xs font-bold px-2.5 py-1 rounded-lg capitalize ${
                          STATUS_STYLES[item.status] ?? "bg-bg-raise text-faint"
                        }`}
                      >
                        {item.status}
                      </span>
                    </td>
                    <td className="py-3.5 text-right whitespace-nowrap">
                      {item.invoicePdf ? (
                        <a
                          href={item.invoicePdf}
                          className="font-medium text-primary hover:text-primary-deep"
                        >
                          Download PDF
                        </a>
                      ) : item.hostedUrl ? (
                        <a
                          href={item.hostedUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="font-medium text-primary hover:text-primary-deep"
                        >
                          View receipt
                        </a>
                      ) : (
                        <span className="text-faint">—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <p className="text-xs text-faint px-1">
        Questions about a charge? See our{" "}
        <Link href="/refunds" className="text-primary hover:underline">
          Refund Policy
        </Link>{" "}
        or{" "}
        <Link href="/contact" className="text-primary hover:underline">
          contact us
        </Link>
        .
      </p>
    </div>
  );
}
