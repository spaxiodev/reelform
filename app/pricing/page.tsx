import {
  PLANS,
  TOPUPS,
  MODELS,
  estimateBuildCredits,
  videoCost,
  DEPLOY_SITE_LIMIT,
  type ModelId,
} from "@/lib/pricing";
import { VIDEO_MODELS, type VideoModelId } from "@/lib/higgsfield";
import { pageMeta, pricingJsonLd, JsonLd } from "@/lib/seo";
import { CheckoutButton } from "@/components/CheckoutButton";
import { SiteFooter } from "@/components/SiteFooter";
import { SiteHeader } from "@/components/SiteHeader";

export const metadata = pageMeta({
  title: "Pricing",
  description:
    "Your first website is free. Plans from $19/mo, top-ups that never expire, and a transparent credit price on every video shoot and Claude build.",
  path: "/pricing",
});

export default function PricingPage() {
  return (
    <div className="min-h-screen flex flex-col">
      <SiteHeader />

      <main id="main" className="flex-1 px-6 md:px-10 py-16 max-w-6xl mx-auto w-full">
        <JsonLd data={pricingJsonLd()} />
        <p className="mono-label">RATE CARD</p>
        <h1 className="mt-3 text-5xl md:text-6xl font-medium tracking-tight">
          Pay for takes,
          <br />
          not seats.
        </h1>
        <p className="mt-4 text-muted max-w-xl">
          Everything runs on credits. Subscriptions refill monthly at the best rate; top-ups never
          expire. Every account gets its first website free.
        </p>

        {/* Plans */}
        <div className="mt-12 grid md:grid-cols-3 gap-6">
          {PLANS.map((plan, i) => (
            <div
              key={plan.id}
              className={`card p-8 flex flex-col ${i === 1 ? "border-primary/60 relative" : ""}`}
            >
              {i === 1 && (
                <span className="mono-label !text-primary absolute -top-3 left-8 bg-bg px-2">
                  MOST POPULAR
                </span>
              )}
              <p className="mono-label">{plan.name.toUpperCase()}</p>
              <p className="mt-4 text-5xl font-medium tracking-tight">
                ${plan.priceUsd}
                <span className="text-lg text-muted font-normal">/mo</span>
              </p>
              <p className="mt-2 text-primary font-mono text-sm">
                {plan.creditsPerMonth.toLocaleString()} credits / month
              </p>
              <p className="mt-3 text-sm text-muted leading-relaxed">{plan.tagline}</p>
              <ul className="mt-4 space-y-1.5 text-sm flex-1">
                {plan.perks.map((perk) => (
                  <li key={perk} className="flex gap-2 text-muted">
                    <span className="text-primary" aria-hidden>
                      ✓
                    </span>
                    {perk}
                  </li>
                ))}
              </ul>
              <CheckoutButton
                kind="plan"
                id={plan.id}
                className={i === 1 ? "btn-primary mt-6 w-full" : "btn-ghost mt-6 w-full"}
              >
                Subscribe
              </CheckoutButton>
            </div>
          ))}
        </div>

        {/* Top-ups */}
        <div className="mt-16">
          <p className="mono-label">CREDIT TOP-UPS · NEVER EXPIRE</p>
          <div className="mt-6 grid sm:grid-cols-3 gap-6">
            {TOPUPS.map((t) => (
              <div key={t.id} className="card p-6 flex items-center justify-between gap-4">
                <div>
                  <p className="font-semibold">{t.name}</p>
                  <p className="text-sm text-muted">${t.priceUsd} one-time</p>
                </div>
                <CheckoutButton kind="topup" id={t.id} className="btn-ghost !py-2 !px-4 text-sm">
                  Buy
                </CheckoutButton>
              </div>
            ))}
          </div>
        </div>

        {/* Deploying */}
        <div className="mt-16 card p-8">
          <p className="mono-label">DEPLOYS · PRO AND STUDIO</p>
          <h2 className="mt-3 text-2xl font-medium tracking-tight">
            Push it live on your own stack.
          </h2>
          <p className="mt-3 text-sm text-muted leading-relaxed max-w-2xl">
            Connect your Vercel and Supabase accounts and a finished site ships straight into them:
            the page and its videos deployed to Vercel, the contact form writing into your own
            Supabase table. You own the project, the domain and the data, so the site keeps running
            whatever happens to your Reelform plan. Deploys don&apos;t cost credits; your plan just
            sets how many sites stay live at once ({DEPLOY_SITE_LIMIT.pro} on Pro,{" "}
            {DEPLOY_SITE_LIMIT.studio} on Studio).
          </p>
        </div>

        {/* What credits buy */}
        <div className="mt-16 card p-8">
          <p className="mono-label">WHAT CREDITS BUY</p>
          <div className="mt-6 grid md:grid-cols-2 gap-10">
            <div>
              <h3 className="font-semibold text-lg">Video shoots</h3>
              <p className="mt-1 text-xs text-faint">
                Per 5-second shot at 720p. Longer takes and 1080p scale from here; the studio
                quotes the exact price before you shoot.
              </p>
              <ul className="mt-4 space-y-2 text-sm">
                {VIDEO_MODELS.map((m) => (
                  <li
                    key={m.id}
                    className="flex justify-between gap-4 border-b border-line pb-2 last:border-0"
                  >
                    <span className="text-muted">
                      {m.label} <span className="text-faint">· {m.blurb}</span>
                    </span>
                    <span className="font-mono text-primary shrink-0">
                      {videoCost(m.id as VideoModelId, "720p", 5)} cr
                    </span>
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <h3 className="font-semibold text-lg">Claude site builds &amp; edits</h3>
              <ul className="mt-4 space-y-2 text-sm">
                {Object.entries(MODELS).map(([id, m]) => (
                  <li key={id} className="flex justify-between border-b border-line pb-2 last:border-0">
                    <span className="text-muted">
                      {m.label} <span className="text-faint">· {m.blurb}</span>
                    </span>
                    <span className="font-mono text-primary">
                      up to {estimateBuildCredits(id as ModelId).hold} cr
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </main>

      <SiteFooter />
    </div>
  );
}
