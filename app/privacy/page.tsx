import { LegalShell, LegalSection } from "@/components/LegalShell";
import { pageMeta } from "@/lib/seo";
import { CONTACT_EMAIL } from "@/components/SiteFooter";

export const metadata = pageMeta({
  title: "Privacy Policy",
  description:
    "What data Reelform collects, how it is used, who processes it, and how to exercise your rights over it.",
  path: "/privacy",
});

export default function PrivacyPage() {
  return (
    <LegalShell label="LEGAL" title="Privacy Policy" updated="September 4, 2026">
      <LegalSection heading="1. Who we are">
        <p>
          Reelform (&ldquo;we&rdquo;, &ldquo;us&rdquo;) is operated by Polidori.dev, based in
          Quebec, Canada. This policy explains what personal data we collect when you use Reelform
          (the &ldquo;Service&rdquo;), why we collect it, and the choices you have. For any privacy
          question or request, contact us at{" "}
          <a href={`mailto:${CONTACT_EMAIL}`} className="text-primary underline">
            {CONTACT_EMAIL}
          </a>
          .
        </p>
        <p>
          Under Quebec&apos;s Act respecting the protection of personal information in the private
          sector (Law 25), the person in charge of the protection of personal information at
          Polidori.dev can be reached at that same address.
        </p>
      </LegalSection>

      <LegalSection heading="2. Data we collect">
        <p>
          <strong className="text-ink">Account data.</strong> Your email address and authentication
          credentials, managed through our authentication provider (Supabase).
        </p>
        <p>
          <strong className="text-ink">Content you create.</strong> The prompts you write, the
          videos you generate, and the websites Claude builds for you. These are stored so you can
          return to your projects.
        </p>
        <p>
          <strong className="text-ink">Payment data.</strong> Payments are processed by Stripe. We
          never see or store your full card number. We keep only your Stripe customer reference,
          plan, and credit balance.
        </p>
        <p>
          <strong className="text-ink">Usage data.</strong> Basic technical logs (IP address,
          browser type, pages visited, timestamps) used for security, debugging, and abuse
          prevention.
        </p>
      </LegalSection>

      <LegalSection heading="3. How we use your data">
        <p>We use your data to:</p>
        <ul className="list-disc pl-5 space-y-1.5">
          <li>provide the Service: generate videos, build sites, and store your projects;</li>
          <li>process payments and manage your credit balance;</li>
          <li>
            send account emails: a welcome message, receipts, plan changes, and security notices;
          </li>
          <li>send product updates and tips by email, only if you asked us to (see section 5);</li>
          <li>keep the Service secure and prevent abuse;</li>
          <li>comply with legal obligations.</li>
        </ul>
        <p>We do not sell your personal data, and we do not use your content to train AI models.</p>
      </LegalSection>

      <LegalSection heading="4. Third-party processors">
        <p>
          To operate the Service, your data is shared with a small number of processors, strictly
          for the purposes above:
        </p>
        <ul className="list-disc pl-5 space-y-1.5">
          <li>
            <strong className="text-ink">Anthropic</strong>: your prompts are sent to the Claude
            API to build your websites;
          </li>
          <li>
            <strong className="text-ink">Higgsfield</strong>: your video prompts are sent
            to generate footage;
          </li>
          <li>
            <strong className="text-ink">Supabase</strong>: authentication, database, and file
            storage;
          </li>
          <li>
            <strong className="text-ink">Stripe</strong>: payment processing;
          </li>
          <li>
            <strong className="text-ink">Vercel</strong>: hosting and infrastructure;
          </li>
          <li>
            <strong className="text-ink">Resend</strong>: delivery of the emails we send you. Your
            email address, first name, and whether you have opted in to updates are shared with
            it for that purpose.
          </li>
        </ul>
        <p>
          Some of these providers store data outside Quebec and Canada, chiefly in the United
          States. Where that is the case, we have assessed the transfer as required by Law 25 and
          rely on each provider&apos;s contractual data-protection commitments.
        </p>
      </LegalSection>

      <LegalSection heading="5. Marketing email">
        <p>
          We send two kinds of email. <strong className="text-ink">Account email</strong> (a
          welcome message, receipts, plan changes, password and security notices) is part of
          running your account and is sent to every account holder.{" "}
          <strong className="text-ink">Product updates and tips</strong> are optional. We send
          them only if you ticked the box at signup or turned them on in your account, in line
          with Canada&apos;s Anti-Spam Legislation (CASL) and Law 25. The box is never pre-checked.
        </p>
        <p>
          We record when and how you gave that consent, and quote it back to you at the bottom of
          every such email. You can withdraw it at any time, at no cost, from the unsubscribe link
          in any of those emails, from the Email section of your{" "}
          <a href="/account" className="text-primary underline">
            account
          </a>
          , or by replying to any email with &ldquo;unsubscribe&rdquo;. Withdrawal takes effect
          immediately.
        </p>
        <p>
          We do not buy, rent, or share email lists, and we do not send email on anyone
          else&apos;s behalf.
        </p>
      </LegalSection>

      <LegalSection heading="6. Cookies">
        <p>
          We use only essential cookies: session cookies that keep you signed in and security
          cookies used by our payment and authentication providers. We do not use advertising or
          cross-site tracking cookies.
        </p>
      </LegalSection>

      <LegalSection heading="7. Data retention">
        <p>
          We keep your account data and projects for as long as your account is active. If you
          delete your account, we delete your personal data and content within 30 days, except
          where we must retain records for legal or accounting purposes (e.g. invoices). A log of
          the emails we sent you (address, type of email, date) is kept for the same period so we
          can show what was sent and under what consent.
        </p>
      </LegalSection>

      <LegalSection heading="8. Your rights">
        <p>
          Under Law 25, and depending on where you live also under the GDPR and CCPA, you have the
          right to access, correct, export, or delete your personal data, to withdraw consent, and
          to object to or restrict certain processing. To exercise any of these rights, email{" "}
          <a href={`mailto:${CONTACT_EMAIL}`} className="text-primary underline">
            {CONTACT_EMAIL}
          </a>. We respond within 30 days. If you are not satisfied with our answer, you can
          complain to the Commission d&apos;accès à l&apos;information du Québec.
        </p>
      </LegalSection>

      <LegalSection heading="9. Security">
        <p>
          Data is encrypted in transit (TLS) and at rest by our infrastructure providers. Access to
          production data is limited to what is strictly necessary to operate the Service.
        </p>
      </LegalSection>

      <LegalSection heading="10. Children">
        <p>
          The Service is not directed at children under 16, and we do not knowingly collect their
          data. If you believe a child has provided us personal data, contact us and we will delete
          it.
        </p>
      </LegalSection>

      <LegalSection heading="11. Changes to this policy">
        <p>
          We may update this policy from time to time. Material changes will be announced on this
          page with an updated date, and by email for significant changes.
        </p>
      </LegalSection>
    </LegalShell>
  );
}
