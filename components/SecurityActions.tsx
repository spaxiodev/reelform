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
