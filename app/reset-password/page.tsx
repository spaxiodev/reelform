import { redirect } from "next/navigation";
import { PRIVATE_PAGE } from "@/lib/seo";
import { createSupabaseServer } from "@/lib/supabase/server";
import { AuthShell } from "@/components/AuthShell";
import { ResetPasswordForm } from "@/components/PasswordRecovery";

export const metadata = { title: "Choose a new password", ...PRIVATE_PAGE };

// The recovery email lands on /api/auth/callback, which verifies the token,
// sets a session cookie and sends the visitor here. No session means the link
// was never verified (expired, already used, or typed by hand), so send them
// back to request a fresh one rather than show a form that would fail.
export default async function ResetPasswordPage() {
  const supabase = await createSupabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?error=recovery_expired");

  return (
    <AuthShell
      label="PASSWORD RESET"
      title="Choose a new password"
      intro={
        <>
          You&rsquo;re signed in as <span className="text-ink font-medium">{user.email}</span>.
          Pick a new password of at least 8 characters.
        </>
      }
    >
      <ResetPasswordForm />
    </AuthShell>
  );
}
