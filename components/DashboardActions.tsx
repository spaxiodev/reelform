"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createSupabaseBrowser } from "@/lib/supabase/client";
import { Modal } from "@/components/ui/Modal";
import { toast } from "@/components/ui/Toaster";

export function NewProjectButton({ variant = "primary" }: { variant?: "primary" | "ghost" }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [industry, setIndustry] = useState("");
  const [busy, setBusy] = useState(false);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const res = await fetch("/api/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, industry }),
      });
      const data = await res.json();
      if (data.id) {
        router.push(`/studio/${data.id}`);
      } else {
        toast(data.error ?? "Could not create the production.", "error");
        setBusy(false);
      }
    } catch {
      toast("Network error — please try again.", "error");
      setBusy(false);
    }
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className={variant === "primary" ? "btn-primary" : "btn-ghost"}
      >
        + New production
      </button>

      <Modal open={open} onClose={() => setOpen(false)} eyebrow="NEW PRODUCTION" title="Name your project">
        <form onSubmit={create} className="space-y-4">
          <div>
            <label className="mono-label block mb-1.5" htmlFor="np-name">
              PROJECT NAME
            </label>
            <input
              id="np-name"
              className="field"
              placeholder="e.g. Harbor & Bean Coffee"
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoFocus
              required
            />
          </div>
          <div>
            <label className="mono-label block mb-1.5" htmlFor="np-industry">
              INDUSTRY <span className="normal-case font-normal">(optional)</span>
            </label>
            <input
              id="np-industry"
              className="field"
              placeholder="e.g. Specialty coffee roastery"
              value={industry}
              onChange={(e) => setIndustry(e.target.value)}
            />
          </div>
          <p className="text-xs text-faint leading-relaxed">
            You&apos;ll describe the website and direct your hero video in the studio — nothing is
            generated yet.
          </p>
          <button type="submit" disabled={busy || !name.trim()} className="btn-primary w-full">
            {busy ? "Creating…" : "Open the studio"}
          </button>
        </form>
      </Modal>
    </>
  );
}

export function SignOutButton() {
  const router = useRouter();
  return (
    <button
      className="text-sm text-muted hover:text-ink transition-colors"
      onClick={async () => {
        await createSupabaseBrowser().auth.signOut();
        router.push("/");
        router.refresh();
      }}
    >
      Sign out
    </button>
  );
}
