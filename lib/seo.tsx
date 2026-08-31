import type { Metadata } from "next";
import { appUrl } from "./env";
import { PLANS, TOPUPS } from "./pricing";
import { CONTACT_EMAIL } from "./contact";

/**
 * Metadata for a public, indexable page. Sets the canonical URL and mirrors
 * the title/description into the OG and Twitter cards so a shared link never
 * falls back to the generic site-wide copy.
 */
export function pageMeta({
  title,
  description,
  path,
}: {
  title: string;
  description: string;
  path: string;
}): Metadata {
  return {
    title,
    description,
    alternates: { canonical: path },
    openGraph: { title: `${title} — Reelform`, description, url: path },
    twitter: { title: `${title} — Reelform`, description },
  };
}

/**
 * For signed-in surfaces. These sit behind the auth proxy so a crawler can
 * only ever reach the login redirect, but saying so explicitly keeps them out
 * of the index if that ever changes.
 */
export const PRIVATE_PAGE: Metadata = {
  robots: { index: false, follow: false, nocache: true },
};

// Schema.org structured data. Google reads these to build rich results — the
// FAQ accordion, the price range under the site name, the breadcrumb trail.
// Each helper returns a plain object; <JsonLd> serialises it into the page.

type Json = Record<string, unknown>;

/** Stable node id so other graphs can reference the org instead of repeating it. */
const orgId = () => `${appUrl()}/#organization`;

export const ORGANIZATION_JSON_LD: Json = {
  "@context": "https://schema.org",
  "@type": "Organization",
  "@id": orgId(),
  name: "Reelform",
  url: appUrl(),
  logo: `${appUrl()}/icon.svg`,
  description:
    "Reelform turns a written brief into a cinematic AI hero video and a complete website built around it.",
  email: CONTACT_EMAIL,
  parentOrganization: {
    "@type": "Organization",
    name: "Polidori.dev",
    url: "https://polidori.dev",
  },
  contactPoint: [
    {
      "@type": "ContactPoint",
      contactType: "customer support",
      email: CONTACT_EMAIL,
      availableLanguage: ["English"],
    },
  ],
};

export const SOFTWARE_JSON_LD: Json = {
  "@context": "https://schema.org",
  "@type": "SoftwareApplication",
  name: "Reelform",
  applicationCategory: "DesignApplication",
  operatingSystem: "Web",
  url: appUrl(),
  publisher: { "@id": orgId() },
  description:
    "Direct an AI-generated hero video with Seedance, then let Claude build a complete responsive website around the footage. Export a single HTML file and host it anywhere.",
  featureList: [
    "AI video generation with Seedance",
    "Website generation with Claude (Haiku, Sonnet, Opus)",
    "Ambient loop and scroll-scrub video playback",
    "Conversational site editing",
    "Single-file HTML export",
  ],
  offers: {
    "@type": "AggregateOffer",
    priceCurrency: "USD",
    lowPrice: Math.min(...PLANS.map((p) => p.priceUsd)),
    highPrice: Math.max(...PLANS.map((p) => p.priceUsd)),
    offerCount: PLANS.length + TOPUPS.length,
  },
};

/** Product/Offer graph for /pricing, driven by the same config the page renders. */
export function pricingJsonLd(): Json {
  const offer = (price: number) => ({
    "@type": "Offer",
    price,
    priceCurrency: "USD",
    url: `${appUrl()}/pricing`,
    availability: "https://schema.org/InStock",
  });

  return {
    "@context": "https://schema.org",
    "@graph": [
      ...PLANS.map((plan) => ({
        "@type": "Product",
        name: `Reelform ${plan.name}`,
        description: `${plan.tagline}. ${plan.creditsPerMonth.toLocaleString("en-US")} credits per month.`,
        brand: { "@id": orgId() },
        offers: offer(plan.priceUsd),
      })),
      ...TOPUPS.map((topup) => ({
        "@type": "Product",
        name: `Reelform ${topup.name}`,
        description: `${topup.credits.toLocaleString("en-US")} one-time credits that never expire.`,
        brand: { "@id": orgId() },
        offers: offer(topup.priceUsd),
      })),
    ],
  };
}

/** FAQPage graph — pass the same Q&A pairs the page renders, or they disagree. */
export function faqJsonLd(faqs: { q: string; a: string }[]): Json {
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: faqs.map((f) => ({
      "@type": "Question",
      name: f.q,
      acceptedAnswer: { "@type": "Answer", text: f.a },
    })),
  };
}

export function breadcrumbJsonLd(trail: { name: string; path: string }[]): Json {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: trail.map((item, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: item.name,
      item: `${appUrl()}${item.path}`,
    })),
  };
}

/**
 * Renders a JSON-LD script tag. The payload is our own config data, never user
 * input, and `<` is escaped anyway so a future dynamic value cannot break out
 * of the script element.
 */
export function JsonLd({ data }: { data: Json }) {
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(data).replace(/</g, "\\u003c") }}
    />
  );
}
