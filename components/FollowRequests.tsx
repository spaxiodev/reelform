"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { createSupabaseBrowser } from "@/lib/supabase/client";
import { toast } from "@/components/ui/Toaster";

interface PendingRequest {
  followerId: string;
  username: string | null;
  fullName: string | null;
}

export function FollowRequests({ userId }: { userId: string }) {
  const [requests, setRequests] = useState<PendingRequest[] | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  useEffect(() => {
    const supabase = createSupabaseBrowser();
    (async () => {
      const { data: rows } = await supabase
        .from("follows")
        .select("follower_id")
        .eq("followee_id", userId)
        .eq("accepted", false)
        .order("created_at", { ascending: false });
      if (!rows || rows.length === 0) {
        setRequests([]);
        return;
      }
      const { data: people } = await supabase
        .from("public_profiles")
        .select("id, username, full_name")
        .in("id", rows.map((r) => r.follower_id));
      const byId = new Map((people ?? []).map((p) => [p.id, p]));
      setRequests(
        rows.map((r) => ({
          followerId: r.follower_id,
          username: byId.get(r.follower_id)?.username ?? null,
          fullName: byId.get(r.follower_id)?.full_name ?? null,
        }))
      );
    })();
  }, [userId]);

  async function resolve(followerId: string, approve: boolean) {
    setBusyId(followerId);
    const supabase = createSupabaseBrowser();
    const { error } = approve
      ? await supabase
          .from("follows")
          .update({ accepted: true })
          .eq("follower_id", followerId)
          .eq("followee_id", userId)
      : await supabase
          .from("follows")
          .delete()
          .eq("follower_id", followerId)
          .eq("followee_id", userId);
    if (error) {
      toast("Something went wrong — please try again.", "error");
    } else {
      setRequests((prev) => prev?.filter((r) => r.followerId !== followerId) ?? null);
    }
    setBusyId(null);
  }

  if (!requests || requests.length === 0) return null;

  return (
    <section className="card p-6 md:p-8">
      <h2 className="text-xl font-medium tracking-tight">Follower requests</h2>
      <p className="mt-2 text-sm text-muted">
        Your account is private — approve who gets to see what you publish.
      </p>
      <ul className="mt-4 divide-y divide-line">
        {requests.map((r) => (
          <li key={r.followerId} className="py-3 flex items-center justify-between gap-4">
            <div className="min-w-0">
              {r.username ? (
                <Link
                  href={`/u/${r.username}`}
                  className="text-sm font-medium text-ink hover:text-primary transition-colors"
                >
                  {r.fullName ?? `@${r.username}`}
                </Link>
              ) : (
                <span className="text-sm font-medium">A Reelform member</span>
              )}
              {r.username && <p className="text-xs text-faint truncate">@{r.username}</p>}
            </div>
            <div className="flex gap-2 shrink-0">
              <button
                onClick={() => resolve(r.followerId, true)}
                disabled={busyId === r.followerId}
                className="btn-primary !py-1.5 !px-4 text-sm"
              >
                Approve
              </button>
              <button
                onClick={() => resolve(r.followerId, false)}
                disabled={busyId === r.followerId}
                className="btn-ghost !py-1.5 !px-4 text-sm"
              >
                Decline
              </button>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
