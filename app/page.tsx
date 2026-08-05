import Link from "next/link";
import { PLANS } from "@/lib/pricing";
import { SiteFooter } from "@/components/SiteFooter";
import { LandingNav } from "@/components/LandingNav";
import { HeroScrub } from "@/components/HeroScrub";
import { Reveal } from "@/components/Reveal";
import { ReferenceReel } from "@/components/ReferenceReel";

const FAQS = [
  {
    q: "What exactly do I get?",
    a: "A complete, responsive single-file website built around your AI-generated hero video — real copy written for your business, not lorem ipsum. Preview it live, keep iterating with Claude, then download a zip with the HTML page and your hero video, ready to host anywhere.",
  },
  {
    q: "What if I don't like the video?",
    a: "Nothing goes to your site without your approval. Seedance shows you the footage first — reshoot as many times as you like, and only build once it's right. Failed generations are automatically refunded.",
  },
  {
    q: "How do credits work?",
    a: "Every video shoot and every Claude build has a transparent credit price shown before you click. Subscriptions refill monthly at the best rate; top-up credits never expire. New accounts start with 150 free credits — enough for a full video-plus-site run.",
  },
  {
    q: "Can I change the site after it's built?",
    a: "Yes — that's the point. Keep prompting Claude for edits (“darker palette, add testimonials”), or reshoot the video and tell Claude to swap it in. Every change streams into the live preview.",
  },
];

// Warm cinematic scene backgrounds — espresso base, sunset glow.
const FEATURES = [
  {
    badge: "STEP 01",
    title: "Direct the shot",
    body: "Describe the footage in plain language — mood, motion, the world your brand lives in. Seedance renders it in under two minutes. Preview and reshoot until it's right.",
    gradient:
      "radial-gradient(120% 110% at 20% 20%, #a8632f 0%, transparent 55%), linear-gradient(160deg, #241410, #2f211c)",
    tag: "SEEDANCE",
  },
  {
    badge: "STEP 02",
    title: "Send it to Claude",
    body: "Pick your model — fast Haiku drafts to Opus 4.8 flagship builds. Claude writes a complete, responsive site around your footage, streamed live into the preview.",
    gradient:
      "radial-gradient(120% 110% at 80% 30%, #b1401c 0%, transparent 55%), linear-gradient(160deg, #241410, #2f211c)",
    tag: "CLAUDE",
  },
  {
    badge: "STEP 03",
    title: "Loop it or scrub it",
    body: "Choose ambient loop playback, or cinematic scroll-scrubbing where the video plays forward as visitors scroll. Then download a zip — the HTML page plus your hero video — and host it anywhere.",
    gradient:
      "radial-gradient(120% 110% at 50% 80%, #dd4f26 0%, transparent 55%), linear-gradient(160deg, #241410, #2f211c)",
    tag: "SHIP",
  },
];

const CAPABILITIES = [
  { title: "Seedance shots", body: "Cinematic AI footage from a prompt.", badge: "Video" },
  { title: "Opus · Sonnet · Haiku", body: "Three Claude models, your call.", badge: "Build" },
  { title: "Loop & scroll-scrub", body: "Two premium playback modes.", badge: "Motion" },
  { title: "Zip export", body: "HTML + your video, host anywhere.", badge: "Own it" },
];

