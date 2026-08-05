import { LegalShell, LegalSection } from "@/components/LegalShell";
import { CONTACT_EMAIL } from "@/components/SiteFooter";

export const metadata = { title: "Privacy Policy — Reelform" };

export default function PrivacyPage() {
  return (
    <LegalShell label="LEGAL" title="Privacy Policy" updated="July 19, 2026">
      <LegalSection heading="1. Who we are">
        <p>
          Reelform (&ldquo;we&rdquo;, &ldquo;us&rdquo;) is operated by Polidori.dev. This policy
          explains what personal data we collect when you use reelform at polidori.dev (the
          &ldquo;Service&rdquo;), why we collect it, and the choices you have. For any privacy
          question or request, contact us at{" "}
          <a href={`mailto:${CONTACT_EMAIL}`} className="text-primary underline">
            {CONTACT_EMAIL}
          </a>
          .
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
          never see or store your full card number — we keep only your Stripe customer reference,
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
          <li>provide the Service — generate videos, build sites, and store your projects;</li>
          <li>process payments and manage your credit balance;</li>
          <li>send transactional emails (receipts, account notices);</li>
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
            <strong className="text-ink">Anthropic</strong> — your prompts are sent to the Claude
            API to build your websites;
          </li>
          <li>
            <strong className="text-ink">Seedance (BytePlus)</strong> — your video prompts are sent
            to generate footage;
          </li>
          <li>
            <strong className="text-ink">Supabase</strong> — authentication, database, and file
            storage;
          </li>
          <li>
            <strong className="text-ink">Stripe</strong> — payment processing;
          </li>
          <li>
            <strong className="text-ink">Vercel</strong> — hosting and infrastructure.
          </li>
        </ul>
      </LegalSection>

      <LegalSection heading="5. Cookies">
        <p>
          We use only essential cookies: session cookies that keep you signed in and security
          cookies used by our payment and authentication providers. We do not use advertising or
          cross-site tracking cookies.
        </p>
      </LegalSection>

      <LegalSection heading="6. Data retention">
        <p>
          We keep your account data and projects for as long as your account is active. If you
          delete your account, we delete your personal data and content within 30 days, except
          where we must retain records for legal or accounting purposes (e.g. invoices).
        </p>
      </LegalSection>

      <LegalSection heading="7. Your rights">
        <p>
          Depending on where you live (including under the GDPR and CCPA), you may have the right
          to access, correct, export, or delete your personal data, and to object to or restrict
          certain processing. To exercise any of these rights, email{" "}
          <a href={`mailto:${CONTACT_EMAIL}`} className="text-primary underline">
            {CONTACT_EMAIL}
          </a>{" "}
          — we respond within 30 days.
        </p>
      </LegalSection>

      <LegalSection heading="8. Security">
        <p>
          Data is encrypted in transit (TLS) and at rest by our infrastructure providers. Access to
          production data is limited to what is strictly necessary to operate the Service.
        </p>
      </LegalSection>

      <LegalSection heading="9. Children">
        <p>
          The Service is not directed at children under 16, and we do not knowingly collect their
          data. If you believe a child has provided us personal data, contact us and we will delete
          it.
        </p>
      </LegalSection>

      <LegalSection heading="10. Changes to this policy">
        <p>
          We may update this policy from time to time. Material changes will be announced on this
          page with an updated date, and — for significant changes — by email.
        </p>
      </LegalSection>
    </LegalShell>
  );
}
