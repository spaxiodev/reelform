"use client";

import { useState } from "react";
import { toast } from "@/components/ui/Toaster";

// The marketing consent switch on the account page. Saves on change (no
// separate button) and reports the recorded consent date back, so what the
// person sees here matches the footer of the emails they get.
export function EmailPreferences({
  initialOptIn,
  initialConsentAt,
}: {
  initialOptIn: boolean;
  initialConsentAt: string | null;
}) {
  const [optIn, setOptIn] = useState(initialOptIn);
  const [consentAt, setConsentAt] = useState(initialConsentAt);
  const [busy, setBusy] = useState(false);

  async function change(next: boolean) {
    setBusy(true);
    setOptIn(next);
    const res = await fetch("/api/email/preferences", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ optIn: next }),
    });
    setBusy(false);
    if (!res.ok) {
      setOptIn(!next);
      toast("Could not save your email preference.", "error");
      return;
    }
    const data = (await res.json()) as { optIn: boolean; consentAt: string | null };
    setOptIn(data.optIn);
    setConsentAt(data.consentAt);
    toast(data.optIn ? "Updates on." : "Updates off.", "success");
  }

  return (
    <div className="space-y-4">
      <label className="flex items-start gap-3 cursor-pointer">
        <input
          type="checkbox"
          className="mt-1 accent-[var(--color-primary,currentColor)]"
          checked={optIn}
          disabled={busy}
          onChange={(e) => change(e.target.checked)}
        />
        <span>
          <span className="block text-sm font-medium">Product updates and tips</span>
          <span className="block text-sm text-muted">
            An occasional email about new models, features, and how to get a better shot. Never
            more than a few a month. Unsubscribe any time, from here or from the link in every
            email.
          </span>
        </span>
      </label>
      <p className="text-xs text-faint">
        {optIn && consentAt
          ? `On since ${new Date(consentAt).toLocaleDateString(undefined, {
              month: "long",
              day: "numeric",
              year: "numeric",
            })}.`
          : "Off. Receipts and account notices are always sent, since they're about your account."}
      </p>
    </div>
  );
}