export default function Home() {
  return (
    <div className="flex flex-col min-h-screen">
      <LandingNav />

      <main className="flex-1">
        {/* ── Hero — scroll-scrubbed video ──────────────────────────── */}
        <HeroScrub />

        {/* ── Product mockup ────────────────────────────────────────── */}
        <section className="px-6 pt-20 md:pt-28 max-w-5xl mx-auto">
          <Reveal>
            <div className="card overflow-hidden !rounded-[1.75rem]">
              <div className="flex items-center gap-3 px-5 py-3 border-b border-line bg-bg-raise">
                <span className="flex gap-1.5" aria-hidden>
                  <span className="w-2.5 h-2.5 rounded-full bg-line-strong" />
                  <span className="w-2.5 h-2.5 rounded-full bg-line-strong" />
                  <span className="w-2.5 h-2.5 rounded-full bg-line-strong" />
                </span>
                <span className="flex-1 max-w-sm mx-auto bg-bg border border-line rounded-full px-4 py-1 text-xs text-faint text-center">
                  harborandbean.com
                </span>
              </div>
              <div className="relative aspect-[21/9] flex items-end overflow-hidden">
                <div
                  aria-hidden
                  className="absolute inset-0 opacity-95"
                  style={{
                    background:
                      "radial-gradient(120% 110% at 15% 20%, #6b3b28 0%, transparent 55%), radial-gradient(90% 100% at 85% 80%, #b1401c 0%, transparent 60%), linear-gradient(160deg, #241410 0%, #2f211c 100%)",
                  }}
                />
                <div aria-hidden className="absolute top-6 right-6 flex items-center gap-2">
                  <span className="rec-dot" />
                  <span className="text-white/70 text-xs font-bold tracking-widest">REC</span>
                </div>
                <div className="relative p-8 md:p-12 text-white max-w-lg">
                  <p className="text-xs font-bold tracking-[0.2em] text-white/60">
                    HARBOR &amp; BEAN — ROASTED DAILY
                  </p>
                  <p className="mt-3 text-2xl md:text-4xl font-medium leading-tight">
                    Coffee worth crossing the harbor for.
                  </p>
                  <span className="mt-5 inline-block bg-white text-ink text-xs font-bold uppercase tracking-wider px-4 py-2.5 rounded-full">
                    Visit the roastery
                  </span>
                </div>
                <div aria-hidden className="absolute bottom-0 inset-x-0 h-1 bg-white/20">
                  <div className="h-full w-1/3 bg-primary" />
                </div>
              </div>
            </div>
            <p className="mt-4 text-center text-sm text-faint">
              Built by Claude around a Seedance shot — scrubbing as the visitor scrolls.
            </p>
          </Reveal>
        </section>

        {/* ── Everything you need ───────────────────────────────────── */}
        <section className="px-6 py-24 md:py-32 max-w-6xl mx-auto">
          <Reveal>
            <h2 className="text-center text-4xl md:text-6xl font-bold tracking-tight leading-[1.05]">
              Everything you need,
              <br />
              <span className="text-faint">in three steps.</span>
            </h2>
          </Reveal>

          <div className="mt-14 grid md:grid-cols-3 gap-5">
            {FEATURES.map((f, i) => (
              <Reveal key={f.title} delay={i * 90}>
                <div className="h-full rounded-3xl border border-line bg-bg-raise p-3 hover:shadow-[var(--shadow-lift)] transition-shadow">
                  <div className="relative aspect-[16/10] rounded-2xl overflow-hidden" aria-hidden>
                    <div className="absolute inset-0" style={{ background: f.gradient }} />
                    <span className="absolute top-3 left-3 rounded-full bg-white/15 border border-white/25 px-3 py-1 text-[0.65rem] font-bold tracking-widest text-white backdrop-blur-sm">
                      {f.tag}
                    </span>
                  </div>
                  <div className="p-4">
                    <p className="mono-label !text-primary">{f.badge}</p>
                    <h3 className="mt-2 text-2xl font-semibold tracking-tight">{f.title}</h3>
                    <p className="mt-2 text-muted leading-relaxed">{f.body}</p>
                  </div>
                </div>
              </Reveal>
            ))}
          </div>

          {/* Capability chips */}
          <div className="mt-5 grid sm:grid-cols-2 lg:grid-cols-4 gap-5">
            {CAPABILITIES.map((c, i) => (
              <Reveal key={c.title} delay={i * 70}>
                <div className="h-full rounded-2xl border border-line bg-bg p-6">
                  <div className="flex items-start justify-between gap-3">
                    <h4 className="text-lg font-semibold tracking-tight">{c.title}</h4>
                    <span className="shrink-0 rounded-full bg-primary-soft/60 px-2.5 py-1 text-[0.65rem] font-bold tracking-wider text-primary-deep">
                      {c.badge}
                    </span>
                  </div>
                  <p className="mt-2 text-sm text-muted leading-relaxed">{c.body}</p>
                </div>
              </Reveal>
            ))}
          </div>
        </section>

        {/* ── Studio feature band — sunset + grid floor ─────────────── */}
        <section className="px-4 md:px-6 max-w-6xl mx-auto">
          <Reveal>
            <div className="sky-band grid-floor rounded-[2.5rem] md:rounded-[3rem] overflow-hidden px-6 py-20 md:py-28 text-center">
              <p className="text-xs font-bold tracking-[0.2em] text-white/70">THE STUDIO</p>
              <h2 className="mt-4 text-white font-bold tracking-tight text-4xl md:text-6xl leading-[1.02]">
                One screen. Three steps.
                <br />
                Camera to live site.
              </h2>
              <p className="mx-auto mt-5 max-w-xl text-lg text-white/90 leading-relaxed">
                Brief, video, build — each step takes over the whole screen. Watch your footage
                render, preview the finished site in the browser, and download it in a click.
              </p>
              <div className="mt-8 flex justify-center">
                <Link
                  href="/login?mode=signup"
                  className="group inline-flex items-center gap-3 rounded-full bg-white px-6 py-3 text-base font-semibold text-ink shadow-[0_8px_24px_rgba(0,0,0,0.18)] hover:bg-white/90 transition-colors"
                >
                  Open the studio
                  <span className="flex h-8 w-8 items-center justify-center rounded-full bg-primary text-white transition-transform group-hover:translate-x-0.5">
                    →
                  </span>
                </Link>
              </div>

              <div className="mx-auto mt-12 grid max-w-3xl grid-cols-2 gap-3 md:grid-cols-4">
                {[
                  ["~2 min", "idea to first cut"],
                  ["3 models", "Haiku to Opus"],
                  ["150 cr", "free on signup"],
                  ["1 file", "host anywhere"],
                ].map(([stat, label]) => (
                  <div
                    key={label}
                    className="rounded-2xl border border-white/25 bg-white/12 px-4 py-5 backdrop-blur-sm"
                  >
                    <p className="text-2xl md:text-3xl font-bold text-white">{stat}</p>
                    <p className="mt-1 text-[0.7rem] font-bold uppercase tracking-wider text-white/70">
                      {label}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          </Reveal>
        </section>

        {/* ── Showcase reel ─────────────────────────────────────────── */}
        <div className="mt-24 md:mt-32">
          <ReferenceReel
            eyebrow="MADE WITH REELFORM"
            title="Footage our users put on their sites"
            action={
              <Link
                href="/showcase"
                className="inline-flex items-center gap-2 rounded-full bg-white/10 border border-white/25 px-5 py-2.5 text-sm font-semibold text-white hover:bg-white/20 transition-colors"
              >
                See finished sites in the showcase →
              </Link>
            }
          />
        </div>

        {/* ── FAQ ───────────────────────────────────────────────────── */}
        <section className="px-6 py-24 md:py-32 max-w-3xl mx-auto w-full">
          <Reveal>
            <h2 className="text-center text-4xl md:text-6xl font-bold tracking-tight leading-[1.05]">
              Frequently asked
              <br />
              <span className="text-faint">questions.</span>
            </h2>
          </Reveal>
          <div className="mt-12 space-y-3">
            {FAQS.map((f, i) => (
              <Reveal key={f.q} delay={i * 60}>
                <details className="group rounded-2xl border border-line bg-bg-raise open:bg-bg open:shadow-[var(--shadow-lift)] transition-colors">
                  <summary className="flex items-center justify-between cursor-pointer list-none px-6 py-5 text-lg font-semibold">
                    {f.q}
                    <span
                      className="ml-4 flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-line-strong text-faint transition-transform group-open:rotate-45"
                      aria-hidden
                    >
                      +
                    </span>
                  </summary>
                  <p className="px-6 pb-6 -mt-1 text-muted leading-relaxed">{f.a}</p>
                </details>
              </Reveal>
            ))}
          </div>
        </section>

        {/* ── Final CTA — big rounded sunset card ───────────────────── */}
        <section className="px-4 md:px-6 pb-24 max-w-6xl mx-auto">
          <Reveal>
            <div className="sky-band grid-floor rounded-[2.5rem] md:rounded-[3rem] overflow-hidden px-8 py-20 md:px-16 md:py-24">
              <div className="max-w-xl">
                <p className="text-xs font-bold tracking-[0.2em] text-white/70">
                  FAIR, CREDIT-BASED PRICING
                </p>
                <h2 className="mt-4 text-white font-bold tracking-tight text-4xl md:text-6xl leading-[1.02]">
                  Where ideas become sites that move.
                </h2>
                <p className="mt-5 text-lg text-white/90 leading-relaxed">
                  Plans from ${PLANS[0].priceUsd}/mo, top up anytime, unused credits never expire.
                  Start with 150 free — enough for a full video-plus-site run.
                </p>
                <div className="mt-8 flex flex-wrap gap-3">
                  <Link
                    href="/login?mode=signup"
                    className="rounded-full bg-white px-7 py-3.5 text-base font-semibold text-ink shadow-[0_8px_24px_rgba(0,0,0,0.18)] hover:bg-white/90 transition-colors"
                  >
                    Start free
                  </Link>
                  <Link
                    href="/pricing"
                    className="rounded-full border border-white/60 px-7 py-3.5 text-base font-semibold text-white hover:bg-white/10 transition-colors"
                  >
                    View plans
                  </Link>
                </div>
              </div>
            </div>
          </Reveal>
        </section>
      </main>

      <SiteFooter />
    </div>
  );
}
