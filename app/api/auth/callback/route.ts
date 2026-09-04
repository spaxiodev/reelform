import { NextResponse, type NextRequest } from "next/server";
import { after } from "next/server";
import type { EmailOtpType } from "@supabase/supabase-js";
import { createSupabaseServer } from "@/lib/supabase/server";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { sendTransactional, setMarketingConsent } from "@/lib/email/send";
import { welcome } from "@/lib/email/templates";

// Handles every redirect back from Supabase auth:
//
//   1. OAuth providers (Google) land here with `?code=` and are exchanged for a
//      session via PKCE.
//   2. Every email we send (confirm signup, reset password, change email,
//      magic link, invite) links here with `?token_hash=&type=`. Those are
//      verified server-side, which works no matter which browser or device
//      opens the link. A `?code=` on an emailed link also still works, so the
//      stock Supabase templates keep functioning if ours are ever reverted.
//
// Redirect back to the host the request actually arrived on, not
// NEXT_PUBLIC_APP_URL. The apex 308s to www, so the two can differ, and
// bouncing across hosts here would leave the freshly set session cookie on the
// wrong one. `request.nextUrl` already reflects x-forwarded-host on Vercel.

const EMAIL_OTP_TYPES: ReadonlySet<string> = new Set([
  "signup",
  "invite",
  "magiclink",
  "recovery",
  "email_change",
  "email",
]);

// Where each kind of email link should land once verified, unless the link
// itself says otherwise. A recovery link always goes to the reset form: the
// visitor has a session now but still has no password they know.
const DEFAULT_NEXT: Record<string, string> = {
  recovery: "/reset-password",
  email_change: "/account/security?notice=email_changed",
  signup: "/dashboard?welcome=1",
};

// Only ever redirect within this site. `next` comes off the query string, so
// a crafted link must not be able to bounce a fresh session to another host.
function safeNext(raw: string | null, fallback: string): string {
  if (!raw) return fallback;
  if (!raw.startsWith("/") || raw.startsWith("//") || raw.startsWith("/\\")) return fallback;
  return raw;
}

// An account counts as brand new for this long after creation. Google sign-ins
// land here every time, so the welcome mail (and the consent ticked on the
// signup form) must only apply to the first arrival.
const NEW_ACCOUNT_WINDOW_MS = 24 * 60 * 60 * 1000;

// Post-verification side effects: welcome email for a fresh account, and the
// marketing consent a Google signup ticked before leaving for Google. Runs
// after the redirect is sent, so it never slows the sign-in down. Both steps
// are idempotent (email_log, and consent only applied where none is recorded).
async function afterSignIn(userId: string, createdAt: string, wantsMarketing: boolean): Promise<void> {
  const isNew = Date.now() - new Date(createdAt).getTime() < NEW_ACCOUNT_WINDOW_MS;
  if (!isNew) return;

  if (wantsMarketing) {
    const { data } = await createSupabaseAdmin()
      .from("profiles")
      .select("marketing_opt_in, marketing_consent_at, marketing_unsubscribed_at")
      .eq("id", userId)
      .maybeSingle();
    if (data && !data.marketing_opt_in && !data.marketing_consent_at && !data.marketing_unsubscribed_at) {
      await setMarketingConsent(userId, true, "signup_google").catch((err) =>
        console.error("[auth/callback] consent record failed", { userId, err })
      );
    }
  }

  await sendTransactional(userId, "welcome", welcome, { once: true });
}

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const origin = request.nextUrl.origin;
  const code = searchParams.get("code");
  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type");

  // Supabase reports a refused provider or a disallowed redirect_to as query
  // params rather than an exception, so a missing `code` is not always "the
  // link expired".
  const providerError = searchParams.get("error_code") ?? searchParams.get("error");
  if (providerError) {
    console.error("[auth/callback] provider error", {
      error: providerError,
      description: searchParams.get("error_description"),
    });
    return NextResponse.redirect(`${origin}/login?error=${encodeURIComponent(providerError)}`);
  }

  const supabase = await createSupabaseServer();

  // Emailed link: verify the hashed token directly.
  if (tokenHash && type) {
    if (!EMAIL_OTP_TYPES.has(type)) {
      console.error("[auth/callback] unknown email otp type", { type });
      return NextResponse.redirect(`${origin}/login?error=no_code`);
    }
    const { error } = await supabase.auth.verifyOtp({
      token_hash: tokenHash,
      type: type as EmailOtpType,
    });
    if (error) {
      console.error("[auth/callback] token verification failed", {
        message: error.message,
        status: error.status,
        type,
      });
      const reason = type === "recovery" ? "recovery_expired" : "otp_expired";
      return NextResponse.redirect(`${origin}/login?error=${reason}`);
    }
    if (type === "signup") {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (user) after(() => afterSignIn(user.id, user.created_at, false));
    }
    const next =
      type === "recovery"
        ? DEFAULT_NEXT.recovery
        : safeNext(searchParams.get("next"), DEFAULT_NEXT[type] ?? "/dashboard");
    return NextResponse.redirect(`${origin}${next}`);
  }

  if (!code) {
    console.error("[auth/callback] no code on the callback URL", { url: request.nextUrl.href });
    return NextResponse.redirect(`${origin}/login?error=no_code`);
  }

  const { data: exchanged, error } = await supabase.auth.exchangeCodeForSession(code);

  if (error) {
    // Almost always the PKCE verifier cookie: it is host-only, so a flow that
    // starts on one host and lands on another cannot complete.
    console.error("[auth/callback] code exchange failed", {
      message: error.message,
      status: error.status,
      host: request.nextUrl.host,
    });
    return NextResponse.redirect(`${origin}/login?error=exchange_failed`);
  }

  const user = exchanged.user;
  if (user) {
    const wantsMarketing = searchParams.get("marketing") === "1";
    after(() => afterSignIn(user.id, user.created_at, wantsMarketing));
  }

  return NextResponse.redirect(`${origin}${safeNext(searchParams.get("next"), "/dashboard")}`);
}
