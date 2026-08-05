import { NextResponse, type NextRequest } from "next/server";
import { createSupabaseServer } from "@/lib/supabase/server";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { getStripe, priceIdFor } from "@/lib/stripe";
import { PLANS, TOPUPS } from "@/lib/pricing";

interface Body {
  kind: "plan" | "topup";
  id: string; // plan id (starter|pro|studio) or topup id (small|medium|large)
}

export async function POST(request: NextRequest) {
  const stripe = getStripe();
  const supabase = await createSupabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const body = (await request.json()) as Body;
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

  const admin = createSupabaseAdmin();
  const { data: profile } = await admin
    .from("profiles")
    .select("stripe_customer_id, email")
    .eq("id", user.id)
    .single();

  let customerId = profile?.stripe_customer_id as string | null;
  if (!customerId) {
    const customer = await stripe.customers.create({
      email: profile?.email ?? user.email ?? undefined,
      metadata: { supabase_user_id: user.id },
    });
    customerId = customer.id;
    await admin.from("profiles").update({ stripe_customer_id: customerId }).eq("id", user.id);
  }

  if (body.kind === "plan") {
    const plan = PLANS.find((p) => p.id === body.id);
    if (!plan) return NextResponse.json({ error: "Unknown plan" }, { status: 400 });

    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      customer: customerId,
      line_items: [{ price: priceIdFor(plan.priceEnv), quantity: 1 }],
      success_url: `${appUrl}/dashboard?checkout=success`,
      cancel_url: `${appUrl}/pricing?checkout=canceled`,
      metadata: { supabase_user_id: user.id, kind: "plan", plan_id: plan.id },
      subscription_data: {
        metadata: { supabase_user_id: user.id, plan_id: plan.id },
      },
    });
    return NextResponse.json({ url: session.url });
  }

  const topup = TOPUPS.find((t) => t.id === body.id);
  if (!topup) return NextResponse.json({ error: "Unknown top-up" }, { status: 400 });

  const session = await stripe.checkout.sessions.create({
    mode: "payment",
    customer: customerId,
    line_items: [{ price: priceIdFor(topup.priceEnv), quantity: 1 }],
    invoice_creation: { enabled: true }, // gives top-ups a downloadable invoice

    success_url: `${appUrl}/dashboard?checkout=success`,
    cancel_url: `${appUrl}/pricing?checkout=canceled`,
    metadata: { supabase_user_id: user.id, kind: "topup", topup_id: topup.id, credits: String(topup.credits) },
  });
  return NextResponse.json({ url: session.url });
}
