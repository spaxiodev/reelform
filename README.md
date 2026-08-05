# Reelform

AI video-first website builder. Users describe their business, direct a cinematic hero video with **Seedance** (BytePlus ModelArk), preview and reshoot it until they're happy, then send it to **Claude**, which builds a complete single-file website around the footage — playing as an ambient loop or scrubbing frame-by-frame with scroll. They keep iterating with either AI until it ships.

**Stack:** Next.js (App Router) · Supabase (auth + Postgres + RLS) · Stripe (subscriptions + credit top-ups) · Anthropic API (streaming, user-selectable model) · Seedance via BytePlus ModelArk · Vercel (hosting)

---

## How the product works

1. **Brief** — user names the project, picks an industry, describes the website.
2. **Direct** — user writes a Seedance prompt, picks resolution/length/ratio, and generates. The video renders asynchronously; the studio polls and shows it in a "dailies" player. The user can **reshoot as many times as they like** — nothing goes to Claude without approval.
3. **Build** — user picks playback mode (**ambient loop** or **scroll scrub**) and a Claude model (Haiku → Opus), then hits *Send to Claude*. The site streams in live and renders in a sandboxed iframe.
4. **Iterate** — chat box sends edit instructions to Claude (full current HTML is passed as context each time). Reshooting the video and telling Claude "swap in the new video" also works — the latest video URL is always injected server-side.
5. **Ship** — download the single-file HTML or open it in a new tab. (Publishing to hosting is a natural v2 feature.)

Every action is metered in credits with atomic spend/refund in Postgres. Failed generations are automatically refunded.

---

## Setup

### 1. Supabase

