// Central pricing config: credit costs for AI actions, plans, and top-ups.
// 1 credit ≈ $0.01 of retail value. Action costs are set at roughly 2× the
// underlying provider cost, targeting a ~50%+ gross margin, re-tune the
// numbers here as real usage data comes in (see README → Pricing).

export type ModelId =
  | "claude-haiku-4-5"
  | "claude-sonnet-5"
  | "claude-opus-4-8";

export const MODELS: Record<ModelId, { label: string; blurb: string }> = {
  "claude-haiku-4-5": { label: "Haiku 4.5", blurb: "Fast drafts" },
  "claude-sonnet-5": { label: "Sonnet 5", blurb: "Great everyday builds" },
  "claude-opus-4-8": { label: "Opus 4.8", blurb: "Best design quality" },
};

export const DEFAULT_MODEL: ModelId = "claude-opus-4-8";

// Model ids retired from the picker, mapped to their successor. Projects store
// the id they were last built with, so without this a project saved against a
// retired model would silently fall back to the default, which is the most
// expensive one, and quietly bill the user more than they chose.
const RETIRED_MODELS: Record<string, ModelId> = {
  "claude-sonnet-4-6": "claude-sonnet-5",
};

/** The model a stored id should build with today. */
export function resolveModel(stored: string | null | undefined): ModelId {
  if (stored && stored in MODELS) return stored as ModelId;
  return (stored && RETIRED_MODELS[stored]) || DEFAULT_MODEL;
}

// ── Metered (usage-based) billing ────────────────────────────────────────
// Provider token prices in USD per million tokens (Anthropic list pricing).
// Keep in sync with the models above: every credit price in this file is
// derived from these numbers, so a stale rate here is a silent margin leak.
export const MODEL_TOKEN_RATES: Record<ModelId, { input: number; output: number }> = {
  "claude-haiku-4-5": { input: 1, output: 5 },
  "claude-sonnet-5": { input: 2, output: 10 },
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

// ── Site builds ──────────────────────────────────────────────────────────
// A build is billed the same metered way an edit is: a hold up front, then a
// reconcile against the tokens the model actually spent. Flat per-model prices
// were a standing loss, a build that ran to the output cap cost more at the
// provider than the flat fee collected, and the size of a generated site
// varies too much to guess one number that is fair in both directions.

// Hard ceiling on a build's output. A single-file site at 32k tokens is ~120KB
// of HTML, more than any one-page build needs, and the cap is what makes the
// hold a real worst case rather than an estimate.
export const SITE_BUILD_MAX_TOKENS = 32_000;

// System prompt + brief + the video block. Comfortably above the real figure.
const BUILD_INPUT_OVERHEAD = 4_000;

/**
 * The hold taken before a build runs, and the output budget it is priced for.
 * The hold is the true worst case at `SITE_BUILD_MAX_TOKENS`, so the charge
 * can only ever be reconciled *down*, never up.
 */
export function estimateBuildCredits(
  model: ModelId,
  outputBudget: number = SITE_BUILD_MAX_TOKENS
): { hold: number; outputBudget: number } {
  const hold = Math.max(
    EDIT_MIN_CREDITS,
    meteredCredits(model, { input: BUILD_INPUT_OVERHEAD, output: outputBudget })
  );
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

// Because the per-second table above is an estimate rather than a rate card,
// video is the one action whose true cost could be higher than we think, and a
// shot priced under cost loses money on every single render. This factor is
// insurance against that: it widens the effective margin on video only, until a
// real Higgsfield invoice confirms the numbers. Set it back to 1 then.
const VIDEO_COST_SAFETY = 1.25;

/**
 * What one shot costs, in credits. Rounded up to a whole credit and to a
 * minimum of one, so a cheap model at 480p can never be free.
 */
export function videoCost(
  model: VideoModelId,
  resolution: Resolution,
  duration: Duration
): number {
  const usd =
    VIDEO_MODEL_USD_PER_SECOND[model] *
    RESOLUTION_MULTIPLIER[resolution] *
    duration *
    VIDEO_COST_SAFETY;
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

// Every plan sells credits at a *worse* rate than the 1 credit = $0.01 face
// value, and each tier gets a slightly better rate than the one below it. With
// action prices set at 2× provider cost, an account that burns its whole grant
// costs us half the credits' face value at the provider; the gap between that
// and the plan price, less Stripe's ~2.9% + $0.30, is the gross margin:
//
//   Starter  $19  / 2,000 cr  → COGS $10.00, fees $0.85 → 43% margin
//   Pro      $49  / 5,500 cr  → COGS $27.50, fees $1.72 → 40% margin
//   Studio   $129 / 15,000 cr → COGS $75.00, fees $4.04 → 39% margin
//
// Those are worst cases (every credit spent). Keep any re-cut above ~40%: the
// figures ignore Vercel, Supabase and support, which are real and grow with use.
export const PLANS: Plan[] = [
  {
    id: "starter",
    name: "Starter",
    priceUsd: 19,
    creditsPerMonth: 2000,
    priceEnv: "STRIPE_PRICE_STARTER",
    tagline: "~16 hero shots, or a site build a week with edits in between",
    perks: ["Unlimited zip exports", "Public showcase"],
  },
  {
    id: "pro",
    name: "Pro",
    priceUsd: 49,
    creditsPerMonth: 5500,
    priceEnv: "STRIPE_PRICE_PRO",
    tagline: "For freelancers shipping client sites",
    perks: ["One-click deploy to your Vercel", "Supabase backend for forms", "3 live sites"],
  },
  {
    id: "studio",
    name: "Studio",
    priceUsd: 129,
    creditsPerMonth: 15000,
    priceEnv: "STRIPE_PRICE_STUDIO",
    tagline: "Agency volume, best credit rate",
    perks: ["Everything in Pro", "25 live sites", "Deploy for every client"],
  },
];

// How many months of unused plan credits an account may carry. At 1 the grant
// would simply top the balance back up each month, which is no rollover at
// all; at 2 a subscriber can miss a full month and lose nothing, and the
// carried liability is bounded at two months of provider cost per account.
export const ROLLOVER_MONTHS = 2;

/** The ceiling on a plan's expiring balance, passed to the capped grant. */
export function rolloverCap(plan: Plan): number {
  return plan.creditsPerMonth * ROLLOVER_MONTHS;
}

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

// ── What the free build is allowed to spend at a provider ────────────────
// A free account still costs real money, and nothing stops anyone signing up
// again with another address, so the free tier's provider cost has to be a
// fixed, known number rather than whatever the user picks in the studio.
// Uncapped, one signup could shoot Sora 2 Pro at 1080p for 12s and build on
// Opus at the full output cap, ~$7 of provider spend for a $0 customer.
//
// Pinned instead to the cheapest video model and a small Haiku build:
//
//   video  seedance-lite · 720p · 5s  ≈ $0.18
//   site   Haiku 4.5 · 16k output cap ≈ $0.08
//                                     ─────────
//                                       ~$0.26 per free account
//
// That is a customer-acquisition cost, and it is the number to argue with, not
// the model list. Raising any of these raises the cost of every signup that
// never converts, so change them together with a view on conversion rate.
export const FREE_TIER = {
  video: { model: "seedance-lite", resolution: "720p", duration: 5 },
  siteModel: "claude-haiku-4-5",
  siteOutputBudget: 16_000,
} as const satisfies {
  video: { model: VideoModelId; resolution: Resolution; duration: Duration };
  siteModel: ModelId;
  siteOutputBudget: number;
};

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
