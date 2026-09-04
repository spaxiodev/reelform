import { NextResponse } from "next/server";
import { createSupabaseServer } from "@/lib/supabase/server";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { getStripe } from "@/lib/stripe";
import { removeContact } from "@/lib/email/resend";

// Permanently deletes the signed-in user's account. Cancels any active Stripe
// subscription first, then removes the auth user, profiles, projects,
// messages, and the credit ledger all cascade from auth.users.
export async function POST() {
  const supabase = await createSupabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const admin = createSupabaseAdmin();
  const { data: profile } = await admin
    .from("profiles")
    .select("stripe_subscription_id, email")
    .eq("id", user.id)
    .single();

  // Law 25: deleting the account deletes the personal data we hold on it,
  // including the copy of the address mirrored to the email provider.
  if (profile?.email) {
    try {
      await removeContact(profile.email);
    } catch (err) {
      console.error("account delete: audience removal failed", err);
    }
  }

  if (profile?.stripe_subscription_id) {
    try {
      await getStripe().subscriptions.cancel(profile.stripe_subscription_id);
    } catch (err) {
      // A subscription that is already canceled (or a Stripe outage) should
      // not leave the user unable to delete their account.
      console.error("account delete: subscription cancel failed", err);
    }
  }

  const { error } = await admin.auth.admin.deleteUser(user.id);
  if (error) {
    return NextResponse.json({ error: "Could not delete the account." }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
