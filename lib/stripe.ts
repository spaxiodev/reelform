import Stripe from "stripe";
import { PLANS, TOPUPS } from "./pricing";

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
