import { NextResponse, type NextRequest } from "next/server";
import type Stripe from "stripe";
import { getStripe, planForPriceId } from "@/lib/stripe";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { grantCredits } from "@/lib/credits";

// Stripe -> Reelform fulfillment.
//  - checkout.session.completed (mode=payment): credit top-up
//  - invoice.paid: subscription created or renewed -> set plan + grant monthly credits
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
      await grantCredits(userId, plan.creditsPerMonth, "subscription", invoice.id ?? undefined);
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
      await admin
        .from("profiles")
        .update({ plan: "free", plan_status: "canceled", stripe_subscription_id: null })
        .eq("id", userId);
      break;
    }
  }

  return NextResponse.json({ received: true });
}
