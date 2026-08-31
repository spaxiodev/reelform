import { LegalShell, LegalSection } from "@/components/LegalShell";
import { pageMeta } from "@/lib/seo";
import { CONTACT_EMAIL } from "@/components/SiteFooter";

export const metadata = pageMeta({
  title: "Contact",
  description:
    "Get in touch with the Reelform team about billing, bugs, feature requests or anything else.",
  path: "/contact",
});

export default function ContactPage() {
  return (
    <LegalShell label="GET IN TOUCH" title="Contact">
      <LegalSection heading="Email us">
        <p>
          For support, billing questions, refund requests, privacy requests, or anything else,
          email us at{" "}
          <a href={`mailto:${CONTACT_EMAIL}`} className="text-primary underline font-medium">
            {CONTACT_EMAIL}
          </a>
          . Write from your account email so we can find your projects and charges quickly.
        </p>
        <p>We typically respond within 2 business days.</p>
      </LegalSection>

      <LegalSection heading="Before you write">
        <ul className="list-disc pl-5 space-y-1.5">
          <li>
            <strong className="text-ink">Failed generation?</strong> Credits are refunded to your
            balance automatically, so check your dashboard first.
          </li>
          <li>
            <strong className="text-ink">Billing or refunds?</strong> See our{" "}
            <a href="/refunds" className="text-primary underline">
              Refund Policy
            </a>{" "}
            and include the charge date and amount.
          </li>
          <li>
            <strong className="text-ink">Privacy request?</strong> Access, export, and deletion
            requests are handled per our{" "}
            <a href="/privacy" className="text-primary underline">
              Privacy Policy
            </a>
            .
          </li>
        </ul>
      </LegalSection>
    </LegalShell>
  );
}
