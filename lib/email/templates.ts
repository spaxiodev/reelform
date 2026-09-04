import { PLANS, ROLLOVER_MONTHS, type Plan } from "@/lib/pricing";
import { senderFirstName } from "./config";
import { button, p, render, rows, signoff, steps, type Recipient, type Rendered } from "./layout";

// Every email we send, as copy. Each function returns the subject and both
// renderings. Keep the voice plain: short sentences, say the thing, sign it
// with a person's name. If a line sounds like a landing page, cut it.

export interface Message extends Rendered {
  subject: string;
}

function greeting(r: Recipient): string {
  return r.firstName ? `Hi ${r.firstName},` : "Hi,";
}

function money(cents: number, currency = "usd"): string {
  return new Intl.NumberFormat("en-CA", { style: "currency", currency: currency.toUpperCase() }).format(
    cents / 100
  );
}

function num(n: number): string {
  return n.toLocaleString("en-CA");
}

function today(): string {
  return new Date().toLocaleDateString("en-CA", {
    month: "long",
    day: "numeric",
    year: "numeric",
    timeZone: "America/Toronto",
  });
}

function planNamed(id: string): Plan | undefined {
  return PLANS.find((x) => x.id === id);
}

// ── Transactional ──────────────────────────────────────────────────

export function welcome(r: Recipient): Message {
  const me = senderFirstName();
  return {
    subject: "Your Reelform account is ready",
    ...render({
      preheader: "Your first hero video and site build are on us.",
      eyebrow: "Welcome",
      heading: r.firstName ? `You're in, ${r.firstName}.` : "You're in.",
      footer: "transactional",
      recipient: r,
      body: [
        p(
          "Your account is live. The first website is free: one hero video and one full site build, no card needed."
        ),
        p("Here's how it goes:"),
        steps([
          "**Brief.** Name the project, pick an industry, describe the site in a few lines.",
          "**Direct.** Write the shot, pick a length and ratio, render it. Not right? Reshoot. Nothing moves on until you say so.",
          "**Build.** Choose an ambient loop or scroll scrub, send the footage to Claude, and watch the site come in.",
        ]),
        button("Start your first take", "/create"),
        p(
          "One tip before you start: the best shots describe one subject, one camera move and one kind of light. “A barista pulling a shot, slow push-in, morning window light” beats a paragraph."
        ),
        p("If anything is off, reply to this email. It lands with me, not a queue."),
        signoff(me),
      ],
    }),
  };
}

export function topupReceipt(
  r: Recipient,
  o: { credits: number; amountCents: number; currency: string; balance: number }
): Message {
  return {
    subject: `Receipt: ${num(o.credits)} credits added`,
    ...render({
      preheader: `${money(o.amountCents, o.currency)} for ${num(o.credits)} credits. They don't expire.`,
      eyebrow: "Receipt",
      heading: `${num(o.credits)} credits, added.`,
      footer: "transactional",
      recipient: r,
      body: [
        p(`${greeting(r)} thanks. Your top-up went through and the credits are already on your account. They don't expire.`),
        rows([
          ["Purchase", `${num(o.credits)} credits`],
          ["Charged", money(o.amountCents, o.currency)],
          ["Balance now", `${num(o.balance)} credits`],
          ["Date", today()],
        ]),
        p(
          "The invoice is under [Billing](/account/billing). If something looks wrong with the charge, reply here and we'll sort it out. The [refund policy](/refunds) is short."
        ),
        button("Open the studio", "/dashboard"),
      ],
    }),
  };
}

export function planStarted(
  r: Recipient,
  o: { planId: string; amountCents: number; currency: string; credits: number; balance: number }
): Message {
  const plan = planNamed(o.planId);
  const name = plan?.name ?? "your plan";
  return {
    subject: `Welcome to Reelform ${name}`,
    ...render({
      preheader: `${num(o.credits)} credits just landed. They renew monthly.`,
      eyebrow: "Subscription",
      heading: `${name} is on.`,
      footer: "transactional",
      recipient: r,
      body: [
        p(
          `${greeting(r)} your subscription is active and ${num(o.credits)} credits just landed. They renew every month, and anything you don't use rolls over for up to ${ROLLOVER_MONTHS} months.`
        ),
        rows([
          ["Plan", name],
          ["Billed", `${money(o.amountCents, o.currency)} monthly`],
          ["Credits this month", num(o.credits)],
          ["Balance now", `${num(o.balance)} credits`],
          ["Started", today()],
        ]),
        p("Change or cancel any time from [Billing](/account/billing). No calls, no forms."),
        button("Open the studio", "/dashboard"),
      ],
    }),
  };
}

