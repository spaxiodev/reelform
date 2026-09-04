import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { marketingEnabled, replyTo, transactionalEnabled } from "./config";
import type { Recipient } from "./layout";
import { sendEmail, syncContact } from "./resend";
import type { Message } from "./templates";
import { unsubscribePostUrl, unsubscribeUrl } from "./unsubscribe";

// The one door every outgoing email goes through. It decides whether a
// message may be sent at all (provider configured? address bounced? consent
// given, for marketing?), sends it, and writes the log row that both the
// audit trail and the drip schedule read.
//
// Nothing here throws. A receipt that fails to send must never fail the
// Stripe webhook that triggered it; the failure is logged and the caller
// carries on.

export type TransactionalKind =
  | "welcome"
  | "topup_receipt"
  | "plan_started"
  | "plan_renewed"
  | "plan_canceled";

type Kind = TransactionalKind | string;

interface ProfileRow {
  id: string;
  email: string | null;
  full_name: string | null;
  marketing_opt_in: boolean;
  marketing_consent_at: string | null;
  marketing_consent_source: string | null;
  email_bounced_at: string | null;
}

async function loadRecipient(userId: string): Promise<(Recipient & { optIn: boolean; bounced: boolean }) | null> {
  const admin = createSupabaseAdmin();
  const { data } = await admin
    .from("profiles")
    .select(
      "id, email, full_name, marketing_opt_in, marketing_consent_at, marketing_consent_source, email_bounced_at"
    )
    .eq("id", userId)
    .maybeSingle<ProfileRow>();
  if (!data?.email) return null;
  return {
    userId: data.id,
    email: data.email,
    firstName: data.full_name?.trim().split(/\s+/)[0] || null,
    consentAt: data.marketing_consent_at,
    consentSource: data.marketing_consent_source,
    optIn: data.marketing_opt_in,
    bounced: Boolean(data.email_bounced_at),
  };
}

async function alreadySent(userId: string, kind: Kind): Promise<boolean> {
  const admin = createSupabaseAdmin();
  const { count } = await admin
    .from("email_log")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .eq("kind", kind);
  return (count ?? 0) > 0;
}

async function logSend(userId: string, email: string, kind: Kind, providerId: string): Promise<void> {
  const admin = createSupabaseAdmin();
  const { error } = await admin
    .from("email_log")
    .insert({ user_id: userId, email, kind, provider_id: providerId });
  if (error) console.error("[email] could not log send", { kind, userId, error: error.message });
}

interface SendOptions {
  /** Skip if this user already received this kind (welcome, drips). */
  once?: boolean;
  /** Passed to Resend so a retried webhook cannot double-send. */
  idempotencyKey?: string;
}

/**
 * Account email: receipts, plan changes, the welcome mail. Needs no consent
 * under CASL (it's about a transaction the person is party to), but still
 * stops at a bounced or complained address.
 */
export async function sendTransactional(
  userId: string,
  kind: TransactionalKind,
  build: (r: Recipient) => Message,
  opts: SendOptions = {}
): Promise<string | null> {
  if (!transactionalEnabled()) {
    console.warn(`[email] skipped ${kind}: RESEND_API_KEY or EMAIL_FROM not set`);
    return null;
  }
  try {
    const r = await loadRecipient(userId);
    if (!r) return null;
    if (r.bounced) return null;
    if (opts.once && (await alreadySent(userId, kind))) return null;

    const msg = build(r);
    const id = await sendEmail({
      to: r.email,
      subject: msg.subject,
      html: msg.html,
      text: msg.text,
      idempotencyKey: opts.idempotencyKey,
      tags: { kind, category: "transactional" },
    });
    await logSend(userId, r.email, kind, id);
    return id;
  } catch (err) {
    console.error(`[email] ${kind} failed`, { userId, err });
    return null;
  }
}

/**
 * Marketing email. Goes out only to accounts that opted in, only when the
 * sender identity is complete enough to be compliant, and never twice for
 * the same kind. Carries List-Unsubscribe headers so Gmail and Apple Mail
 * show their own unsubscribe button.
 */
export async function sendMarketing(
  userId: string,
  kind: string,
  build: (r: Recipient) => Message
): Promise<string | null> {
  if (!marketingEnabled()) {
    console.warn(`[email] skipped ${kind}: marketing email is not fully configured`);
    return null;
  }
  try {
    const r = await loadRecipient(userId);
    if (!r || !r.optIn || r.bounced) return null;
    if (await alreadySent(userId, kind)) return null;

    const msg = build(r);
    const listUnsub = unsubscribeUrl(userId);
    const listUnsubPost = unsubscribePostUrl(userId);
    const headers: Record<string, string> = {};
    if (listUnsub && listUnsubPost) {
      headers["List-Unsubscribe"] = `<${listUnsubPost}>, <mailto:${replyTo()}?subject=unsubscribe>`;
      headers["List-Unsubscribe-Post"] = "List-Unsubscribe=One-Click";
    }

    const id = await sendEmail({
      to: r.email,
      subject: msg.subject,
      html: msg.html,
      text: msg.text,
      headers,
      tags: { kind, category: "marketing" },
    });
    await logSend(userId, r.email, kind, id);
    return id;
  } catch (err) {
    console.error(`[email] ${kind} failed`, { userId, err });
    return null;
  }
}

/**
 * Records a consent decision and mirrors it to the Resend audience. This is
 * the only place marketing_opt_in is written from the app, so the source of
 * every consent is captured alongside it.
 */
export async function setMarketingConsent(
  userId: string,
  optIn: boolean,
  source: "signup_google" | "account_settings" | "unsubscribe_link" | "provider_webhook"
): Promise<void> {
  const admin = createSupabaseAdmin();
  const patch: Record<string, unknown> = { marketing_opt_in: optIn };
  if (optIn) patch.marketing_consent_source = source;
  const { data, error } = await admin
    .from("profiles")
    .update(patch)
    .eq("id", userId)
    .select("email, full_name")
    .maybeSingle<{ email: string | null; full_name: string | null }>();
  if (error) throw new Error(`consent update failed: ${error.message}`);
  if (!data?.email) return;

  try {
    await syncContact({
      email: data.email,
      firstName: data.full_name?.trim().split(/\s+/)[0] || null,
      unsubscribed: !optIn,
    });
  } catch (err) {
    // The database is the source of truth; the audience catches up on the
    // next change. Don't fail the user's action over it.
    console.error("[email] audience sync failed", { userId, err });
  }
}
