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
