// Human labels for credit_ledger.reason values (see supabase/schema.sql).
export const LEDGER_REASONS: Record<string, string> = {
  signup_bonus: "Welcome bonus",
  video_generation: "Video render",
  site_generation: "Site build",
  site_edit: "Site edit",
  refund: "Refund",
  subscription: "Plan renewal",
  topup: "Credit top-up",
};

export function ledgerLabel(reason: string): string {
  return LEDGER_REASONS[reason] ?? reason;
}
