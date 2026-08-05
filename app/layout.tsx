import type { Metadata } from "next";
import { Manrope } from "next/font/google";
import { Toaster } from "@/components/ui/Toaster";
import "./globals.css";

// Single-family system per DESIGN.md — Manrope is the recommended open
// substitute for Forma DJR Micro (no metric adjustment needed).
const manrope = Manrope({
  variable: "--font-manrope",
  weight: ["400", "500", "600", "700"],
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Reelform — AI video-first website builder",
  description:
    "Describe your business, direct an AI-generated hero video with Seedance, and let Claude build the website around it. Loop it or scrub it with scroll.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${manrope.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col">
        {children}
        <Toaster />
      </body>
    </html>
  );
}
