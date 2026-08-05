import Link from "next/link";
import { PLANS, TOPUPS, MODELS, VIDEO_COST } from "@/lib/pricing";
import { CheckoutButton } from "@/components/CheckoutButton";
import { SiteFooter } from "@/components/SiteFooter";
import { SiteHeader } from "@/components/SiteHeader";

export const metadata = { title: "Pricing — Reelform" };

export default function PricingPage() {
  return (
    <div className="min-h-screen flex flex-col">
      <SiteHeader />

      <main className="flex-1 px-6 md:px-10 py-16 max-w-6xl mx-auto w-full">
        <p className="mono-label">RATE CARD</p>
        <h1 className="mt-3 text-5xl md:text-6xl font-medium tracking-tight">
          Pay for takes,
          <br />
          not seats.
        </h1>
        <p className="mt-4 text-muted max-w-xl">
          Everything runs on credits. Subscriptions refill monthly at the best rate; top-ups never
          expire. Every signup starts with 150 free credits.
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
              <p className="mt-3 text-sm text-muted leading-relaxed flex-1">{plan.tagline}</p>
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

        {/* What credits buy */}
        <div className="mt-16 card p-8">
          <p className="mono-label">WHAT CREDITS BUY</p>
          <div className="mt-6 grid md:grid-cols-2 gap-10">
            <div>
              <h3 className="font-semibold text-lg">Seedance video shoots</h3>
              <ul className="mt-4 space-y-2 text-sm">
                <li className="flex justify-between border-b border-line pb-2">
                  <span className="text-muted">720p · 5s</span>
                  <span className="font-mono text-primary">{VIDEO_COST["720p"][5]} cr</span>
                </li>
                <li className="flex justify-between border-b border-line pb-2">
                  <span className="text-muted">720p · 10s</span>
                  <span className="font-mono text-primary">{VIDEO_COST["720p"][10]} cr</span>
                </li>
                <li className="flex justify-between border-b border-line pb-2">
                  <span className="text-muted">1080p · 5s</span>
                  <span className="font-mono text-primary">{VIDEO_COST["1080p"][5]} cr</span>
                </li>
                <li className="flex justify-between pb-2">
                  <span className="text-muted">1080p · 10s</span>
                  <span className="font-mono text-primary">{VIDEO_COST["1080p"][10]} cr</span>
                </li>
              </ul>
            </div>
            <div>
              <h3 className="font-semibold text-lg">Claude site builds &amp; edits</h3>
              <ul className="mt-4 space-y-2 text-sm">
                {Object.entries(MODELS).map(([id, m]) => (
                  <li key={id} className="flex justify-between border-b border-line pb-2 last:border-0">
                    <span className="text-muted">
                      {m.label} <span className="text-faint">— {m.blurb}</span>
                    </span>
                    <span className="font-mono text-primary">{m.credits} cr</span>
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
