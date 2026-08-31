// Central pricing config: credit costs for AI actions, plans, and top-ups.
// 1 credit ≈ $0.01 of retail value. Action costs are set at roughly 2× the
// underlying provider cost, targeting a ~50%+ gross margin, re-tune the
// numbers here as real usage data comes in (see README → Pricing).

export type ModelId =
  | "claude-haiku-4-5"
  | "claude-sonnet-4-6"
  | "claude-opus-4-8";

export const MODELS: Record<ModelId, { label: string; blurb: string; credits: number }> = {
  "claude-haiku-4-5": { label: "Haiku 4.5", blurb: "Fast drafts", credits: 10 },
  "claude-sonnet-4-6": { label: "Sonnet 4.6", blurb: "Great everyday builds", credits: 35 },
  "claude-opus-4-8": { label: "Opus 4.8", blurb: "Best design quality", credits: 120 },
};

export const DEFAULT_MODEL: ModelId = "claude-opus-4-8";

// ── Metered (usage-based) billing for interactive edits ──────────────────
// Provider token prices in USD per million tokens (Anthropic list pricing).
// Keep in sync with the models above.
export const MODEL_TOKEN_RATES: Record<ModelId, { input: number; output: number }> = {
  "claude-haiku-4-5": { input: 1, output: 5 },
  "claude-sonnet-4-6": { input: 3, output: 15 },
  "claude-opus-4-8": { input: 5, output: 25 },
};

// 1 credit = $0.01 of retail value; we charge ~2× the underlying provider cost
// (same margin target as the flat action costs above).
const CREDIT_USD = 0.01;
const CREDIT_MARGIN = 2;

// Every edit costs at least this, covers the fixed overhead of a round-trip
// even for a one-word tweak, and keeps "free" edits from being abused.
export const EDIT_MIN_CREDITS = 2;

export interface TokenUsage {
  input: number;
  output: number;
  cacheRead?: number; // cached input tokens (~0.1× input rate)
  cacheWrite?: number; // tokens written to cache (~1.25× input rate)
}

// Converts real token usage from the Anthropic API into a credit charge.
export function meteredCredits(model: ModelId, usage: TokenUsage): number {
  const rate = MODEL_TOKEN_RATES[model];
  const inPerTok = rate.input / 1_000_000;
  const outPerTok = rate.output / 1_000_000;
  const usd =
    usage.input * inPerTok +
    usage.output * outPerTok +
    (usage.cacheRead ?? 0) * inPerTok * 0.1 +
    (usage.cacheWrite ?? 0) * inPerTok * 1.25;
  return Math.ceil((usd * CREDIT_MARGIN) / CREDIT_USD);
}

// A deliberately-generous credit hold reserved before an edit runs and
// reconciled to the true charge afterwards. Token estimates are intentionally
// high (chars/3 rather than the real ~chars/4) so the hold is never below the
// actual usage-based charge, the loop's output budget is bounded to match.
export function estimateEditCredits(
  model: ModelId,
  htmlLength: number
): { hold: number; outputBudget: number } {
  const htmlTokens = Math.ceil(htmlLength / 3);
  const inputTokens = htmlTokens + 3000; // system + tools + instruction overhead
  const outputBudget = htmlTokens + 8000; // room for a full rewrite plus edits
  const hold = Math.max(EDIT_MIN_CREDITS, meteredCredits(model, { input: inputTokens, output: outputBudget }));
  return { hold, outputBudget };
}

import type { Resolution, VideoModelId } from "@/lib/higgsfield";

export type { Resolution };
export type Duration = number;

// Video shoots run on Higgsfield, which does not publish per-request API
// prices. These are the provider's cost per second of finished video at 720p,
// taken from the closest published rates for the same models on comparable
// marketplaces, and they drive every credit price the studio quotes.
//
// ⚠ ASSUMPTION: Higgsfield's own rates may differ in either direction. Check
// the first real invoice and re-tune here, at the 2× margin this file targets,
// an error either way lands straight on gross margin. The spread across the
// catalog is ~10×, so a per-model table is the only honest way to quote a cost.
export const VIDEO_MODEL_USD_PER_SECOND: Record<VideoModelId, number> = {
  "seedance-lite": 0.036,
  "ltx-2": 0.04,
  "hailuo-02": 0.045,
  "hailuo-2.3": 0.05,
  "seedance-pro-fast": 0.06,
  "kling-2.5-turbo-pro": 0.07,
  "hailuo-02-pro": 0.08,
  "hailuo-2.3-pro": 0.09,
  "wan-2.5": 0.1,
  "sora-2": 0.1,
  "kling-2.1-master": 0.28,
  "sora-2-pro": 0.3,
};

// Resolution scales the per-second rate. Models without a resolution control
// shoot at their own native size and are billed at the 720p rate.
const RESOLUTION_MULTIPLIER: Record<Resolution, number> = {
  "480p": 0.6,
  "720p": 1,
  "1080p": 1.5,
};

