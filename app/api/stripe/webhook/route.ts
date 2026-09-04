import { NextResponse, type NextRequest } from "next/server";
import type Stripe from "stripe";
import { getStripe, planForPriceId } from "@/lib/stripe";
import { rolloverCap } from "@/lib/pricing";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { grantCredits, grantSubscriptionCredits } from "@/lib/credits";
import { sendTransactional } from "@/lib/email/send";
import { planCanceled, planRenewed, planStarted, topupReceipt } from "@/lib/email/templates";

// Stripe -> Reelform fulfillment.
//  - checkout.session.completed (mode=payment): credit top-up
//  - invoice.paid: subscription created or renewed -> set plan + grant monthly
//    credits, capped so unused ones cannot accrue forever
//  - customer.subscription.updated/deleted: keep plan status in sync
export async function POST(request: NextRequest) {
  const stripe = getStripe();
  const payload = await request.text();
  const signature = request.headers.get("stripe-signature");
  if (!signature) return NextResponse.json({ error: "Missing signature" }, { status: 400 });

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(payload, signature, process.env.STRIPE_WEBHOOK_SECRET!);
  } catch {
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  const admin = createSupabaseAdmin();

  async function balanceOf(userId: string): Promise<number> {
    const { data } = await admin.from("profiles").select("credits").eq("id", userId).single();
    return data?.credits ?? 0;
  }

  async function userIdForCustomer(customerId: string): Promise<string | null> {
    const { data } = await admin
      .from("profiles")
      .select("id")
      .eq("stripe_customer_id", customerId)
      .single();
    return data?.id ?? null;
  }

  switch (event.type) {
    case "checkout.session.completed": {
      const session = event.data.object;
      if (session.mode === "payment" && session.metadata?.kind === "topup") {
        const userId = session.metadata.supabase_user_id;
        const credits = parseInt(session.metadata.credits ?? "0", 10);
        if (userId && credits > 0) {
          await grantCredits(userId, credits, "topup", session.id);
          const balance = await balanceOf(userId);
          await sendTransactional(
            userId,
            "topup_receipt",
            (r) =>
              topupReceipt(r, {
                credits,
                amountCents: session.amount_total ?? 0,
                currency: session.currency ?? "usd",
                balance,
              }),
            { idempotencyKey: `topup:${session.id}` }
          );
        }
      }
      break;
    }

    case "invoice.paid": {
      const invoice = event.data.object;
      const customerId = typeof invoice.customer === "string" ? invoice.customer : invoice.customer?.id;
      if (!customerId) break;
      const userId = await userIdForCustomer(customerId);
      if (!userId) break;

      // Price id location differs across Stripe API versions - check both shapes.
      const line = invoice.lines?.data?.[0] as unknown as {
        price?: { id?: string };
        pricing?: { price_details?: { price?: string } };
      };
      const priceId = line?.price?.id ?? line?.pricing?.price_details?.price;
      const plan = priceId ? planForPriceId(priceId) : null;
      if (!plan) break;

      await admin
        .from("profiles")
        .update({ plan: plan.id, plan_status: "active" })
        .eq("id", userId);
      // Capped, unlike a top-up: unused plan credits roll over only so far.
      await grantSubscriptionCredits(
        userId,
        plan.creditsPerMonth,
        rolloverCap(plan),
        invoice.id ?? undefined
      );

      // First invoice of a subscription vs. a monthly cycle. Stripe reports
      // the reason; anything else (a proration, a manual invoice) gets the
      // renewal wording, which is the one that stays true.
      const first = invoice.billing_reason === "subscription_create";
      const balance = await balanceOf(userId);
      const details = {
        planId: plan.id,
        amountCents: invoice.amount_paid ?? 0,
        currency: invoice.currency ?? "usd",
        credits: plan.creditsPerMonth,
        balance,
      };
      await sendTransactional(
        userId,
        first ? "plan_started" : "plan_renewed",
        (r) => (first ? planStarted(r, details) : planRenewed(r, details)),
        { idempotencyKey: `invoice:${invoice.id}` }
      );
      break;
    }

    case "customer.subscription.updated": {
      const sub = event.data.object;
      const customerId = typeof sub.customer === "string" ? sub.customer : sub.customer.id;
      const userId = await userIdForCustomer(customerId);
      if (!userId) break;
      const status = sub.status === "active" || sub.status === "trialing" ? "active" : sub.status;
      await admin
        .from("profiles")
        .update({ plan_status: status, stripe_subscription_id: sub.id })
        .eq("id", userId);
      break;
    }

    case "customer.subscription.deleted": {
      const sub = event.data.object;
      const customerId = typeof sub.customer === "string" ? sub.customer : sub.customer.id;
      const userId = await userIdForCustomer(customerId);
      if (!userId) break;
      const { data: before } = await admin
        .from("profiles")
        .select("plan, credits")
        .eq("id", userId)
        .single();
      await admin
        .from("profiles")
        .update({ plan: "free", plan_status: "canceled", stripe_subscription_id: null })
        .eq("id", userId);
      await sendTransactional(
        userId,
        "plan_canceled",
        (r) => planCanceled(r, { planId: before?.plan ?? "free", balance: before?.credits ?? 0 }),
        { idempotencyKey: `sub-deleted:${sub.id}` }
      );
      break;
    }
  }

  return NextResponse.json({ received: true });
}
