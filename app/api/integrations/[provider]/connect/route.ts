import { NextResponse, type NextRequest } from "next/server";
import { createSupabaseServer } from "@/lib/supabase/server";
import { canDeploy, DEPLOY_MIN_PLAN } from "@/lib/pricing";
import { isAdminUser } from "@/lib/admin";
import { secretsConfigured } from "@/lib/crypto";
import { beginHandshake, callbackUrl, safeNext } from "@/lib/oauth";
import { supabaseAuthorizeUrl } from "@/lib/supabase-mgmt";
import { vercelAuthorizeUrl } from "@/lib/vercel";
import type { Provider } from "@/lib/integrations";

// Step one of connecting a Vercel or Supabase account: send the user to the
// provider's consent screen. Everything secret about the handshake stays in
// httpOnly cookies (see lib/oauth.ts).
export const runtime = "nodejs";

function isProvider(value: string): value is Provider {
  return value === "vercel" || value === "supabase";
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ provider: string }> }
) {
  const { provider } = await params;
  const { searchParams, origin } = new URL(request.url);
  const next = safeNext(searchParams.get("next"));

  if (!isProvider(provider)) {
    return NextResponse.redirect(`${origin}/account/integrations?error=unknown_provider`);
  }

  const supabase = await createSupabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.redirect(`${origin}/login?next=/account/integrations`);
  }

  // Deploying is a Pro-and-up feature, so connecting the accounts that make
  // it possible is too — no point collecting a token nothing may use.
  const { data: profile } = await supabase.from("profiles").select("plan").eq("id", user.id).single();
  if (!canDeploy(profile?.plan) && !isAdminUser(user.id)) {
    return NextResponse.redirect(`${origin}/pricing?upgrade=${DEPLOY_MIN_PLAN.id}&reason=deploy`);
  }

  if (!secretsConfigured()) {
    return NextResponse.redirect(`${origin}${next}?error=not_configured`);
  }

  try {
    const { state, codeChallenge } = await beginHandshake(provider, next);
    const redirectUri = callbackUrl(provider);
    const url =
      provider === "vercel"
        ? vercelAuthorizeUrl(state, redirectUri)
        : supabaseAuthorizeUrl(state, codeChallenge, redirectUri);
    return NextResponse.redirect(url);
  } catch {
    return NextResponse.redirect(`${origin}${next}?error=not_configured`);
  }
}
