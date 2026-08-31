import Link from "next/link";
import { createSupabaseServer } from "@/lib/supabase/server";
import { Avatar } from "@/components/Avatar";
import { CreditRing } from "@/components/CreditRing";
import { shortName } from "@/lib/avatar";

interface HeaderProfile {
  full_name: string | null;
  username: string | null;
  avatar_url: string | null;
  credits: number | null;
  plan: string | null;
}

/**
 * The signed-in member's face in a page header: their picture (or initials),
 * their name, and a ring showing how much credit is left. It replaces the old
 * "Account" text link — same destination, but it answers "who am I signed in
 * as" and "can I afford another shot" without a click.
 */
export async function AccountBadge({ compact = false }: { compact?: boolean }) {
  const supabase = await createSupabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const columns = "full_name, username, avatar_url, credits, plan";
  let { data: profile } = await supabase
    .from("profiles")
    .select(columns)
    .eq("id", user.id)
    .single<HeaderProfile>();

  // avatar_url arrived after the first release; on a database that hasn't run
  // the latest schema.sql the select above fails outright, and a header is not
  // the place to take a page down over a missing column.
  if (!profile) {
    const { data: legacy } = await supabase
      .from("profiles")
      .select("full_name, username, credits, plan")
      .eq("id", user.id)
      .single<Omit<HeaderProfile, "avatar_url">>();
    if (legacy) profile = { ...legacy, avatar_url: null };
  }

  const name = shortName(profile?.full_name, profile?.username, user.email);

  return (
    <Link
      href="/account"
      className="flex items-center gap-2.5 rounded-full py-1 pl-1 pr-3 -my-1 hover:bg-bg-raise transition-colors"
      title={`Signed in as ${profile?.full_name ?? profile?.username ?? user.email}`}
    >
      <CreditRing credits={profile?.credits ?? 0} plan={profile?.plan} size={30}>
        <Avatar
          id={user.id}
          src={profile?.avatar_url}
          name={profile?.full_name ?? profile?.username}
          email={user.email}
          size={30}
        />
      </CreditRing>
      {!compact && <span className="text-sm font-medium">{name}</span>}
    </Link>
  );
}