export function planRenewed(
  r: Recipient,
  o: { planId: string; amountCents: number; currency: string; credits: number; balance: number }
): Message {
  const plan = planNamed(o.planId);
  const name = plan?.name ?? "Your plan";
  return {
    subject: `Your ${name} plan renewed`,
    ...render({
      preheader: `${num(o.credits)} fresh credits. Balance: ${num(o.balance)}.`,
      eyebrow: "Renewal",
      heading: `Renewed. ${num(o.credits)} fresh credits.`,
      footer: "transactional",
      recipient: r,
      body: [
        p(`${greeting(r)} your ${name} plan renewed today. Here's the short version:`),
        rows([
          ["Charged", money(o.amountCents, o.currency)],
          ["Credits added", num(o.credits)],
          ["Balance now", `${num(o.balance)} credits`],
          ["Date", today()],
        ]),
        p(
          `Unused plan credits carry over for up to ${ROLLOVER_MONTHS} months, so a quiet month isn't a wasted one. The invoice is under [Billing](/account/billing).`
        ),
        button("Open the studio", "/dashboard"),
      ],
    }),
  };
}

export function planCanceled(r: Recipient, o: { planId: string; balance: number }): Message {
  const plan = planNamed(o.planId);
  const name = plan?.name ?? "Your plan";
  const me = senderFirstName();
  return {
    subject: "Your Reelform plan was canceled",
    ...render({
      preheader: "No further charges. Your credits and projects stay.",
      eyebrow: "Subscription",
      heading: `${name} is off.`,
      footer: "transactional",
      recipient: r,
      body: [
        p(
          `${greeting(r)} your ${name} subscription has ended and you won't be charged again. The ${num(o.balance)} credits on your account are still yours to spend, and your projects and videos stay where they are.`
        ),
        p(
          "Changed your mind? [Pick a plan](/pricing) and you're back the same minute. If something pushed you out, reply and tell me what. I read every one."
        ),
        signoff(me),
      ],
    }),
  };
}

// ── Marketing (opt-in only) ────────────────────────────────────────

export function tips1(r: Recipient): Message {
  const me = senderFirstName();
  return {
    subject: "What makes a hero shot look expensive",
    ...render({
      preheader: "Three things that separate a stock-looking clip from footage shot for the site.",
      eyebrow: "Shot notes",
      heading: "What makes a hero shot look expensive",
      footer: "marketing",
      recipient: r,
      body: [
        p(
          `${greeting(r)} you have a hero shot waiting, or you've already used one. Either way this applies to every shot after it. Three things separate footage that looks like a stock clip from footage that looks shot for the site:`
        ),
        steps([
          "**One subject.** “A chef plating a dish” renders sharper than “a busy kitchen at dinner service”. Crowds go smeary.",
          "**Name the camera move.** Slow push-in, lateral dolly, static tripod. If you don't say, the model picks, and it usually picks too much.",
          "**Say where the light comes from.** Late afternoon window, a single overhead lamp, flat overcast. Light is most of what “cinematic” means.",
        ]),
        p("And one more: five seconds is plenty. A site loop is background. Nobody watches the whole thing."),
        button("Shoot something", "/create"),
        p("Reply with a shot that didn't work and I'll tell you what I'd change."),
        signoff(me),
      ],
    }),
  };
}

export function nudgeFreeBuild(r: Recipient): Message {
  const me = senderFirstName();
  return {
    subject: "Your free site build is still there",
    ...render({
      preheader: "It doesn't expire. Here's what other people did with theirs.",
      eyebrow: "Still waiting",
      heading: "One free build, unclaimed.",
      footer: "marketing",
      recipient: r,
      body: [
        p(
          `${greeting(r)} you signed up about a week ago and haven't built a site yet. The free build doesn't expire, so there's no rush.`
        ),
        p(
          "If you were waiting to see what other people made first, the [showcase](/showcase) has sites from real accounts, videos included. Find one you like and borrow the shot. Fifteen minutes from brief to finished site is normal."
        ),
        button("Build it", "/create"),
        p("If you tried and hit a wall, reply and say where. That's the most useful email I get."),
        signoff(me),
      ],
    }),
  };
}

// The drip schedule. Day offsets count from account creation; the cron route
// in app/api/cron/email-drip walks this list once a day. `condition` is a
// second gate on top of consent: the free-build nudge, for example, is
// pointless for someone who already built one.
export type MarketingKind = "tips_1" | "nudge_free_build";

export const DRIP: {
  kind: MarketingKind;
  afterDays: number;
  build: (r: Recipient) => Message;
  condition?: "no_site_built";
}[] = [
  { kind: "tips_1", afterDays: 1, build: tips1 },
  { kind: "nudge_free_build", afterDays: 6, build: nudgeFreeBuild, condition: "no_site_built" },
];
