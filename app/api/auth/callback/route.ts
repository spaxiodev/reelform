import { NextResponse, type NextRequest } from "next/server";
import { createSupabaseServer } from "@/lib/supabase/server";

// Handles every redirect back from Supabase auth: the OAuth providers and the
// emailed confirmation / magic links alike.
//
// Redirect back to the host the request actually arrived on, not
// NEXT_PUBLIC_APP_URL. The apex 308s to www, so the two can differ, and
// bouncing across hosts here would leave the freshly set session cookie on the
// wrong one. `request.nextUrl` already reflects x-forwarded-host on Vercel.
export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const origin = request.nextUrl.origin;
  const code = searchParams.get("code");
  const next = searchParams.get("next") ?? "/dashboard";

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

  if (!code) {
    console.error("[auth/callback] no code on the callback URL", { url: request.nextUrl.href });
    return NextResponse.redirect(`${origin}/login?error=no_code`);
  }

  const supabase = await createSupabaseServer();
  const { error } = await supabase.auth.exchangeCodeForSession(code);

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

  return NextResponse.redirect(`${origin}${next}`);
}
