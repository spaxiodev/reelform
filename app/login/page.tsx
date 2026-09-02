"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { createSupabaseBrowser } from "@/lib/supabase/client";
import { SiteFooter } from "@/components/SiteFooter";
import { trackEvent } from "@/lib/analytics";

// Reasons /api/auth/callback can bounce someone back here. Anything not
// listed is shown with its raw code, so a new provider error is diagnosable
// from the URL instead of hiding behind one generic message.
const AUTH_ERRORS: Record<string, string> = {
  no_code: "Sign-in link was invalid or expired. Try again.",
  exchange_failed: "We could not finish signing you in. Try again in this same browser tab.",
  access_denied: "You cancelled the Google sign-in. Nothing was changed.",
  otp_expired: "That email link has expired or was already used. Sign in to request a new one.",
  recovery_expired:
    "That password reset link has expired or was already used. Request a new one below.",
};

// Friendly confirmations after an emailed action completes.
const AUTH_NOTICES: Record<string, string> = {
  password_reset: "Your password was updated. Sign in with the new one.",
};

// Supabase's message when the address exists but was never confirmed. Matched
// loosely so a wording change upstream degrades to the raw message rather than
// hiding the resend button behind a typo.
const UNCONFIRMED = /not confirmed/i;

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [mode, setMode] = useState<"signin" | "signup">(
    searchParams.get("mode") === "signup" ? "signup" : "signin"
  );
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [username, setUsername] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(() => {
    const key = searchParams.get("notice");
    return key ? (AUTH_NOTICES[key] ?? null) : null;
  });
  const [error, setError] = useState<string | null>(() => {
    const reason = searchParams.get("error");
    if (!reason) return null;
    return AUTH_ERRORS[reason] ?? `Sign-in failed (${reason}). Try again.`;
  });
  // Shown once an account exists but its confirmation email hasn't been acted
  // on: right after signup, or when a sign-in is refused for that reason.
  const [canResend, setCanResend] = useState(false);
  const [resent, setResent] = useState(false);

  const next = searchParams.get("next") ?? "/dashboard";

  async function resendConfirmation() {
    if (!email) {
      setError("Enter your email above first, then resend.");
      return;
    }
    setBusy(true);
    const { error } = await createSupabaseBrowser().auth.resend({
      type: "signup",
      email,
      options: { emailRedirectTo: `${location.origin}/api/auth/callback` },
    });
    setBusy(false);
    if (error) {
      setError(error.message);
      return;
    }
    setError(null);
    setResent(true);
    setNotice("Confirmation email sent again. Give it a minute and check spam too.");
  }

  async function signInWithGoogle() {
    setBusy(true);
    setError(null);
    setNotice(null);
    if (mode === "signup") trackEvent("signup_started", { method: "google" });
    const supabase = createSupabaseBrowser();
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${location.origin}/api/auth/callback?next=${encodeURIComponent(next)}`,
      },
    });
    if (error) {
      setError(error.message);
      setBusy(false);
    }
    // On success the browser leaves for Google, keep the button disabled.
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setNotice(null);
    const supabase = createSupabaseBrowser();

    if (mode === "signup") {
      const handle = username.trim();
      if (!/^[A-Za-z0-9_]{3,24}$/.test(handle)) {
        setError("Usernames are 3–24 characters: letters, numbers and underscores only.");
        setBusy(false);
        return;
      }
      const { data: taken } = await supabase
        .from("public_profiles")
        .select("id")
        .ilike("username", handle)
        .maybeSingle();
      if (taken) {
        setError(`@${handle} is already taken. Try another username.`);
        setBusy(false);
        return;
      }
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          emailRedirectTo: `${location.origin}/api/auth/callback`,
          data: { username: handle, full_name: fullName.trim() },
        },
      });
      if (error) {
        setError(error.message);
      } else if (data.session) {
        // Email confirmation is off: the account is live immediately.
        trackEvent("signup_completed", { method: "password", confirmed: true });
        router.push(next);
        router.refresh();
        return;
      } else {
        // Account created but gated behind the confirmation email.
        trackEvent("signup_started", { method: "password" });
        setNotice("Check your email to confirm your account, then sign in.");
        setCanResend(true);
      }
    } else {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) {
        setError(
          UNCONFIRMED.test(error.message)
            ? "This email hasn't been confirmed yet. Open the link we sent you, or resend it below."
            : error.message
        );
        setCanResend(UNCONFIRMED.test(error.message));
      } else {
        router.push(next);
        router.refresh();
        return;
      }
    }
    setBusy(false);
  }

  return (
    <div className="min-h-screen flex flex-col">
      <header className="px-6 md:px-10 py-5 border-b border-line">
        <Link href="/" className="flex items-center gap-3 w-fit">
          <span className="rec-dot" aria-hidden />
          <span className="font-semibold tracking-tight text-lg">
            Reel<span className="text-primary">form</span>
          </span>
        </Link>
      </header>

      <main id="main" className="flex-1 flex items-center justify-center px-6 py-16">
        <div className="w-full max-w-md">
          <p className="mono-label">{mode === "signup" ? "NEW PRODUCTION" : "WELCOME BACK"}</p>
          <h1 className="mt-3 text-4xl font-medium tracking-tight">
            {mode === "signup" ? "Start your first take" : "Back to the cutting room"}
          </h1>
          {mode === "signup" && (
            <p className="mt-2 text-muted">Your first website is free: a hero video and a full site build.</p>
          )}

          <button
            type="button"
            onClick={signInWithGoogle}
            disabled={busy}
            className="btn-ghost w-full mt-8"
          >
            <svg viewBox="0 0 18 18" width="18" height="18" aria-hidden focusable="false">
              <path
                fill="#4285F4"
                d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.92c1.7-1.57 2.68-3.88 2.68-6.62z"
              />
              <path
                fill="#34A853"
                d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.92-2.26c-.81.54-1.84.86-3.04.86-2.34 0-4.32-1.58-5.03-3.7H.96v2.33A9 9 0 0 0 9 18z"
              />
              <path
                fill="#FBBC05"
                d="M3.97 10.72a5.41 5.41 0 0 1 0-3.44V4.95H.96a9 9 0 0 0 0 8.1l3.01-2.33z"
              />
              <path
                fill="#EA4335"
                d="M9 3.58c1.32 0 2.5.45 3.44 1.35l2.58-2.58C13.46.89 11.43 0 9 0A9 9 0 0 0 .96 4.95l3.01 2.33C4.68 5.16 6.66 3.58 9 3.58z"
              />
            </svg>
            Continue with Google
          </button>

          <div className="mt-6 flex items-center gap-3">
            <span className="h-px flex-1 bg-line" />
            <span className="mono-label">OR</span>
            <span className="h-px flex-1 bg-line" />
          </div>

          <form onSubmit={submit} className="mt-6 space-y-4">
            {mode === "signup" && (
              <>
                <div>
                  <label className="mono-label block mb-2" htmlFor="fullName">
                    FULL NAME
                  </label>
                  <input
                    id="fullName"
                    type="text"
                    required
                    maxLength={80}
                    className="field"
                    placeholder="Ada Lovelace"
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                  />
                </div>
                <div>
                  <label className="mono-label block mb-2" htmlFor="username">
                    USERNAME
                  </label>
                  <input
                    id="username"
                    type="text"
                    required
                    minLength={3}
                    maxLength={24}
                    pattern="[A-Za-z0-9_]{3,24}"
                    title="3–24 characters: letters, numbers and underscores"
                    autoCapitalize="none"
                    autoCorrect="off"
                    spellCheck={false}
                    className="field"
                    placeholder="ada_films"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                  />
                  <p className="mt-1.5 text-xs text-faint">
                    Your public handle, shown on everything you publish and share.
                  </p>
                </div>
              </>
            )}
            <div>
              <label className="mono-label block mb-2" htmlFor="email">
                EMAIL
              </label>
              <input
                id="email"
                type="email"
                required
                className="field"
                placeholder="you@studio.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
            <div>
              <div className="flex items-baseline justify-between mb-2">
                <label className="mono-label" htmlFor="password">
                  PASSWORD
                </label>
                {mode === "signin" && (
                  <Link
                    href="/forgot-password"
                    className="text-xs font-medium text-primary hover:text-primary-deep"
                  >
                    Forgot password?
                  </Link>
                )}
              </div>
              <input
                id="password"
                type="password"
                required
                minLength={8}
                className="field"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>

            {error && <p className="text-danger text-sm">{error}</p>}
            {notice && <p className="text-primary text-sm">{notice}</p>}
            {canResend && !resent && (
              <button
                type="button"
                onClick={resendConfirmation}
                disabled={busy}
                className="text-sm font-medium text-primary hover:text-primary-deep"
              >
                Resend confirmation email
              </button>
            )}

            <button type="submit" disabled={busy} className="btn-primary w-full">
              {busy ? "One moment…" : mode === "signup" ? "Create account" : "Sign in"}
            </button>
          </form>

          <button
            className="mt-6 text-sm text-muted hover:text-ink transition-colors"
            onClick={() => {
              setMode(mode === "signup" ? "signin" : "signup");
              setError(null);
              setNotice(null);
              setCanResend(false);
              setResent(false);
            }}
          >
            {mode === "signup" ? "Already have an account? Sign in" : "No account yet? Start free"}
          </button>
        </div>
      </main>

      <SiteFooter />
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}
