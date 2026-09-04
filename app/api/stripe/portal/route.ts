import { NextResponse } from "next/server";
import { createSupabaseServer } from "@/lib/supabase/server";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { getStripe, ensureStripeCustomer } from "@/lib/stripe";
import { appUrl } from "@/lib/env";

// Opens the Stripe customer portal (manage/cancel subscription, invoices).
export async function POST() {
  const stripe = getStripe();
  const supabase = await createSupabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const admin = createSupabaseAdmin();
  const { data: profile } = await admin
    .from("profiles")
    .select("stripe_customer_id, email")
    .eq("id", user.id)
    .single();

  if (!profile?.stripe_customer_id) {
    return NextResponse.json({ error: "No billing account yet" }, { status: 400 });
  }

  const customerId = await ensureStripeCustomer(admin, user, profile);
  const session = await stripe.billingPortal.sessions.create({
    customer: customerId,
    return_url: `${appUrl()}/dashboard`,
  });
  return NextResponse.json({ url: session.url });
}
