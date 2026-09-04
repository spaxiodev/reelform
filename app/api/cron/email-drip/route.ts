import { NextResponse, type NextRequest } from "next/server";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { sendMarketing, sendTransactional } from "@/lib/email/send";
import { DRIP, welcome } from "@/lib/email/templates";

// Daily sweep, scheduled in vercel.json. Two jobs:
//
//   1. Welcome mail for anyone who confirmed their account without passing
//      through /api/auth/callback (email confirmation switched off, or a
//      callback that died before `after` ran). Idempotent via email_log.
//
//   2. The drip in lib/email/templates.ts: each entry goes to opted-in
//      accounts whose signup is at least `afterDays` old, once, and only if
//      its condition still holds. The window closes 14 days after the
//      trigger point so switching the feature on never mails the back
//      catalogue of old accounts.
//
// Vercel calls this with `Authorization: Bearer $CRON_SECRET`.

const BATCH = 200;
const WINDOW_DAYS = 14;

function authorized(request: NextRequest): boolean {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) return false;
  return request.headers.get("authorization") === `Bearer ${secret}`;
}

interface Row {
  id: string;
  created_at: string;
}

async function withoutLog(userIds: string[], kind: string): Promise<string[]> {
  if (userIds.length === 0) return [];
  const admin = createSupabaseAdmin();
  const { data } = await admin
    .from("email_log")
    .select("user_id")
    .eq("kind", kind)
    .in("user_id", userIds);
  const done = new Set((data ?? []).map((r) => r.user_id as string));
  return userIds.filter((id) => !done.has(id));
}

async function builtASite(userId: string): Promise<boolean> {
  const admin = createSupabaseAdmin();
  const { count } = await admin
    .from("projects")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .not("site_html", "is", null);
  return (count ?? 0) > 0;
}

export async function GET(request: NextRequest) {
  if (!authorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admin = createSupabaseAdmin();
  const now = Date.now();
  const daysAgo = (d: number) => new Date(now - d * 86_400_000).toISOString();
  const report: Record<string, number> = {};

  // 1. Welcome stragglers.
  {
    const { data } = await admin
      .from("profiles")
      .select("id, created_at")
      .gte("created_at", daysAgo(1))
      .is("email_bounced_at", null)
      .limit(BATCH)
      .returns<Row[]>();
    const pending = await withoutLog((data ?? []).map((r) => r.id), "welcome");
    let sent = 0;
    for (const id of pending) {
      // Only confirmed addresses: an unconfirmed signup gets Supabase's
      // confirmation mail and nothing else until they act on it.
      const { data: u } = await admin.auth.admin.getUserById(id);
      if (!u.user?.email_confirmed_at) continue;
      if (await sendTransactional(id, "welcome", welcome, { once: true })) sent++;
    }
    report.welcome = sent;
  }

  // 2. Drip.
  for (const step of DRIP) {
    const { data } = await admin
      .from("profiles")
      .select("id, created_at")
      .eq("marketing_opt_in", true)
      .is("email_bounced_at", null)
      .lte("created_at", daysAgo(step.afterDays))
      .gte("created_at", daysAgo(step.afterDays + WINDOW_DAYS))
      .limit(BATCH)
      .returns<Row[]>();
    const pending = await withoutLog((data ?? []).map((r) => r.id), step.kind);
    let sent = 0;
    for (const id of pending) {
      if (step.condition === "no_site_built" && (await builtASite(id))) continue;
      if (await sendMarketing(id, step.kind, step.build)) sent++;
    }
    report[step.kind] = sent;
  }

  return NextResponse.json({ ok: true, sent: report });
}
