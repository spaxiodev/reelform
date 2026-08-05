// Admin bypass. Any Supabase user id listed in ADMIN_USER_IDS (comma-separated)
// gets free, unlimited access — no credits are spent for video or site
// generation. This is a server-only check; the env var is never exposed to the
// browser. The UI is told via a plain boolean prop so it can hide credit costs.
export function isAdminUser(userId: string | null | undefined): boolean {
  if (!userId) return false;
  const ids = (process.env.ADMIN_USER_IDS ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  return ids.includes(userId);
}