/**
 * What one shot costs, in credits. Rounded up to a whole credit and to a
 * minimum of one, so a cheap model at 480p can never be free.
 */
export function videoCost(
  model: VideoModelId,
  resolution: Resolution,
  duration: Duration
): number {
  const usd = VIDEO_MODEL_USD_PER_SECOND[model] * RESOLUTION_MULTIPLIER[resolution] * duration;
  return Math.max(1, Math.ceil((usd * CREDIT_MARGIN) / CREDIT_USD));
}

export type PlanId = "free" | "starter" | "pro" | "studio";

export interface Plan {
  id: Exclude<PlanId, "free">;
  name: string;
  priceUsd: number;
  creditsPerMonth: number;
  priceEnv: string; // env var holding the Stripe price id
  tagline: string;
  /** Headline capabilities beyond credits, shown on the rate card. */
  perks: string[];
}

export const PLANS: Plan[] = [
  {
    id: "starter",
    name: "Starter",
    priceUsd: 19,
    creditsPerMonth: 2000,
    priceEnv: "STRIPE_PRICE_STARTER",
    tagline: "~13 hero shots or a full site refresh every week",
    perks: ["Unlimited zip exports", "Public showcase"],
  },
  {
    id: "pro",
    name: "Pro",
    priceUsd: 49,
    creditsPerMonth: 6000,
    priceEnv: "STRIPE_PRICE_PRO",
    tagline: "For freelancers shipping client sites",
    perks: ["One-click deploy to your Vercel", "Supabase backend for forms", "3 live sites"],
  },
  {
    id: "studio",
    name: "Studio",
    priceUsd: 129,
    creditsPerMonth: 18000,
    priceEnv: "STRIPE_PRICE_STUDIO",
    tagline: "Agency volume, best credit rate",
    perks: ["Everything in Pro", "25 live sites", "Deploy for every client"],
  },
];

export interface Topup {
  id: "small" | "medium" | "large";
  name: string;
  priceUsd: number;
  credits: number;
  priceEnv: string;
}

// Top-up credits never expire; the rate is slightly worse than subscriptions
// so plans stay the better deal.
export const TOPUPS: Topup[] = [
  { id: "small", name: "900 credits", priceUsd: 10, credits: 900, priceEnv: "STRIPE_PRICE_TOPUP_SMALL" },
  { id: "medium", name: "2,400 credits", priceUsd: 25, credits: 2400, priceEnv: "STRIPE_PRICE_TOPUP_MEDIUM" },
  { id: "large", name: "6,200 credits", priceUsd: 60, credits: 6200, priceEnv: "STRIPE_PRICE_TOPUP_LARGE" },
];

// New accounts get one complete website free, one hero video and one site
// build, instead of a credit float. See lib/entitlements.ts for the rule; the
// flags live on `profiles`, so the free tier can't be topped up.
export const FREE_BUILD = { videos: 1, siteBuilds: 1 } as const;

// ── Deployment (push a finished site to the user's own infrastructure) ────
// Deploys run against the *customer's* Vercel and Supabase accounts, so they
// cost us nothing at a provider, the gate is a plan feature, not a credit
// price. The cap is on how many distinct sites may be live at once, which is
// what separates a freelancer from an agency.

export const DEPLOY_SITE_LIMIT: Record<PlanId, number> = {
  free: 0,
  starter: 0,
  pro: 3,
  studio: 25,
};

export function planId(plan: string | null | undefined): PlanId {
  return plan === "starter" || plan === "pro" || plan === "studio" ? plan : "free";
}

/** Whether a plan may push sites to Vercel / Supabase at all. */
export function canDeploy(plan: string | null | undefined): boolean {
  return DEPLOY_SITE_LIMIT[planId(plan)] > 0;
}

/** How many projects a plan may keep live simultaneously. */
export function deploySiteLimit(plan: string | null | undefined): number {
  return DEPLOY_SITE_LIMIT[planId(plan)];
}

/**
 * How full an account's credit tank is, for the ring drawn around the avatar.
 * A plan's monthly grant is the natural full mark; free accounts have no grant,
 * so the smallest top-up stands in as the scale, it keeps the ring meaningful
 * for someone who has only ever bought credits, and it can only ever read as
 * "some" rather than a promise about the plan.
 */
export function creditRing(
  plan: string | null | undefined,
  credits: number
): { fraction: number; allowance: number } {
  const allowance = PLANS.find((p) => p.id === planId(plan))?.creditsPerMonth ?? TOPUPS[0].credits;
  return { fraction: Math.max(0, Math.min(1, credits / allowance)), allowance };
}

/** The cheapest plan that unlocks deploys, named in upgrade prompts. */
export const DEPLOY_MIN_PLAN = PLANS.find((p) => DEPLOY_SITE_LIMIT[p.id] > 0)!;
