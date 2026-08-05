"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createSupabaseBrowser } from "@/lib/supabase/client";
import { toast } from "@/components/ui/Toaster";

export function ProfileSettings({
  userId,
  initialUsername,
  initialFullName,
  initialIsPrivate,
}: {
  userId: string;
  initialUsername: string | null;
  initialFullName: string | null;
  initialIsPrivate: boolean;
}) {
  const router = useRouter();
  const [username, setUsername] = useState(initialUsername ?? "");
  const [fullName, setFullName] = useState(initialFullName ?? "");
  const [isPrivate, setIsPrivate] = useState(initialIsPrivate);
  const [busy, setBusy] = useState(false);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    const handle = username.trim();
    if (!/^[A-Za-z0-9_]{3,24}$/.test(handle)) {
      toast("Usernames are 3–24 characters: letters, numbers and underscores only.", "error");
      return;
    }
    setBusy(true);
    const supabase = createSupabaseBrowser();
    const { error } = await supabase
      .from("profiles")
      .update({
        username: handle,
        full_name: fullName.trim() || null,
        is_private: isPrivate,
      })
      .eq("id", userId);
    if (error) {
      toast(
        error.code === "23505" ? `@${handle} is already taken.` : "Could not save your profile.",
        "error"
      );
    } else {
      toast("Profile saved.", "success");
      router.refresh();
    }
    setBusy(false);
  }

  return (
    <form onSubmit={save} className="space-y-4">
      <div className="grid sm:grid-cols-2 gap-4">
        <div>
          <label className="mono-label block mb-2" htmlFor="ps-fullname">
            FULL NAME
          </label>
          <input
            id="ps-fullname"
            className="field"
            maxLength={80}
            placeholder="Ada Lovelace"
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
          />
        </div>
        <div>
          <label className="mono-label block mb-2" htmlFor="ps-username">
            USERNAME
          </label>
          <input
            id="ps-username"
            className="field"
            required
            minLength={3}
            maxLength={24}
            pattern="[A-Za-z0-9_]{3,24}"
            title="3–24 characters: letters, numbers and underscores"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            value={username}
            onChange={(e) => setUsername(e.target.value)}
          />
        </div>
      </div>

      <label className="flex items-start gap-3 cursor-pointer">
        <input
          type="checkbox"
          className="mt-1 accent-[var(--color-primary,currentColor)]"
          checked={isPrivate}
          onChange={(e) => setIsPrivate(e.target.checked)}
        />
        <span>
          <span className="block text-sm font-medium">Private account</span>
          <span className="block text-sm text-muted">
            Only your followers can see your profile&apos;s published sites and videos. Anything
            already in the public showcase is hidden from non-followers too.
          </span>
        </span>
      </label>

      <div className="flex items-center gap-4">
        <button type="submit" disabled={busy} className="btn-primary">
          {busy ? "Saving…" : "Save profile"}
        </button>
        {initialUsername && (
          <Link
            href={`/u/${initialUsername}`}
            className="text-sm font-medium text-primary hover:text-primary-deep"
          >
            View public profile →
          </Link>
        )}
      </div>
    </form>
  );
}
