// Boot-time environment validation.
//
// Without this, a missing key surfaces as a confusing 500 the first time a
// user hits checkout or generates a video, often long after deploy. Checking
// once at server start turns that into a loud failure at the only moment
// anyone is watching the logs.

/** Vars the app cannot serve a single meaningful request without. */
const REQUIRED = [
  "NEXT_PUBLIC_APP_URL",
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
  "SUPABASE_SERVICE_ROLE_KEY",
  "ANTHROPIC_API_KEY",
] as const;

/** Vars a specific feature needs; absence degrades that feature only. */
const FEATURE_GATED: { name: string; feature: string }[] = [
  { name: "HIGGSFIELD_API_KEY", feature: "video generation" },
  { name: "STRIPE_SECRET_KEY", feature: "checkout" },
  { name: "STRIPE_WEBHOOK_SECRET", feature: "payment fulfilment" },
  { name: "STRIPE_PRICE_STARTER", feature: "the Starter plan" },
  { name: "STRIPE_PRICE_PRO", feature: "the Pro plan" },
  { name: "STRIPE_PRICE_STUDIO", feature: "the Studio plan" },
  { name: "STRIPE_PRICE_TOPUP_SMALL", feature: "the $10 top-up" },
  { name: "STRIPE_PRICE_TOPUP_MEDIUM", feature: "the $25 top-up" },
  { name: "STRIPE_PRICE_TOPUP_LARGE", feature: "the $60 top-up" },
  { name: "RESEND_API_KEY", feature: "product email (welcome, receipts, updates)" },
  { name: "EMAIL_FROM", feature: "product email (welcome, receipts, updates)" },
  { name: "EMAIL_UNSUBSCRIBE_SECRET", feature: "marketing email" },
  { name: "NEXT_PUBLIC_POSTAL_ADDRESS", feature: "marketing email" },
  { name: "RESEND_WEBHOOK_SECRET", feature: "bounce and unsubscribe sync from Resend" },
  { name: "CRON_SECRET", feature: "the daily email drip" },
  { name: "INTEGRATION_SECRET", feature: "connecting Vercel and Supabase accounts" },
  { name: "VERCEL_CLIENT_ID", feature: "deploying to Vercel" },
  { name: "VERCEL_CLIENT_SECRET", feature: "deploying to Vercel" },
  { name: "VERCEL_INTEGRATION_SLUG", feature: "deploying to Vercel" },
  { name: "SUPABASE_OAUTH_CLIENT_ID", feature: "deploying to Supabase" },
  { name: "SUPABASE_OAUTH_CLIENT_SECRET", feature: "deploying to Supabase" },
];

function missing(name: string): boolean {
  return !process.env[name]?.trim();
}

/**
 * Called once from instrumentation.ts. Throws on a production server that is
 * missing something essential; everywhere else it warns so local work and the
 * build step aren't blocked by an unconfigured optional integration.
 */
export function assertEnv(): void {
  const fatal = REQUIRED.filter(missing);
  const degraded = FEATURE_GATED.filter((v) => missing(v.name));

  for (const { name, feature } of degraded) {
    console.warn(`[env] ${name} is not set; ${feature} will fail until it is.`);
  }

  if (fatal.length === 0) return;

  const message =
    `[env] Missing required environment variable(s): ${fatal.join(", ")}.\n` +
    `      Copy .env.example to .env.local and fill them in, or add them to ` +
    `your hosting provider's environment settings.`;

  // During `next build` there is no serving to protect, and failing the build
  // for a secret that only exists in the runtime environment is unhelpful.
  const building = process.env.NEXT_PHASE === "phase-production-build";

  if (process.env.NODE_ENV === "production" && !building) {
    throw new Error(message);
  }
  console.warn(message);
}

/**
 * The canonical public origin, without a trailing slash. Prefers the explicit
 * setting, then Vercel's injected URL, then localhost, so preview deploys get
 * correct absolute URLs without extra configuration.
 */
export function appUrl(): string {
  const explicit = process.env.NEXT_PUBLIC_APP_URL?.trim();
  if (explicit) return explicit.replace(/\/$/, "");

  const vercel = process.env.VERCEL_PROJECT_PRODUCTION_URL || process.env.VERCEL_URL;
  if (vercel) return `https://${vercel.replace(/\/$/, "")}`;

  return "http://localhost:3000";
}
