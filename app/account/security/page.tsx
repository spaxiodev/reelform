import { redirect } from "next/navigation";
import { PRIVATE_PAGE } from "@/lib/seo";
import { createSupabaseServer } from "@/lib/supabase/server";
import { DeleteAccountButton } from "@/components/AccountActions";
import {
  ChangeEmailForm,
  ChangePasswordForm,
  SignOutEverywhereButton,
} from "@/components/SecurityActions";

export const metadata = { title: "Security", ...PRIVATE_PAGE };

// Banners for the emailed flows that land back here via /api/auth/callback.
const NOTICES: Record<string, string> = {
  email_changed:
    "Email confirmation received. Once both the old and the new address have confirmed, the new one shows below.",
};

export default async function SecurityPage({
  searchParams,
}: {
  searchParams: Promise<{ notice?: string }>;
}) {
  const { notice } = await searchParams;
  const banner = notice ? NOTICES[notice] : undefined;
  const supabase = await createSupabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/account/security");

  const { data: profile } = await supabase
    .from("profiles")
    .select("email")
    .eq("id", user.id)
    .single();

  const email = profile?.email ?? user.email ?? "";

  return (
    <div className="space-y-4">
      {banner && (
        <p className="rounded-xl bg-primary-soft text-primary-deep px-4 py-3 text-sm">{banner}</p>
      )}

      {/* Sign-in details */}
      <section className="card p-6 md:p-8">
        <h2 className="text-xl font-medium tracking-tight">Sign-in details</h2>
        <dl className="mt-5 grid sm:grid-cols-2 gap-x-8 gap-y-5">
          <div>
            <dt className="mono-label">EMAIL</dt>
            <dd className="mt-1 text-sm">{email}</dd>
          </div>
          <div>
            <dt className="mono-label">LAST SIGN-IN</dt>
            <dd className="mt-1 text-sm">
              {user.last_sign_in_at
                ? new Date(user.last_sign_in_at).toLocaleString(undefined, {
                    month: "short",
                    day: "numeric",
                    year: "numeric",
                    hour: "2-digit",
                    minute: "2-digit",
                  })
                : "-"}
            </dd>
          </div>
        </dl>
      </section>

      {/* Email */}
      <section className="card p-6 md:p-8">
        <h2 className="text-xl font-medium tracking-tight">Change email</h2>
        <p className="mt-2 text-sm text-muted">
          We&apos;ll send a confirmation link to both your current and your new address. Your
          sign-in email changes once both are confirmed.
        </p>
        <ChangeEmailForm currentEmail={email} />
      </section>

      {/* Password */}
      <section className="card p-6 md:p-8">
        <h2 className="text-xl font-medium tracking-tight">Change password</h2>
        <p className="mt-2 text-sm text-muted">
          Pick a strong password of at least 8 characters. You&apos;ll stay signed in on this
          device. Forgot the current one? Sign out and use{" "}
          <a href="/forgot-password" className="text-primary font-medium hover:text-primary-deep">
            Forgot password
          </a>{" "}
          on the sign-in page.
        </p>
        <ChangePasswordForm />
      </section>

      {/* Sessions */}
      <section className="card p-6 md:p-8">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h2 className="text-xl font-medium tracking-tight">Sessions</h2>
            <p className="mt-2 text-sm text-muted max-w-md">
              If you signed in on a shared or lost device, sign out everywhere. You&apos;ll need to
              sign back in on every device, including this one.
            </p>
          </div>
          <SignOutEverywhereButton />
        </div>
      </section>

      {/* Danger zone */}
      <section className="card p-6 md:p-8 border-danger/30">
        <h2 className="text-xl font-medium tracking-tight text-danger">Danger zone</h2>
        <p className="mt-2 text-sm text-muted leading-relaxed">
          Deleting your account permanently removes your profile, productions, videos, and remaining
          credits. Active subscriptions are canceled. This cannot be undone.
        </p>
        <div className="mt-5">
          <DeleteAccountButton email={email} />
        </div>
      </section>
    </div>
  );
}
