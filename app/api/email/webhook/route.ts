import { createHmac, timingSafeEqual } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { setMarketingConsent } from "@/lib/email/send";

// Resend -> Reelform. Three things come back this way:
//
//   email.bounced      a permanent bounce: stop sending to that address
//   email.complained   the person marked us as spam: treat it as an unsubscribe
//                      *and* a bounce, we never email them again
//   contact.updated    someone unsubscribed (or re-subscribed) from a broadcast
//                      sent out of Resend's own UI; keep our consent flag honest
//
// Resend signs webhooks with Svix. The signature covers "<id>.<timestamp>.<body>"
// with the base64 secret after the "whsec_" prefix.

const TOLERANCE_SECONDS = 5 * 60;

function verify(request: NextRequest, body: string): boolean {
  const secret = process.env.RESEND_WEBHOOK_SECRET?.trim();
  if (!secret) return false;

  const id = request.headers.get("svix-id");
  const timestamp = request.headers.get("svix-timestamp");
  const signatures = request.headers.get("svix-signature");
  if (!id || !timestamp || !signatures) return false;

  const age = Math.abs(Date.now() / 1000 - Number(timestamp));
  if (!Number.isFinite(age) || age > TOLERANCE_SECONDS) return false;

  const key = Buffer.from(secret.replace(/^whsec_/, ""), "base64");
  const expected = createHmac("sha256", key).update(`${id}.${timestamp}.${body}`).digest();

  // Header may carry several space-separated "v1,<base64>" entries.
  return signatures.split(" ").some((entry) => {
    const [version, sig] = entry.split(",");
    if (version !== "v1" || !sig) return false;
    const given = Buffer.from(sig, "base64");
    return given.length === expected.length && timingSafeEqual(given, expected);
  });
}

interface ResendEvent {
  type: string;
  data: {
    email?: string;
    unsubscribed?: boolean;
    to?: string[];
    bounce?: { type?: string; subType?: string; message?: string };
  };
}

async function userIdForEmail(email: string): Promise<string | null> {
  const admin = createSupabaseAdmin();
  const { data } = await admin.from("profiles").select("id").ilike("email", email).maybeSingle();
  return data?.id ?? null;
}

async function markBounced(email: string): Promise<void> {
  const admin = createSupabaseAdmin();
  await admin
    .from("profiles")
    .update({ email_bounced_at: new Date().toISOString() })
    .ilike("email", email)
    .is("email_bounced_at", null);
}

export async function POST(request: NextRequest) {
  const body = await request.text();
  if (!verify(request, body)) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  let event: ResendEvent;
  try {
    event = JSON.parse(body) as ResendEvent;
  } catch {
    return NextResponse.json({ error: "Bad payload" }, { status: 400 });
  }

  try {
    switch (event.type) {
      case "email.bounced": {
        // Transient bounces (full mailbox, greylisting) resolve on their own.
        const permanent = (event.data.bounce?.type ?? "Permanent") !== "Transient";
        if (!permanent) break;
        for (const to of event.data.to ?? []) await markBounced(to);
        break;
      }

      case "email.complained": {
        for (const to of event.data.to ?? []) {
          await markBounced(to);
          const userId = await userIdForEmail(to);
          if (userId) await setMarketingConsent(userId, false, "provider_webhook");
        }
        break;
      }

      case "contact.created":
      case "contact.updated": {
        const email = event.data.email;
        if (!email || typeof event.data.unsubscribed !== "boolean") break;
        const userId = await userIdForEmail(email);
        if (!userId) break;
        const admin = createSupabaseAdmin();
        const { data } = await admin
          .from("profiles")
          .select("marketing_opt_in")
          .eq("id", userId)
          .single();
        const wantsOptIn = !event.data.unsubscribed;
        if (data && data.marketing_opt_in !== wantsOptIn) {
          await setMarketingConsent(userId, wantsOptIn, "provider_webhook");
        }
        break;
      }
    }
  } catch (err) {
    console.error("[email/webhook] handler failed", { type: event.type, err });
    return NextResponse.json({ error: "Handler failed" }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}
