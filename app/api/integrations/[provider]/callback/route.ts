import { NextResponse, type NextRequest } from "next/server";
import { createSupabaseServer } from "@/lib/supabase/server";
import { saveIntegration, type Provider } from "@/lib/integrations";
import { callbackUrl, completeHandshake } from "@/lib/oauth";
import { exchangeSupabaseCode, listOrganizations } from "@/lib/supabase-mgmt";
import { exchangeVercelCode, vercelAccountName } from "@/lib/vercel";

// Step two: the provider hands back a code, we trade it for tokens and store
// them sealed. Failures come back as a `?error=` on the page the user started
// from — an OAuth callback has nowhere useful to render an error itself.
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
  const fail = (page: string, reason: string) =>
    NextResponse.redirect(`${origin}${page}${page.includes("?") ? "&" : "?"}error=${reason}`);

  if (!isProvider(provider)) return fail("/account/integrations", "unknown_provider");

  const handshake = await completeHandshake(provider, searchParams.get("state"));
  if (!handshake) return fail("/account/integrations", "state_mismatch");
  const { next, verifier } = handshake;

  // The user pressed cancel on the consent screen.
  if (searchParams.get("error")) return fail(next, "denied");

  const code = searchParams.get("code");
  if (!code) return fail(next, "no_code");

  const supabase = await createSupabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.redirect(`${origin}/login?next=/account/integrations`);

  try {
    if (provider === "vercel") {
      const token = await exchangeVercelCode(code, callbackUrl("vercel"));
      const auth = { accessToken: token.access_token, teamId: token.team_id ?? null };
      await saveIntegration(user.id, "vercel", {
        accessToken: token.access_token,
        // Vercel's OAuth access tokens do not expire, so there is nothing to
        // refresh — the user revokes access from their Vercel dashboard.
        accountId: token.team_id ?? null,
        accountName: await vercelAccountName(auth),
      });
    } else {
      const token = await exchangeSupabaseCode(code, verifier, callbackUrl("supabase"));
      let accountName: string | null = null;
      try {
        accountName = (await listOrganizations(token.access_token))[0]?.name ?? null;
      } catch {
        // Naming the org is cosmetic; a working token is what matters.
      }
      await saveIntegration(user.id, "supabase", {
        accessToken: token.access_token,
        refreshToken: token.refresh_token,
        expiresIn: token.expires_in,
        accountName,
      });
    }
  } catch (err) {
    console.error(`[integrations] ${provider} connect failed`, err);
    return fail(next, "exchange_failed");
  }

  return NextResponse.redirect(
    `${origin}${next}${next.includes("?") ? "&" : "?"}connected=${provider}`
  );
}
