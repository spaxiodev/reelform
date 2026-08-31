-- Per-user rate limiting for the expensive AI endpoints.
--
-- Until now the only ceiling on abuse was a user's credit balance, which does
-- not bound *rate* — a script with a funded account (or an admin id, which
-- spends nothing at all) could hammer Anthropic and ModelArk as fast as the
-- network allows and run up the provider bill.
--
-- This lives in Postgres rather than process memory on purpose: the app runs
-- as serverless functions, so an in-memory counter would reset on every cold
-- start and be per-instance besides.

create table if not exists public.rate_limits (
  user_id uuid not null references auth.users (id) on delete cascade,
  bucket text not null,                        -- which action, e.g. 'site_generate'
  window_start timestamptz not null default now(),
  count integer not null default 0,
  primary key (user_id, bucket)
);

-- No policies are defined, and RLS is on: this table is reachable only through
-- the security-definer function below, or by the service role.
alter table public.rate_limits enable row level security;

-- Fixed-window counter. Returns whether this call is allowed, how many calls
-- remain in the window, and when the window resets. The whole read-modify-write
-- happens in one statement, so concurrent requests cannot both slip past the
-- limit the way a separate SELECT-then-UPDATE would allow.
create or replace function public.consume_rate_limit(
  p_user uuid,
  p_bucket text,
  p_limit integer,
  p_window_seconds integer
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_now timestamptz := now();
  v_start timestamptz;
  v_count integer;
begin
  insert into public.rate_limits as rl (user_id, bucket, window_start, count)
  values (p_user, p_bucket, v_now, 1)
  on conflict (user_id, bucket) do update
    set window_start = case
          when rl.window_start < v_now - make_interval(secs => p_window_seconds)
            then v_now
          else rl.window_start
        end,
        count = case
          when rl.window_start < v_now - make_interval(secs => p_window_seconds)
            then 1
          else rl.count + 1
        end
  returning rl.window_start, rl.count into v_start, v_count;

  return jsonb_build_object(
    'allowed', v_count <= p_limit,
    'remaining', greatest(p_limit - v_count, 0),
    'reset_at', v_start + make_interval(secs => p_window_seconds)
  );
end;
$$;

revoke all on function public.consume_rate_limit(uuid, text, integer, integer) from public, anon, authenticated;

-- Housekeeping: rows for windows that closed long ago are dead weight. Run
-- this from pg_cron if you enable it, or ignore it — the table stays small
-- either way since it holds at most one row per user per bucket.
create or replace function public.prune_rate_limits() returns void
language sql
security definer
set search_path = public
as $$
  delete from public.rate_limits where window_start < now() - interval '1 day';
$$;

-- SECURITY DEFINER + DELETE: without this revoke it is reachable unauthenticated
-- at /rest/v1/rpc/prune_rate_limits. Service role only.
revoke all on function public.prune_rate_limits() from public, anon, authenticated;
