import Link from "next/link";
import { AuthShell } from "@/components/AuthShell";
import { PRIVATE_PAGE } from "@/lib/seo";
import { verifyUnsubscribeToken } from "@/lib/email/unsubscribe";

export const metadata = { title: "Unsubscribe", ...PRIVATE_PAGE };

// Landing page for the unsubscribe link in every marketing email. Works
// signed out, on any device: the token in the link is all it needs. One
// button, no "are you sure", no survey.
export default async function UnsubscribePage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string; done?: string; error?: string }>;
}) {
  const { token, done, error } = await searchParams;
  const valid = Boolean(verifyUnsubscribeToken(token));

  if (done && valid) {
    return (
      <AuthShell
        label="EMAIL"
        title="You're unsubscribed."
        intro="No more product updates or tips from Reelform. Receipts and account notices still arrive, since those are about your account, not marketing."
      >
        <p className="mt-6 text-sm text-muted">
          Changed your mind later? Turn updates back on any time under{" "}
          <Link href="/account" className="text-primary font-medium hover:text-primary-deep">
            Account
          </Link>
          .
        </p>
      </AuthShell>
    );
  }

  if (!valid) {
    return (
      <AuthShell
        label="EMAIL"
        title="That link doesn't work."
        intro="It may have been cut short by your mail client, or the account it belonged to no longer exists."
      >
        <p className="mt-6 text-sm text-muted">
          You can still turn updates off from{" "}
          <Link href="/account" className="text-primary font-medium hover:text-primary-deep">
            your account
          </Link>
          , or reply to any of our emails with &ldquo;unsubscribe&rdquo; and we&apos;ll do it for
          you.
        </p>
      </AuthShell>
    );
  }

  return (
    <AuthShell
      label="EMAIL"
      title="Stop the updates?"
      intro="This turns off product updates and tips from Reelform for your account. Receipts and account notices keep coming, since you need those."
    >
      {error === "failed" && (
        <p className="mt-4 text-danger text-sm">Something went wrong on our side. Try once more.</p>
      )}
      <form method="post" action="/api/email/unsubscribe" className="mt-8">
        <input type="hidden" name="token" value={token} />
        <button type="submit" className="btn-primary w-full">
          Unsubscribe
        </button>
      </form>
      <p className="mt-4 text-xs text-faint">
        Takes effect immediately. You can turn them back on from your account settings.
      </p>
    </AuthShell>
  );
}
