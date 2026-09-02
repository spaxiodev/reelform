-- Clear the "security_definer_view" advisor warning on public.public_profiles.
--
-- The view exists to expose a safe slice of profiles (no email, credits or
-- Stripe ids) to everyone, while the profiles RLS policy only lets a member
-- read their own row. A plain SECURITY DEFINER view is the shortest way to do
-- that, but Supabase's linter flags every such view because it cannot tell an
-- intentional column allowlist from an accidental RLS bypass.
--
-- Simply switching the view to security_invoker would make it subject to the
-- "read own profile" policy and return a single row, breaking /u/[username],
-- the showcase, follow requests, the sitemap and the signup username check.
--
-- Instead the RLS bypass moves into a SECURITY DEFINER function that returns
-- exactly the safe columns (same trust model as can_view_profile), and the
-- view becomes a security_invoker wrapper over it. The function lives in a
-- `private` schema so the anon/authenticated_security_definer_function
-- lints do not flag it as an RPC endpoint. Column-level exposure is
-- unchanged; only the mechanism moves.
--
-- Trade-off: SECURITY DEFINER SQL functions are not inlined by the planner, so
-- filters on the view (ilike username, in(id)) are applied after the function
-- returns all rows rather than pushed into an index scan. profiles has one row
-- per account, so this is a full scan of a small table per lookup.

-- `private` is not in PostgREST's exposed schemas, so nothing in it is
-- reachable over /rest/v1/rpc. anon/authenticated still get USAGE on it so a
-- security_invoker view in `public` can call functions that live here.
create schema if not exists private;
revoke all on schema private from public;
grant usage on schema private to anon, authenticated;

create or replace function private.public_profile_rows()
returns table (
  id uuid,
  username text,
  full_name text,
  is_private boolean,
  created_at timestamptz,
  avatar_url text
)
language sql stable security definer set search_path = ''
as $$
  select id, username, full_name, is_private, created_at, avatar_url
    from public.profiles
$$;

revoke execute on function private.public_profile_rows() from public;
grant execute on function private.public_profile_rows() to anon, authenticated;

create or replace view public.public_profiles
  with (security_invoker = true) as
  select id, username, full_name, is_private, created_at, avatar_url
    from private.public_profile_rows();

-- Earlier revision of this migration put the helper in `public`.
drop function if exists public.public_profile_rows();

grant select on public.public_profiles to anon, authenticated;
