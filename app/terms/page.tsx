import { LegalShell, LegalSection } from "@/components/LegalShell";
import { ROLLOVER_MONTHS } from "@/lib/pricing";
import { pageMeta } from "@/lib/seo";
import { CONTACT_EMAIL } from "@/components/SiteFooter";

export const metadata = pageMeta({
  title: "Terms of Service",
  description:
    "The terms governing your use of Reelform, including account rules, credits, generated content ownership and acceptable use.",
  path: "/terms",
});

export default function TermsPage() {
  return (
    <LegalShell label="LEGAL" title="Terms of Service" updated="July 19, 2026">
      <LegalSection heading="1. Agreement">
        <p>
          These Terms of Service (&ldquo;Terms&rdquo;) govern your use of Reelform (the
          &ldquo;Service&rdquo;), operated by Polidori.dev. By creating an account or using the
          Service you agree to these Terms. If you do not agree, do not use the Service.
        </p>
      </LegalSection>

      <LegalSection heading="2. The Service">
        <p>
          Reelform lets you generate AI videos (via Higgsfield) and AI-built websites (via
          Anthropic&rsquo;s Claude) from text prompts, preview the results, and download the
          generated files. AI output is probabilistic: we do not guarantee that any particular
          generation will match your expectations, and results may vary between runs.
        </p>
      </LegalSection>

      <LegalSection heading="3. Accounts">
        <p>
          You must provide accurate information and keep your credentials secure; you are
          responsible for activity under your account. You must be at least 16 years old (or the
          age of digital consent where you live) to use the Service.
        </p>
      </LegalSection>

      <LegalSection heading="4. Credits, plans, and billing">
        <ul className="list-disc pl-5 space-y-1.5">
          <li>
            The Service runs on prepaid credits. Every video generation and site build shows its
            credit price before you confirm it.
          </li>
          <li>
            Subscription plans refill your credit balance monthly and renew automatically until
            cancelled. You can cancel anytime; your plan stays active until the end of the paid
            period.
          </li>
          <li>Top-up credit packs are one-time purchases and never expire.</li>
          <li>
            Subscription credits roll over for up to {ROLLOVER_MONTHS} months. Your plan balance is
            capped at {ROLLOVER_MONTHS} months&rsquo; worth of credits, so you can miss a month
            without losing anything; credits above that cap are not carried past a renewal. Plan
            credits are always spent before top-up credits.
          </li>
          <li>
            Credits have no cash value outside the Service and are non-transferable. Refunds are
            handled per our{" "}
            <a href="/refunds" className="text-primary underline">
              Refund Policy
            </a>
            .
          </li>
          <li>
            Failed generations (where the provider returns an error and no output is produced) are
            automatically refunded in credits.
          </li>
        </ul>
      </LegalSection>

      <LegalSection heading="5. Your content and ownership">
        <p>
          You retain ownership of the prompts you submit. To the extent we hold any rights in the
          videos and websites generated for you, we assign them to you: you may use, modify, host,
          and commercialize your generated output freely, subject to the third-party provider terms
          that apply to AI-generated content (Anthropic and Higgsfield).
        </p>
        <p>
          You grant us a limited license to store and process your content solely to operate the
          Service. We do not use your content to train models and we do not publish it.
        </p>
      </LegalSection>

      <LegalSection heading="6. Acceptable use">
        <p>You agree not to use the Service to:</p>
        <ul className="list-disc pl-5 space-y-1.5">
          <li>generate illegal, infringing, defamatory, or deceptive content;</li>
          <li>impersonate real people or organizations without authorization;</li>
          <li>create malware, phishing pages, or content designed to defraud;</li>
          <li>circumvent usage limits, resell access, or reverse-engineer the Service;</li>
          <li>violate the acceptable-use policies of our AI providers.</li>
        </ul>
        <p>
          We may suspend or terminate accounts that violate these rules. Where reasonable, we will
          warn you first.
        </p>
      </LegalSection>

      <LegalSection heading="7. Availability and changes">
        <p>
          We aim for high availability but the Service is provided &ldquo;as is&rdquo; and
          &ldquo;as available&rdquo;, and depends on third-party AI providers we do not control. We
          may modify features, pricing, or credit costs; price changes never apply retroactively to
          credits you already hold.
        </p>
      </LegalSection>

      <LegalSection heading="8. Disclaimer and liability">
        <p>
          To the maximum extent permitted by law, we disclaim all warranties, express or implied,
          and our total liability for any claim arising from the Service is limited to the amount
          you paid us in the 12 months before the claim. Nothing in these Terms limits liability
          that cannot be limited by law, including your statutory consumer rights.
        </p>
      </LegalSection>

      <LegalSection heading="9. Termination">
        <p>
          You may delete your account at any time by contacting us. We may terminate or suspend
          access for breach of these Terms. On termination, unused subscription credits lapse;
          statutory refund rights are unaffected.
        </p>
      </LegalSection>

      <LegalSection heading="10. Contact">
        <p>
          Questions about these Terms? Email{" "}
          <a href={`mailto:${CONTACT_EMAIL}`} className="text-primary underline">
            {CONTACT_EMAIL}
          </a>
          .
        </p>
      </LegalSection>
    </LegalShell>
  );
}
