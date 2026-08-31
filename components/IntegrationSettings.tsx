"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "@/components/ui/Toaster";

// Account → Integrations. Connecting is a plain link (it leaves for the
// provider's consent screen); disconnecting is the only thing needing state.

export interface IntegrationView {
  provider: "vercel" | "supabase";
  connected: boolean;
  accountName: string | null;
  connectedAt: string | null;
}

const META = {
  vercel: {
    name: "Vercel",
    role: "Hosting",
    blurb:
      "Deploys your finished site — page, videos and all — as a production deployment in your own Vercel account. You keep the project, the domain and the bill.",
  },
  supabase: {
    name: "Supabase",
    role: "Database & forms",
    blurb:
      "Gives the site a backend: a submissions table in your own Supabase project, with the site's forms wired straight to it. Can also host the files from Storage.",
  },
} as const;

export function IntegrationSettings({ integrations }: { integrations: IntegrationView[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);

  async function disconnect(provider: "vercel" | "supabase") {
    setBusy(provider);
    try {
      const res = await fetch(`/api/integrations?provider=${provider}`, { method: "DELETE" });
      if (!res.ok) throw new Error();
      toast(`${META[provider].name} disconnected. Live sites keep running.`, "success");
      router.refresh();
    } catch {
      toast("Could not disconnect — try again.", "error");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-4">
      {integrations.map((integration) => {
        const meta = META[integration.provider];
        return (
          <div key={integration.provider} className="card p-6">
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <p className="mono-label">{meta.role.toUpperCase()}</p>
                <h2 className="mt-1 text-lg font-medium">{meta.name}</h2>
                <p className="mt-2 text-sm text-muted leading-relaxed max-w-prose">{meta.blurb}</p>
                {integration.connected && (
                  <p className="mt-3 text-sm">
                    <span className="text-primary">● Connected</span>
                    {integration.accountName && (
                      <span className="text-muted"> as {integration.accountName}</span>
                    )}
                  </p>
                )}
              </div>
              {integration.connected ? (
                <button
                  onClick={() => disconnect(integration.provider)}
                  disabled={busy === integration.provider}
                  className="btn-ghost !py-2 !px-4 !text-xs shrink-0"
                >
                  {busy === integration.provider ? "…" : "Disconnect"}
                </button>
              ) : (
                <a
                  href={`/api/integrations/${integration.provider}/connect?next=/account/integrations`}
                  className="btn-primary !py-2 !px-4 !text-xs shrink-0"
                >
                  Connect
                </a>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
