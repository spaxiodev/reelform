"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createSupabaseBrowser } from "@/lib/supabase/client";
import { Modal } from "@/components/ui/Modal";
import { toast } from "@/components/ui/Toaster";

export function DeleteAccountButton({ email }: { email: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);

  async function destroy(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const res = await fetch("/api/account/delete", { method: "POST" });
      const data = await res.json();
      if (!res.ok) {
        toast(data.error ?? "Could not delete the account.", "error");
        setBusy(false);
        return;
      }
      await createSupabaseBrowser().auth.signOut();
      router.push("/");
      router.refresh();
    } catch {
      toast("Network error. Please try again.", "error");
      setBusy(false);
    }
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="text-sm font-medium text-danger border border-danger/40 rounded-xl px-4 py-2 hover:bg-danger/10 transition-colors"
      >
        Delete account
      </button>

      <Modal open={open} onClose={() => setOpen(false)} eyebrow="DANGER ZONE" title="Delete your account?">
        <form onSubmit={destroy} className="space-y-4">
          <p className="text-sm text-muted leading-relaxed">
            This permanently deletes your profile, all productions, and any remaining credits, and
            cancels any active subscription. There is no undo.
          </p>
          <div>
            <label className="mono-label block mb-1.5" htmlFor="da-confirm">
              TYPE YOUR EMAIL TO CONFIRM
            </label>
            <input
              id="da-confirm"
              className="field"
              placeholder={email}
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              autoFocus
              required
            />
          </div>
          <button
            type="submit"
            disabled={busy || confirm.trim().toLowerCase() !== email.toLowerCase()}
            className="w-full text-sm font-medium text-white bg-danger rounded-xl px-4 py-3 disabled:opacity-40 transition-opacity"
          >
            {busy ? "Deleting…" : "Permanently delete my account"}
          </button>
        </form>
      </Modal>
    </>
  );
}
