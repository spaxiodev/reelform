import { PRIVATE_PAGE } from "@/lib/seo";
import { AuthShell } from "@/components/AuthShell";
import { ForgotPasswordForm } from "@/components/PasswordRecovery";

export const metadata = { title: "Reset your password", ...PRIVATE_PAGE };

export default function ForgotPasswordPage() {
  return (
    <AuthShell
      label="PASSWORD RESET"
      title="Forgot your password?"
      intro="Enter the email on your account and we'll send you a link to choose a new one."
    >
      <ForgotPasswordForm />
    </AuthShell>
  );
}
