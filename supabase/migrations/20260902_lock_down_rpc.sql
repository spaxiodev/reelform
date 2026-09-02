-- Close the public RPC surface on the entitlement helpers.
--
-- claim_free_allowance / release_free_allowance are SECURITY DEFINER and were
-- executable by `anon` and `authenticated`, which PostgREST exposes as
-- /rest/v1/rpc/<name>. Only the server ever calls them (through the service
-- role, see lib/entitlements.ts), but a signed-in user could call
-- release_free_allowance on their own id after every free shot and never run
-- out, and anyone could call claim_free_allowance on someone else's id to burn
-- their free website. The trigger functions cannot be invoked over RPC in
-- practice, but there is no reason to leave them granted either.
--
-- can_view_profile stays callable: the RLS policies on projects and
-- project_videos evaluate it as the querying role, and it only returns a
-- boolean the caller could infer anyway.

revoke execute on function public.claim_free_allowance(uuid, text) from anon, authenticated, public;
revoke execute on function public.release_free_allowance(uuid, text) from anon, authenticated, public;
revoke execute on function public.handle_new_user() from anon, authenticated, public;
revoke execute on function public.set_follow_accepted() from anon, authenticated, public;

-- Anything added later in public is private by default; grant per function.
alter default privileges in schema public revoke execute on functions from anon, authenticated, public;
