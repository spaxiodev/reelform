import { NextResponse, type NextRequest } from "next/server";
import { createSupabaseServer } from "@/lib/supabase/server";
import { setMarketingConsent } from "@/lib/email/send";

// The signed-in user turning marketing email on or off from Account. Goes
// through the server rather than a direct profiles update so the consent is
// recorded with its source (which the footer of every marketing email then
// quotes back to them).
export async function POST(request: NextRequest) {
  const supabase = await createSupabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  let optIn: unknown;
  try {
    ({ optIn } = (await request.json()) as { optIn?: unknown });
  } catch {
    return NextResponse.json({ error: "Bad request" }, { status: 400 });
  }
  if (typeof optIn !== "boolean") {
    return NextResponse.json({ error: "optIn must be true or false" }, { status: 400 });
  }

  try {
    await setMarketingConsent(user.id, optIn, "account_settings");
  } catch (err) {
    console.error("[email/preferences] failed", { userId: user.id, err });
    return NextResponse.json({ error: "Could not save your preference." }, { status: 500 });
  }

  const { data } = await supabase
    .from("profiles")
    .select("marketing_opt_in, marketing_consent_at")
    .eq("id", user.id)
    .single();

  return NextResponse.json({
    optIn: data?.marketing_opt_in ?? optIn,
    consentAt: data?.marketing_consent_at ?? null,
  });
}