1. Create a project at [supabase.com](https://supabase.com).
2. Open the **SQL editor** and run `supabase/schema.sql` (tables, RLS, credit RPCs, signup-bonus trigger).
3. Copy from **Project Settings → API** into `.env.local`:
   - `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`
4. **Auth → URL Configuration**: set Site URL to your app URL, add `https://your-app/api/auth/callback` to redirect URLs.
5. Optional: under **Auth → Sign In / Up**, disable "Confirm email" for frictionless local testing (keep it on in production).

### 2. Anthropic

Create an API key at [platform.claude.com](https://platform.claude.com) → `ANTHROPIC_API_KEY`.

### 3. Seedance (BytePlus ModelArk)

1. Create an account at BytePlus ModelArk and activate a Seedance model endpoint — for **Seedance 2.0**, activate the Dreamina-Seedance-2.0 model (or the 2.0 "fast" variant for cheaper drafts).
2. Set `SEEDANCE_API_KEY`, and if needed `SEEDANCE_API_BASE` (region) and `SEEDANCE_MODEL_ID` — paste the **exact model id shown in your ModelArk console**; the console is the source of truth for the string.
3. If you switch model generations later (1.x ↔ 2.0), it's just this env var — no code changes. But re-check your per-video cost on the ModelArk pricing page and re-tune the video credit prices in `lib/pricing.ts` if needed (2.0 also supports 2K and longer durations; the app currently exposes 720p/1080p × 5s/10s — extend `VIDEO_COST` and the Studio selects if you want to offer more).

If you'd rather use Seedance via fal.ai/Replicate/WaveSpeed, swap the two functions in `lib/seedance.ts` — the rest of the app only depends on `createVideoTask` / `getVideoTask`.

### 4. Stripe

1. In the Stripe dashboard create **6 Prices** and paste their ids into `.env.local`:

   | Product | Type | Amount | Env var |
   |---|---|---|---|
   | Starter plan | Recurring monthly | $19 | `STRIPE_PRICE_STARTER` |
   | Pro plan | Recurring monthly | $49 | `STRIPE_PRICE_PRO` |
   | Studio plan | Recurring monthly | $129 | `STRIPE_PRICE_STUDIO` |
   | 900 credits | One-time | $10 | `STRIPE_PRICE_TOPUP_SMALL` |
   | 2,400 credits | One-time | $25 | `STRIPE_PRICE_TOPUP_MEDIUM` |
   | 6,200 credits | One-time | $60 | `STRIPE_PRICE_TOPUP_LARGE` |

2. Set `STRIPE_SECRET_KEY`.
3. Webhook: add an endpoint pointing at `https://your-app/api/stripe/webhook` listening to `checkout.session.completed`, `invoice.paid`, `customer.subscription.updated`, `customer.subscription.deleted` → copy the signing secret to `STRIPE_WEBHOOK_SECRET`.
   - Locally: `stripe listen --forward-to localhost:3000/api/stripe/webhook`
4. Enable the **customer portal** (Settings → Billing → Customer portal) so users can cancel/manage plans.

### 5. Run locally

```bash
cp .env.example .env.local   # fill in everything above
npm install
npm run dev
```

### 6. Deploy to Vercel

1. Push this repo to GitHub, import it in Vercel.
2. Add every variable from `.env.local` to Vercel project env vars; set `NEXT_PUBLIC_APP_URL` to the production URL.
3. Point the Stripe webhook and the Supabase auth redirect URLs at the production domain.
4. Site generation streams for up to 5 minutes (`maxDuration = 300` in `app/api/site/generate/route.ts`) — this requires a Vercel plan that allows it (Pro), or lower the value and prefer faster models on Hobby.

---

## Pricing model (and why it's profitable)

**1 credit ≈ $0.01 retail.** Action prices are set at roughly **2× the underlying provider cost**, so gross margin is ~50%+ before Stripe fees, and subscriptions improve it further because unused credits expire monthly (top-ups don't — that's the fairness lever).

| Action | Credits | Retail | Approx. provider cost |
|---|---|---|---|
| Video 720p · 5s | 45 | ~$0.45 | ~$0.20–0.25 |
| Video 1080p · 5s | 90 | ~$0.90 | ~$0.40–0.50 |
| Site build — Haiku 4.5 | 10 | ~$0.10 | ~$0.03–0.05 |
| Site build — Sonnet 4.6 | 35 | ~$0.35 | ~$0.10–0.20 |
| Site build — Opus 4.8 | 120 | ~$1.20 | ~$0.40–0.70 |

Plans: Starter $19 → 2,000 cr · Pro $49 → 6,000 cr · Studio $129 → 18,000 cr. Free signup bonus: 150 cr (one 720p video + one Sonnet build + change — enough to experience the full loop once).

**Tune it in one place:** all numbers live in `lib/pricing.ts`. Watch your real Anthropic/ModelArk invoices for the first weeks and adjust credit costs there; the ledger table (`credit_ledger`) gives you per-action usage analytics for free.

Protections already built in:
- Atomic spend via a Postgres function — no double-spend race conditions.
- Automatic refunds when a provider call fails or the model declines.
- Credits can only be changed by `security definer` RPCs called with the service-role key — clients can't touch balances.

---

## Architecture notes

- `lib/claude.ts` — streaming site generation. The system prompt enforces single-file HTML output, distinctive (non-generic) design, and contains the exact loop / scroll-scrub video integration patterns. Edits always pass the full current HTML and return a full document.
- `app/api/site/generate/route.ts` — spends credits, streams plain text to the client, persists the finished HTML, refunds on failure using an in-band error sentinel.
- `app/api/video/*` — creates the ModelArk task and polls it; refunds on provider failure.
- `app/api/stripe/webhook/route.ts` — top-ups on `checkout.session.completed`, plan set + monthly credit grant on `invoice.paid` (covers first payment and renewals), status sync on subscription update/delete.
- `proxy.ts` — session refresh + auth gate for `/dashboard`, `/studio`, `/account` (Next 16 renamed `middleware` to `proxy`).
- RLS everywhere; the service-role client is only used server-side for credit accounting and webhook fulfillment.

## Roadmap ideas

- One-click publish (upload the HTML to Vercel Blob / a static host on a subdomain).
- Multiple videos per site (per-section footage).
- Team workspaces; per-project shareable preview links.
- Image generation for non-hero assets.
