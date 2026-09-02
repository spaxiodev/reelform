"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createSupabaseBrowser } from "@/lib/supabase/client";
import { toast } from "@/components/ui/Toaster";

export function ChangePasswordForm() {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (password.length < 8) {
      toast("Password must be at least 8 characters.", "error");
      return;
    }
    if (password !== confirm) {
      toast("Passwords don't match.", "error");
      return;
    }
    setBusy(true);
    const { error } = await createSupabaseBrowser().auth.updateUser({ password });
    setBusy(false);
    if (error) {
      toast(error.message, "error");
    } else {
      toast("Password updated.", "success");
      setPassword("");
      setConfirm("");
    }
  }

  return (
    <form onSubmit={submit} className="mt-5 max-w-sm space-y-4">
      <div>
        <label className="mono-label block mb-1.5" htmlFor="sec-pw">
          NEW PASSWORD
        </label>
        <input
          id="sec-pw"
          type="password"
          className="field"
          autoComplete="new-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          minLength={8}
          required
        />
      </div>
      <div>
        <label className="mono-label block mb-1.5" htmlFor="sec-pw2">
          CONFIRM NEW PASSWORD
        </label>
        <input
          id="sec-pw2"
          type="password"
          className="field"
          autoComplete="new-password"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          minLength={8}
          required
        />
      </div>
      <button type="submit" disabled={busy} className="btn-primary">
        {busy ? "Updating…" : "Update password"}
      </button>
    </form>
  );
}

export function SignOutEverywhereButton() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function go() {
    setBusy(true);
    const { error } = await createSupabaseBrowser().auth.signOut({ scope: "global" });
    if (error) {
      toast(error.message, "error");
      setBusy(false);
      return;
    }
    router.push("/login");
    router.refresh();
  }

  return (
    <button onClick={go} disabled={busy} className="btn-ghost">
      {busy ? "Signing out…" : "Sign out of all devices"}
    </button>
  );
}

// Changing the sign-in email. Supabase's secure email change is on by
// default, so a confirmation link goes to BOTH the current and the new
// address, and the change only lands once both are clicked. Each link comes
// back through /api/auth/callback, which forwards to this page with a notice.
export function ChangeEmailForm({ currentEmail }: { currentEmail: string }) {
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [pending, setPending] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const next = email.trim().toLowerCase();
    if (next === currentEmail.toLowerCase()) {
      toast("That's already your email.", "error");
      return;
    }
    setBusy(true);
    const { error } = await createSupabaseBrowser().auth.updateUser(
      { email: next },
      { emailRedirectTo: `${location.origin}/api/auth/callback?next=/account/security` }
    );
    setBusy(false);
    if (error) {
      toast(error.message, "error");
      return;
    }
    setPending(next);
    setEmail("");
  }

  return (
    <form onSubmit={submit} className="mt-5 max-w-sm space-y-4">
      <div>
        <label className="mono-label block mb-1.5" htmlFor="sec-email">
          NEW EMAIL
        </label>
        <input
          id="sec-email"
          type="email"
          className="field"
          autoComplete="email"
          placeholder="you@studio.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
        />
      </div>
      {pending && (
        <p className="text-sm text-primary leading-relaxed">
          Check both inboxes. We sent a confirmation link to {currentEmail} and to {pending}; the
          change takes effect once you&rsquo;ve opened both.
        </p>
      )}
      <button type="submit" disabled={busy} className="btn-primary">
        {busy ? "Sending…" : "Change email"}
      </button>
    </form>
  );
}
