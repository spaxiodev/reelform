import { getStripe } from "./stripe";

// Unified payment history for the account pages: Stripe invoices
// (subscriptions + top-ups with invoice_creation) merged with any bare
// charges (legacy top-ups made before invoice_creation was enabled).

export interface BillingItem {
  id: string;
  created: number; // unix seconds
  description: string;
  amountCents: number;
  currency: string;
  status: "paid" | "refunded" | "open" | "failed" | string;
  invoicePdf: string | null; // direct PDF download
  hostedUrl: string | null; // hosted invoice / receipt page
}

export interface BillingHistory {
  items: BillingItem[];
  totalSpentCents: number; // succeeded payments minus refunds
  currency: string;
}

export async function getBillingHistory(customerId: string): Promise<BillingHistory | null> {
  try {
    const stripe = getStripe();
    const [invoices, charges] = await Promise.all([
      stripe.invoices.list({ customer: customerId, limit: 100, expand: ["data.payments"] }),
      stripe.charges.list({ customer: customerId, limit: 100 }),
    ]);

    const items: BillingItem[] = [];
    let totalSpentCents = 0;
    let currency = "usd";

    // Payment intents already represented by an invoice, used to skip the
    // matching bare charges below so nothing is double counted.
    const invoicedPaymentIntents = new Set<string>();
    for (const inv of invoices.data) {
      const payments = (
        inv as unknown as {
          payments?: { data?: { payment?: { payment_intent?: string | { id: string } } }[] };
        }
      ).payments;
      for (const p of payments?.data ?? []) {
        const pi = p.payment?.payment_intent;
        if (typeof pi === "string") invoicedPaymentIntents.add(pi);
        else if (pi?.id) invoicedPaymentIntents.add(pi.id);
      }
    }

    for (const inv of invoices.data) {
      if (inv.status === "draft" || inv.status === "void") continue;
      const paid = inv.status === "paid";
      if (paid) {
        totalSpentCents += inv.amount_paid;
        currency = inv.currency;
      }
      items.push({
        id: inv.id ?? "",
        created: inv.created,
        description:
          inv.lines?.data?.[0]?.description ??
          (inv.billing_reason === "subscription_cycle" ? "Plan renewal" : "Reelform purchase"),
        amountCents: paid ? inv.amount_paid : inv.amount_due,
        currency: inv.currency,
        status: inv.status ?? "open",
        invoicePdf: inv.invoice_pdf ?? null,
        hostedUrl: inv.hosted_invoice_url ?? null,
      });
    }

    // Charges without an invoice (top-ups made before invoice_creation).
    for (const ch of charges.data) {
      const chPi = typeof ch.payment_intent === "string" ? ch.payment_intent : ch.payment_intent?.id;
      if (chPi && invoicedPaymentIntents.has(chPi)) continue;
      if (ch.status !== "succeeded") continue;
      const net = ch.amount - ch.amount_refunded;
      totalSpentCents += net;
      currency = ch.currency;
      items.push({
        id: ch.id,
        created: ch.created,
        description: ch.description ?? "Credit top-up",
        amountCents: ch.amount,
        currency: ch.currency,
        status: ch.refunded ? "refunded" : "paid",
        invoicePdf: null,
        hostedUrl: ch.receipt_url ?? null,
      });
    }

    items.sort((a, b) => b.created - a.created);
    return { items, totalSpentCents, currency };
  } catch {
    // Stripe not configured or API error, the page degrades gracefully.
    return null;
  }
}

export function formatMoney(cents: number, currency = "usd"): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: currency.toUpperCase(),
  }).format(cents / 100);
}
