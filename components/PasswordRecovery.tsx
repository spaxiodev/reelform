"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createSupabaseBrowser } from "@/lib/supabase/client";
import { toast } from "@/components/ui/Toaster";

// Step 1 of a password reset: ask Supabase to email a recovery link. The
// link points at /api/auth/callback (see the recovery email template), which
// verifies it and forwards to /reset-password.
export function ForgotPasswordForm() {
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const { error } = await createSupabaseBrowser().auth.resetPasswordForEmail(email.trim(), {
      redirectTo: `${location.origin}/api/auth/callback?next=/reset-password`,
    });
    setBusy(false);
    if (error) {
      setError(error.message);
      return;
    }
    setSent(true);
  }

  if (sent) {
    return (
      <div className="mt-8 card p-6">
        <p className="font-medium">Check your inbox</p>
        <p className="mt-2 text-sm text-muted leading-relaxed">
          If there&rsquo;s a Reelform account for{" "}
          <span className="text-ink font-medium">{email.trim()}</span>, a reset link is on its way.
          It expires in an hour. No email after a few minutes? Check spam, or{" "}
          <button
            type="button"
            className="text-primary font-medium hover:text-primary-deep"
            onClick={() => setSent(false)}
          >
            try again
          </button>
          .
        </p>
        <Link href="/login" className="mt-5 inline-block text-sm font-medium text-primary hover:text-primary-deep">
          ← Back to sign in
        </Link>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="mt-8 space-y-4">
      <div>
        <label className="mono-label block mb-2" htmlFor="fp-email">
          EMAIL
        </label>
        <input
          id="fp-email"
          type="email"
          required
          autoComplete="email"
          className="field"
          placeholder="you@studio.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
      </div>
      {error && <p className="text-danger text-sm">{error}</p>}
      <button type="submit" disabled={busy} className="btn-primary w-full">
        {busy ? "Sending…" : "Send reset link"}
      </button>
      <p className="text-sm text-muted">
        Signed in with Google? There&rsquo;s no password to reset, just{" "}
        <Link href="/login" className="text-primary font-medium hover:text-primary-deep">
          continue with Google
        </Link>
        .
      </p>
      <Link href="/login" className="inline-block text-sm text-muted hover:text-ink transition-colors">
        ← Back to sign in
      </Link>
    </form>
  );
}

// Step 2: the visitor arrived through a verified recovery link and holds a
// session, so a plain updateUser sets the new password.
export function ResetPasswordForm() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }
    if (password !== confirm) {
      setError("Passwords don't match.");
      return;
    }
    setBusy(true);
    setError(null);
    const { error } = await createSupabaseBrowser().auth.updateUser({ password });
    if (error) {
      setError(error.message);
      setBusy(false);
      return;
    }
    toast("Password updated. You're signed in.", "success");
    router.push("/dashboard");
    router.refresh();
  }

  return (
    <form onSubmit={submit} className="mt-8 space-y-4">
      <div>
        <label className="mono-label block mb-2" htmlFor="rp-pw">
          NEW PASSWORD
        </label>
        <input
          id="rp-pw"
          type="password"
          required
          minLength={8}
          autoComplete="new-password"
          className="field"
          placeholder="••••••••"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoFocus
        />
      </div>
      <div>
        <label className="mono-label block mb-2" htmlFor="rp-pw2">
          CONFIRM NEW PASSWORD
        </label>
        <input
          id="rp-pw2"
          type="password"
          required
          minLength={8}
          autoComplete="new-password"
          className="field"
          placeholder="••••••••"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
        />
      </div>
      {error && <p className="text-danger text-sm">{error}</p>}
      <button type="submit" disabled={busy} className="btn-primary w-full">
        {busy ? "Saving…" : "Save new password"}
      </button>
    </form>
  );
}
