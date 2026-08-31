"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createSupabaseBrowser } from "@/lib/supabase/client";
import { toast } from "@/components/ui/Toaster";

export type FollowState = "none" | "requested" | "following";

export function FollowButton({
  profileId,
  viewerId,
  isPrivate,
  initialState,
}: {
  profileId: string;
  viewerId: string | null;
  isPrivate: boolean;
  initialState: FollowState;
}) {
  const router = useRouter();
  const [state, setState] = useState<FollowState>(initialState);
  const [busy, setBusy] = useState(false);

  if (viewerId === profileId) return null;

  async function toggle() {
    if (!viewerId) {
      router.push(`/login?next=${encodeURIComponent(location.pathname)}`);
      return;
    }
    setBusy(true);
    const supabase = createSupabaseBrowser();
    const { error } =
      state === "none"
        ? await supabase.from("follows").insert({ follower_id: viewerId, followee_id: profileId })
        : await supabase
            .from("follows")
            .delete()
            .eq("follower_id", viewerId)
            .eq("followee_id", profileId);
    if (error) {
      toast("Something went wrong. Please try again.", "error");
    } else {
      setState(state === "none" ? (isPrivate ? "requested" : "following") : "none");
      router.refresh();
    }
    setBusy(false);
  }

  const label =
    state === "following" ? "Following" : state === "requested" ? "Requested" : "Follow";

  return (
    <button
      onClick={toggle}
      disabled={busy}
      className={state === "none" ? "btn-primary !py-2 !px-5 text-sm" : "btn-ghost !py-2 !px-5 text-sm"}
    >
      {busy ? "…" : label}
    </button>
  );
}
