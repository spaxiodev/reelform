// Human labels for credit_ledger.reason values (see supabase/schema.sql).
export const LEDGER_REASONS: Record<string, string> = {
  signup_bonus: "Welcome bonus",
  video_generation: "Video render",
  site_generation: "Site build",
  site_edit: "Site edit",
  refund: "Refund",
  subscription: "Plan renewal",
  // A zero-delta marker written when a renewal hit the rollover cap, so a
  // balance that stopped growing is explainable in the activity list.
  rollover_capped: "Rollover limit reached",
  topup: "Credit top-up",
};

export function ledgerLabel(reason: string): string {
  return LEDGER_REASONS[reason] ?? reason;
}
