import type { Metadata, Viewport } from "next";
import { Manrope } from "next/font/google";
import { Analytics } from "@vercel/analytics/next";
import { SpeedInsights } from "@vercel/speed-insights/next";
import { Toaster } from "@/components/ui/Toaster";
import { appUrl } from "@/lib/env";
import { ORGANIZATION_JSON_LD, SOFTWARE_JSON_LD, JsonLd } from "@/lib/seo";
import "./globals.css";

// Single-family system per DESIGN.md — Manrope is the recommended open
// substitute for Forma DJR Micro (no metric adjustment needed).
const manrope = Manrope({
  variable: "--font-manrope",
  weight: ["400", "500", "600", "700"],
  subsets: ["latin"],
  display: "swap",
});

const TITLE = "Reelform — AI video-first website builder";
const DESCRIPTION =
  "Describe your business, direct an AI-generated hero video with Seedance, and let Claude build the website around it. Loop it or scrub it with scroll.";

export const metadata: Metadata = {
  // Makes the relative OG and canonical URLs below resolve to absolute ones.
  metadataBase: new URL(appUrl()),
  title: {
    default: TITLE,
    // Pages export a bare title ("Pricing") and inherit the suffix from here.
    template: "%s — Reelform",
  },
  description: DESCRIPTION,
  applicationName: "Reelform",
  keywords: [
    "AI website builder",
    "AI video generator",
    "Seedance",
    "Claude",
    "video landing page",
    "scroll scrub video",
    "hero video website",
  ],
  authors: [{ name: "Polidori.dev", url: "https://polidori.dev" }],
  creator: "Polidori.dev",
  publisher: "Polidori.dev",
  alternates: { canonical: "/" },
  openGraph: {
    type: "website",
    siteName: "Reelform",
    title: TITLE,
    description: DESCRIPTION,
    url: "/",
    locale: "en_US",
  },
  twitter: {
    card: "summary_large_image",
    title: TITLE,
    description: DESCRIPTION,
  },
  robots: {
    index: true,
    follow: true,
    googleBot: { index: true, follow: true, "max-image-preview": "large", "max-video-preview": -1 },
  },
  formatDetection: { telephone: false, address: false },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#2a1a13" },
  ],
  colorScheme: "light",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${manrope.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col">
        {/* Lets keyboard and screen-reader users jump the nav on every page.
            Visually hidden until focused — see .skip-link in globals.css. */}
        <a href="#main" className="skip-link">
          Skip to content
        </a>
        {children}
        <Toaster />
        <JsonLd data={ORGANIZATION_JSON_LD} />
        <JsonLd data={SOFTWARE_JSON_LD} />
        <Analytics />
        <SpeedInsights />
      </body>
    </html>
  );
}
