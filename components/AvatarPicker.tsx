"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Avatar } from "@/components/Avatar";
import { CreditRing } from "@/components/CreditRing";
import { toast } from "@/components/ui/Toaster";
import { AVATAR_MAX_BYTES, AVATAR_TYPES } from "@/lib/avatar";

// Picture + credit ring, exactly as they appear in the header, with the two
// actions that change them. Showing the real badge here means what you set is
// what you see, rather than a preview that only approximates it.
export function AvatarPicker({
  userId,
  name,
  email,
  credits,
  plan,
  initialAvatarUrl,
}: {
  userId: string;
  name: string | null;
  email: string | null;
  credits: number;
  plan: string | null;
  initialAvatarUrl: string | null;
}) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [avatarUrl, setAvatarUrl] = useState(initialAvatarUrl);
  const [busy, setBusy] = useState(false);

  async function upload(file: File) {
    if (!AVATAR_TYPES[file.type]) {
      toast("Pictures must be a PNG, JPEG, WebP or GIF.", "error");
      return;
    }
    if (file.size > AVATAR_MAX_BYTES) {
      toast(`That image is over ${Math.round(AVATAR_MAX_BYTES / 1024 / 1024)}MB.`, "error");
      return;
    }

    setBusy(true);
    const body = new FormData();
    body.append("file", file);
    const res = await fetch("/api/account/avatar", { method: "POST", body }).catch(() => null);
    const data = await res?.json().catch(() => null);
    if (!res?.ok) {
      toast(data?.error ?? "Could not save that picture.", "error");
    } else {
      setAvatarUrl(data.avatarUrl);
      toast("Profile picture updated.", "success");
      router.refresh();
    }
    setBusy(false);
  }

  async function remove() {
    setBusy(true);
    const res = await fetch("/api/account/avatar", { method: "DELETE" }).catch(() => null);
    if (!res?.ok) {
      toast("Could not remove that picture.", "error");
    } else {
      setAvatarUrl(null);
      toast("Back to your initials.", "success");
      router.refresh();
    }
    setBusy(false);
  }

  return (
    <div className="flex items-center gap-5">
      <CreditRing credits={credits} plan={plan} size={64} stroke={4}>
        <Avatar id={userId} src={avatarUrl} name={name} email={email} size={64} />
      </CreditRing>

      <div className="min-w-0">
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            disabled={busy}
            onClick={() => input.current?.click()}
            className="btn-ghost !py-2 !px-3.5 !text-xs"
          >
            {busy ? "Saving…" : avatarUrl ? "Change picture" : "Upload a picture"}
          </button>
          {avatarUrl && (
            <button
              type="button"
              disabled={busy}
              onClick={remove}
              className="btn-ghost !py-2 !px-3.5 !text-xs"
            >
              Remove
            </button>
          )}
        </div>
        <p className="mt-2 text-xs text-muted leading-snug">
          PNG, JPEG, WebP or GIF, up to {Math.round(AVATAR_MAX_BYTES / 1024 / 1024)}MB. The ring
          around it tracks the credits you have left.
        </p>
      </div>

      <input
        ref={input}
        type="file"
        accept={Object.keys(AVATAR_TYPES).join(",")}
        className="sr-only"
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = "";
          if (file) upload(file);
        }}
      />
    </div>
  );
}
