import Stripe from "stripe";
import { PLANS, TOPUPS } from "./pricing";
import type { createSupabaseAdmin } from "./supabase/admin";

// Lazy singleton, constructing Stripe at module load breaks `next build`
// when env vars aren't present.
let _stripe: Stripe | null = null;
export function getStripe(): Stripe {
  if (!_stripe) {
    const key = process.env.STRIPE_SECRET_KEY;
    if (!key) throw new Error("STRIPE_SECRET_KEY is not set");
    _stripe = new Stripe(key);
  }
  return _stripe;
}

export function priceIdFor(envName: string): string {
  const id = process.env[envName];
  if (!id) throw new Error(`Missing env var ${envName}. Create the Stripe price and set it.`);
  return id;
}

// Reverse lookup: which plan does a Stripe price id belong to? Used by the
// webhook when handling subscription renewals.
export function planForPriceId(priceId: string) {
  return PLANS.find((p) => process.env[p.priceEnv] === priceId) ?? null;
}

export function topupForPriceId(priceId: string) {
  return TOPUPS.find((t) => process.env[t.priceEnv] === priceId) ?? null;
}

/**
 * Returns a Stripe customer id that is guaranteed to exist in the account
 * behind STRIPE_SECRET_KEY, creating one (and storing it on the profile) when
 * the profile has none or holds a stale id.
 *
 * Stale ids happen when the key changes mode (test -> live) or a customer is
 * deleted in the dashboard; passing one to Checkout throws "No such customer"
 * and turned every checkout into a 500.
 */
export async function ensureStripeCustomer(
  admin: ReturnType<typeof createSupabaseAdmin>,
  user: { id: string; email?: string | null },
  profile: { stripe_customer_id?: string | null; email?: string | null } | null
): Promise<string> {
  const stripe = getStripe();
  const existing = profile?.stripe_customer_id ?? null;

  if (existing) {
    try {
      const customer = await stripe.customers.retrieve(existing);
      if (!customer.deleted) return customer.id;
    } catch (err) {
      const code = (err as { code?: string } | null)?.code;
      if (code !== "resource_missing") throw err;
    }
    console.warn(`[stripe] customer ${existing} for user ${user.id} no longer exists; recreating`);
  }

  const customer = await stripe.customers.create({
    email: profile?.email ?? user.email ?? undefined,
    metadata: { supabase_user_id: user.id },
  });
  await admin.from("profiles").update({ stripe_customer_id: customer.id }).eq("id", user.id);
  return customer.id;
}
