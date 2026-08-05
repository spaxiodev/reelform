// Central pricing config: credit costs for AI actions, plans, and top-ups.
// 1 credit ≈ $0.01 of retail value. Action costs are set at roughly 2× the
// underlying provider cost, targeting a ~50%+ gross margin — re-tune the
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

// Every edit costs at least this — covers the fixed overhead of a round-trip
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
// actual usage-based charge — the loop's output budget is bounded to match.
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

export type Resolution = "720p" | "1080p";
export type Duration = 5 | 10;

export const VIDEO_COST: Record<Resolution, Record<Duration, number>> = {
  "720p": { 5: 45, 10: 90 },
  "1080p": { 5: 90, 10: 180 },
};

export function videoCost(resolution: Resolution, duration: Duration): number {
  return VIDEO_COST[resolution][duration];
}

export interface Plan {
  id: "starter" | "pro" | "studio";
  name: string;
  priceUsd: number;
  creditsPerMonth: number;
  priceEnv: string; // env var holding the Stripe price id
  tagline: string;
}

export const PLANS: Plan[] = [
  {
    id: "starter",
    name: "Starter",
    priceUsd: 19,
    creditsPerMonth: 2000,
    priceEnv: "STRIPE_PRICE_STARTER",
    tagline: "~15 videos or a full site refresh every week",
  },
  {
    id: "pro",
    name: "Pro",
    priceUsd: 49,
    creditsPerMonth: 6000,
    priceEnv: "STRIPE_PRICE_PRO",
    tagline: "For freelancers shipping client sites",
  },
  {
    id: "studio",
    name: "Studio",
    priceUsd: 129,
    creditsPerMonth: 18000,
    priceEnv: "STRIPE_PRICE_STUDIO",
    tagline: "Agency volume, best credit rate",
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

export const SIGNUP_BONUS = 150;
