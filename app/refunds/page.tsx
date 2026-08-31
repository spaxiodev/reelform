import { LegalShell, LegalSection } from "@/components/LegalShell";
import { pageMeta } from "@/lib/seo";
import { CONTACT_EMAIL } from "@/components/SiteFooter";

export const metadata = pageMeta({
  title: "Refund Policy",
  description:
    "When Reelform refunds credits and payments, including automatic refunds for failed video renders and site builds.",
  path: "/refunds",
});

export default function RefundsPage() {
  return (
    <LegalShell label="LEGAL" title="Refund Policy" updated="July 19, 2026">
      <LegalSection heading="1. The short version">
        <p>
          Failed generations are always refunded in credits, automatically. Unused purchases can be
          refunded in money within 14 days. Credits you have already spent on successful
          generations are not refundable, because the underlying AI compute has already been paid
          for on your behalf.
        </p>
      </LegalSection>

      <LegalSection heading="2. Automatic credit refunds">
        <p>
          If a video generation or site build fails (the provider returns an error and you receive
          no output), the credits for that action are automatically returned to your balance. You
          do not need to contact us. If you believe an automatic refund was missed, email us and we
          will fix it.
        </p>
      </LegalSection>

      <LegalSection heading="3. Top-up credit packs">
        <p>
          Top-up purchases are refundable in full within 14 days of purchase, provided the credits
          are entirely unused. Once any credits from a pack have been spent, the pack is no longer
          refundable, but the remaining credits never expire.
        </p>
      </LegalSection>

      <LegalSection heading="4. Subscriptions">
        <ul className="list-disc pl-5 space-y-1.5">
          <li>
            You can cancel your subscription at any time from your dashboard or by emailing us.
            Cancellation stops future renewals; your plan and credits remain usable until the end
            of the current billing period.
          </li>
          <li>
            A new subscription (first payment) is refundable in full within 14 days if none of that
            month&rsquo;s credits have been used.
          </li>
          <li>
            Renewal payments are refundable within 14 days of the charge if none of the renewed
            credits have been used, for example if you forgot to cancel.
          </li>
        </ul>
      </LegalSection>

      <LegalSection heading="5. What we don't refund">
        <ul className="list-disc pl-5 space-y-1.5">
          <li>
            Credits spent on successful generations, including output you dislike creatively. AI
            output varies; the Service lets you preview and reshoot before committing, and only
            charges for what actually runs.
          </li>
          <li>Free signup or promotional credits (they have no cash value).</li>
          <li>Partially used top-up packs or partially used subscription months.</li>
        </ul>
      </LegalSection>

      <LegalSection heading="6. EU/UK consumers">
        <p>
          If you are in the EU or UK you have a 14-day right of withdrawal on digital purchases.
          By purchasing credits and using them, you request immediate performance and acknowledge
          that the right of withdrawal lapses for credits already consumed; it remains intact for
          unused purchases as described above.
        </p>
      </LegalSection>

      <LegalSection heading="7. How to request a refund">
        <p>
          Email{" "}
          <a href={`mailto:${CONTACT_EMAIL}`} className="text-primary underline">
            {CONTACT_EMAIL}
          </a>{" "}
          from your account email with the charge date and amount. We respond within 2 business
          days, and approved refunds are returned to your original payment method via Stripe
          (typically 5–10 business days to appear).
        </p>
      </LegalSection>
    </LegalShell>
  );
}
