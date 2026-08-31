import { createSupabaseAdmin } from "./supabase/admin";

// All credit movement goes through the security-definer RPCs in Postgres so
// balance checks are atomic (no double-spend under concurrent requests).

export async function spendCredits(
  userId: string,
  amount: number,
  reason: string,
  ref?: string
): Promise<boolean> {
  const admin = createSupabaseAdmin();
  const { data, error } = await admin.rpc("spend_credits", {
    p_user: userId,
    p_amount: amount,
    p_reason: reason,
    p_ref: ref ?? null,
  });
  if (error) throw new Error(`spend_credits failed: ${error.message}`);
  return data === true;
}

export async function grantCredits(
  userId: string,
  amount: number,
  reason: string,
  ref?: string
): Promise<void> {
  const admin = createSupabaseAdmin();
  const { error } = await admin.rpc("grant_credits", {
    p_user: userId,
    p_amount: amount,
    p_reason: reason,
    p_ref: ref ?? null,
  });
  if (error) throw new Error(`grant_credits failed: ${error.message}`);
}

/**
 * The monthly plan grant. Unlike `grantCredits` this is capped: unused plan
 * credits roll over only up to `cap`, and the excess is forfeited at renewal
 * (see supabase/migrations/20260831_credit_rollover.sql). Top-ups and refunds
 * still go through `grantCredits` and never expire.
 */
export async function grantSubscriptionCredits(
  userId: string,
  amount: number,
  cap: number,
  ref?: string
): Promise<void> {
  const admin = createSupabaseAdmin();
  const { error } = await admin.rpc("grant_subscription_credits", {
    p_user: userId,
    p_amount: amount,
    p_cap: cap,
    p_ref: ref ?? null,
  });
  if (error) throw new Error(`grant_subscription_credits failed: ${error.message}`);
}
