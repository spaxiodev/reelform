// Who is allowed to spend what.
//
// The product rule is deliberately small: **every account gets one complete
// website free** — one hero video and one site build. Everything past that
// (reshooting, editing, a second project) needs an active subscription. This
// module is the only place that rule is written down; routes ask it for a
// verdict rather than each re-deriving the policy from plan columns.

import type { SupabaseClient } from "@supabase/supabase-js";
import { createSupabaseAdmin } from "./supabase/admin";
import { planId } from "./pricing";

/** The one-shot free allowances an account starts with. */
export type FreeKind = "video" | "site";

export type Grant =
  | { ok: true; billing: "free" | "credits" }
  | { ok: false; reason: "subscription_required"; message: string };

/**
 * A subscription is "live" while Stripe says active. `past_due` still counts —
 * the customer is mid dunning, and locking them out of their own work is a
 * worse outcome than one more build; `canceled` resets plan to free anyway.
 */
export function isSubscribed(
  profile: { plan?: string | null; plan_status?: string | null } | null
): boolean {
  if (!profile) return false;
  return planId(profile.plan) !== "free" && profile.plan_status !== "canceled";
}

async function loadProfile(supabase: SupabaseClient, userId: string) {
  const { data } = await supabase
    .from("profiles")
    .select("plan, plan_status, free_video_used, free_site_used")
    .eq("id", userId)
    .single();
  return data as {
    plan: string | null;
    plan_status: string | null;
    free_video_used: boolean;
    free_site_used: boolean;
  } | null;
}

/**
 * Atomically consumes one free allowance. Returns false when it was already
 * spent, including when two requests race for the same one.
 */
export async function claimFree(userId: string, kind: FreeKind): Promise<boolean> {
  const admin = createSupabaseAdmin();
  const { data, error } = await admin.rpc("claim_free_allowance", {
    p_user: userId,
    p_kind: kind,
  });
  if (error) throw new Error(`claim_free_allowance failed: ${error.message}`);
  return data === true;
}

/** Hands a claimed allowance back when the generation never actually ran. */
export async function releaseFree(userId: string, kind: FreeKind): Promise<void> {
  const admin = createSupabaseAdmin();
  const { error } = await admin.rpc("release_free_allowance", {
    p_user: userId,
    p_kind: kind,
  });
  if (error) throw new Error(`release_free_allowance failed: ${error.message}`);
}

const UPGRADE = {
  video: "You've used your free hero video. Subscribe to shoot more.",
  site: "You've used your free website. Subscribe to build and edit more.",
  edit: "Editing a finished site is a subscriber feature — your free build is a one-shot.",
  project: "Your free website is this one. Subscribe to start another project.",
} as const;

function denied(message: string): Grant {
  return { ok: false, reason: "subscription_required", message };
}

/**
 * Shooting a video. Subscribers pay credits as usual; everyone else may do it
 * exactly once, for free. Callers that get `billing: "free"` and then fail must
 * call `releaseFree(userId, "video")`.
 */
export async function authorizeVideo(supabase: SupabaseClient, userId: string): Promise<Grant> {
  const profile = await loadProfile(supabase, userId);
  if (isSubscribed(profile)) return { ok: true, billing: "credits" };
  if (profile?.free_video_used) return denied(UPGRADE.video);
  return (await claimFree(userId, "video"))
    ? { ok: true, billing: "free" }
    : denied(UPGRADE.video);
}

/**
 * Building a site. An *edit* is never free — the free tier is one build, not an
 * open-ended session — so it goes straight to the subscription check.
 */
export async function authorizeSiteBuild(
  supabase: SupabaseClient,
  userId: string,
  mode: "create" | "edit"
): Promise<Grant> {
  const profile = await loadProfile(supabase, userId);
  if (isSubscribed(profile)) return { ok: true, billing: "credits" };
  if (mode === "edit") return denied(UPGRADE.edit);
  if (profile?.free_site_used) return denied(UPGRADE.site);
  return (await claimFree(userId, "site")) ? { ok: true, billing: "free" } : denied(UPGRADE.site);
}

/** Free accounts get one project — the one their free website lives in. */
export async function authorizeProject(supabase: SupabaseClient, userId: string): Promise<Grant> {
  const profile = await loadProfile(supabase, userId);
  if (isSubscribed(profile)) return { ok: true, billing: "credits" };
  const { count } = await supabase
    .from("projects")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId);
  return (count ?? 0) === 0 ? { ok: true, billing: "free" } : denied(UPGRADE.project);
}
