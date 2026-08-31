"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "@/components/ui/Toaster";
import { trackEvent } from "@/lib/analytics";

export function CheckoutButton({
  kind,
  id,
  className,
  children,
}: {
  kind: "plan" | "topup";
  id: string;
  className?: string;
  children: React.ReactNode;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function go() {
    setBusy(true);
    try {
      const res = await fetch("/api/stripe/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind, id }),
      });
      if (res.status === 401) {
        router.push(`/login?next=/pricing`);
        return;
      }
      const data = await res.json();
      if (data.url) {
        // Fires before the redirect — Stripe completion is confirmed
        // server-side by the webhook, not here.
        trackEvent("checkout_started", { kind, plan: id });
        location.href = data.url;
        return;
      }
      toast(data.error ?? "Checkout failed — please try again.", "error");
    } catch {
      toast("Network error — please try again.", "error");
    }
    setBusy(false);
  }

  return (
    <button onClick={go} disabled={busy} className={className}>
      {busy ? "Opening checkout…" : children}
    </button>
  );
}

export function PortalButton({ className, children }: { className?: string; children: React.ReactNode }) {
  const [busy, setBusy] = useState(false);

  async function go() {
    setBusy(true);
    try {
      const res = await fetch("/api/stripe/portal", { method: "POST" });
      const data = await res.json();
      if (data.url) {
        trackEvent("portal_opened");
        location.href = data.url;
        return;
      }
      toast(data.error ?? "Could not open the billing portal.", "error");
    } catch {
      toast("Network error — please try again.", "error");
    }
    setBusy(false);
  }

  return (
    <button onClick={go} disabled={busy} className={className}>
      {busy ? "Opening…" : children}
    </button>
  );
}
