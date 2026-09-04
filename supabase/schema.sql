-- Reelform — Supabase schema
-- Run this in the Supabase SQL editor (or `supabase db push`).

-- ── Profiles ─────────────────────────────────────────────────────────
create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text,
  username text check (username is null or username ~ '^[A-Za-z0-9_]{3,24}$'),
  full_name text,
  is_private boolean not null default false,   -- followers-only profile & showcase entries
  credits integer not null default 0,
  plan text not null default 'free',          -- free | starter | pro | studio
  plan_status text,                            -- active | past_due | canceled
  stripe_customer_id text,
  stripe_subscription_id text,
  created_at timestamptz not null default now()
);

-- Back-fill columns onto a profiles table created by an earlier version of
-- this file (`create table if not exists` above is a no-op for those).
alter table public.profiles add column if not exists email text;
alter table public.profiles add column if not exists username text;
alter table public.profiles add column if not exists full_name text;
alter table public.profiles add column if not exists is_private boolean not null default false;
alter table public.profiles add column if not exists credits integer not null default 0;
alter table public.profiles add column if not exists plan text not null default 'free';
alter table public.profiles add column if not exists plan_status text;
alter table public.profiles add column if not exists stripe_customer_id text;
alter table public.profiles add column if not exists stripe_subscription_id text;
alter table public.profiles add column if not exists created_at timestamptz not null default now();

-- Every account gets one complete website free: one hero video and one site
-- build. Both are one-shot flags rather than a credit balance, so the free tier
-- can't be topped up — regenerating or editing needs a subscription.
-- How much of `credits` came from a subscription and is therefore subject to
-- the rollover cap. Invariant: 0 <= subscription_credits <= credits. See
-- migrations/20260831_credit_rollover.sql for why the balance is split by
-- origin rather than into two separate wallets.
alter table public.profiles add column if not exists subscription_credits integer not null default 0;

-- Email marketing consent (see migrations/20260904_email_marketing.sql).
-- Opt-in only, unchecked by default, with the when/how of the consent kept as
-- proof. email_bounced_at is set from the provider's bounce/complaint webhook
-- and silences every non-auth email to that address.
alter table public.profiles add column if not exists marketing_opt_in boolean not null default false;
alter table public.profiles add column if not exists marketing_consent_at timestamptz;
alter table public.profiles add column if not exists marketing_consent_source text;
alter table public.profiles add column if not exists marketing_unsubscribed_at timestamptz;
alter table public.profiles add column if not exists email_bounced_at timestamptz;

alter table public.profiles drop constraint if exists profiles_subscription_credits_bounds;
alter table public.profiles add constraint profiles_subscription_credits_bounds
  check (subscription_credits >= 0 and subscription_credits <= credits);

alter table public.profiles add column if not exists free_video_used boolean not null default false;
alter table public.profiles add column if not exists free_site_used boolean not null default false;

-- Profile picture. Null means "no picture chosen" — the UI draws initials on a
-- colour derived from the account id, so every member has a face without
-- anyone having to upload one. Uploads land in the public `avatars` bucket
-- (created on first upload by /api/account/avatar).
alter table public.profiles add column if not exists avatar_url text;

do $$
begin
  alter table public.profiles add constraint profiles_username_format
    check (username is null or username ~ '^[A-Za-z0-9_]{3,24}$');
exception when duplicate_object then null;
end $$;

create unique index if not exists profiles_username_key
  on public.profiles (lower(username));

-- Public-safe slice of profiles (no email, credits or Stripe ids), readable
-- by everyone even though profiles RLS only lets a member read their own row.
-- The RLS bypass lives in a SECURITY DEFINER function that returns exactly the
-- safe columns (same trust model as can_view_profile below); the view is a
-- security_invoker wrapper so Supabase's security_definer_view lint stays
-- quiet. See migrations/20260902_public_profiles_invoker.sql for the
-- trade-off (filters are not pushed into the function).
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

-- ── Follows ──────────────────────────────────────────────────────────
-- Following a public account is instant (accepted = true). Following a
-- private account creates a pending request the owner must approve.
create table if not exists public.follows (
  follower_id uuid not null references public.profiles (id) on delete cascade,
  followee_id uuid not null references public.profiles (id) on delete cascade,
  accepted boolean not null default false,
  created_at timestamptz not null default now(),
  primary key (follower_id, followee_id),
  check (follower_id <> followee_id)
);

alter table public.follows add column if not exists accepted boolean not null default false;

create index if not exists follows_followee_idx on public.follows (followee_id);

-- Server-side accept state: instant for public accounts, pending for private
-- ones — regardless of what the client sends.
create or replace function public.set_follow_accepted()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  select not p.is_private into new.accepted
    from public.profiles p where p.id = new.followee_id;
  new.accepted := coalesce(new.accepted, true);
  return new;
end;
$$;

drop trigger if exists follows_accept on public.follows;
create trigger follows_accept
  before insert on public.follows
  for each row execute function public.set_follow_accepted();

-- True when the viewer may see p_owner's public presence: the account is not
-- private, it's their own, or they follow it. Security definer so it can be
-- used inside policies without tripping profiles/follows RLS.
create or replace function public.can_view_profile(p_owner uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select coalesce((
    select not p.is_private
           or p.id = auth.uid()
           or exists (
             select 1 from public.follows f
              where f.followee_id = p.id and f.follower_id = auth.uid() and f.accepted
           )
      from public.profiles p
     where p.id = p_owner
  ), false);
$$;

grant execute on function public.can_view_profile(uuid) to anon, authenticated;

-- ── Projects ─────────────────────────────────────────────────────────
create table if not exists public.projects (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  name text not null,
  industry text,
  site_brief text,
  video_brief text,
  video_mode text not null default 'loop',     -- loop | scrub
  video_status text not null default 'none',   -- none | queued | running | succeeded | failed
  video_task_id text,
  video_url text,
  video_settings jsonb not null default '{}'::jsonb,
  site_html text,
  model text not null default 'claude-opus-4-8',
  published boolean not null default false,    -- opted into the public showcase
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.projects add column if not exists industry text;
alter table public.projects add column if not exists site_brief text;
alter table public.projects add column if not exists video_brief text;
alter table public.projects add column if not exists video_mode text not null default 'loop';
alter table public.projects add column if not exists video_status text not null default 'none';
alter table public.projects add column if not exists video_task_id text;
alter table public.projects add column if not exists video_url text;
alter table public.projects add column if not exists video_settings jsonb not null default '{}'::jsonb;
alter table public.projects add column if not exists site_html text;
alter table public.projects add column if not exists model text not null default 'claude-opus-4-8';
alter table public.projects add column if not exists published boolean not null default false;
alter table public.projects add column if not exists published_at timestamptz;

create index if not exists projects_user_idx on public.projects (user_id, updated_at desc);
create index if not exists projects_published_idx on public.projects (published_at desc)
  where published;

-- ── Project videos (a production can feature several clips) ──────────
-- The projects.video_* columns above remain as a mirror of the first clip so
-- the export and showcase paths that read a single hero video keep working.
create table if not exists public.project_videos (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  position integer not null default 0,         -- order on the page, 0 = hero
  label text not null default 'Hero video',    -- how the site should use it
  prompt text,
  mode text not null default 'loop',           -- loop | scrub (per clip)
  status text not null default 'none',         -- none | queued | running | succeeded | failed
  task_id text,
  url text,
  settings jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists project_videos_project_idx
  on public.project_videos (project_id, position);

-- ── Chat messages (per project, for both the Claude and shot threads) ─
create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  role text not null,                          -- user | assistant
  target text not null default 'claude',       -- claude | video
  content text not null,
  created_at timestamptz not null default now()
);

alter table public.messages add column if not exists target text not null default 'claude';

-- The shot thread used to be named after the video model rather than the step.
update public.messages set target = 'video' where target = 'seedance';

create index if not exists messages_project_idx on public.messages (project_id, created_at);

-- ── Credit ledger (audit trail of every credit movement) ─────────────
create table if not exists public.credit_ledger (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.profiles (id) on delete cascade,
  delta integer not null,
  reason text not null,                        -- signup_bonus | video_generation | site_generation | site_edit | refund | subscription | rollover_capped | topup
  ref text,
  created_at timestamptz not null default now()
);

create index if not exists ledger_user_idx on public.credit_ledger (user_id, created_at desc);

-- Stripe delivers webhooks *at least once*, so fulfilment is keyed on the
-- Stripe object id in `ref` and the same payment can never be credited twice.
-- `refund` is deliberately excluded: it reuses the project id as its ref on
-- every failed generation and must stay repeatable.
create unique index if not exists credit_ledger_fulfilment_key
  on public.credit_ledger (user_id, reason, ref)
  where ref is not null and reason in ('topup', 'subscription');

-- ── Row Level Security ───────────────────────────────────────────────
alter table public.profiles enable row level security;
alter table public.projects enable row level security;
alter table public.project_videos enable row level security;
alter table public.messages enable row level security;
alter table public.credit_ledger enable row level security;
alter table public.follows enable row level security;

drop policy if exists "read own profile" on public.profiles;
create policy "read own profile" on public.profiles
  for select using (auth.uid() = id);

-- Members can edit their own public identity — and nothing else. Column-level
-- grants keep credits/plan/Stripe fields out of reach even for the row owner.
revoke update on public.profiles from anon, authenticated;
grant update (username, full_name, is_private, avatar_url) on public.profiles to authenticated;

drop policy if exists "update own profile" on public.profiles;
create policy "update own profile" on public.profiles
  for update using (auth.uid() = id) with check (auth.uid() = id);

drop policy if exists "follow" on public.follows;
create policy "follow" on public.follows
  for insert with check (auth.uid() = follower_id);

-- Followers can unfollow / cancel a request; owners can remove followers
-- or decline requests.
drop policy if exists "unfollow" on public.follows;
create policy "unfollow" on public.follows
  for delete using (auth.uid() = follower_id or auth.uid() = followee_id);

-- Only the account owner can approve a pending request.
drop policy if exists "approve follow" on public.follows;
create policy "approve follow" on public.follows
  for update using (auth.uid() = followee_id) with check (auth.uid() = followee_id);

drop policy if exists "read follows" on public.follows;
create policy "read follows" on public.follows
  for select using (
    auth.uid() = follower_id
    or auth.uid() = followee_id
    or public.can_view_profile(followee_id)
  );

drop policy if exists "crud own projects" on public.projects;
create policy "crud own projects" on public.projects
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Anyone (including logged-out visitors) can read projects their owners
-- published to the showcase — unless the owner's account is private, in which
-- case only their followers (and they themselves) can. Note: this exposes
-- every column of a published row via the anon API — publishing is an
-- explicit opt-in in the studio.
drop policy if exists "read published projects" on public.projects;
create policy "read published projects" on public.projects
  for select using (published = true and public.can_view_profile(user_id));

drop policy if exists "crud own project videos" on public.project_videos;
create policy "crud own project videos" on public.project_videos
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Clips of a published project are readable by anyone who may see the project
-- itself, so the public showcase can render every video on the page.
drop policy if exists "read published project videos" on public.project_videos;
create policy "read published project videos" on public.project_videos
  for select using (
    exists (
      select 1 from public.projects p
       where p.id = project_id
         and p.published = true
         and public.can_view_profile(p.user_id)
    )
  );

drop policy if exists "crud own messages" on public.messages;
create policy "crud own messages" on public.messages
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "read own ledger" on public.credit_ledger;
create policy "read own ledger" on public.credit_ledger
  for select using (auth.uid() = user_id);

-- Credits are only ever changed by the security-definer functions below
-- (called with the service-role key from the server) — never directly by users.

-- ── New-user bootstrap: profile row + signup bonus ───────────────────
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  v_username text := nullif(regexp_replace(coalesce(new.raw_user_meta_data->>'username', ''), '[^A-Za-z0-9_]', '', 'g'), '');
  v_full_name text := nullif(trim(coalesce(new.raw_user_meta_data->>'full_name', '')), '');
  v_opt_in boolean := coalesce(new.raw_user_meta_data->>'marketing_opt_in', 'false') = 'true';
begin
  if v_username is null then
    v_username := nullif(regexp_replace(split_part(coalesce(new.email, ''), '@', 1), '[^A-Za-z0-9_]', '', 'g'), '');
  end if;
  if v_username is null or length(v_username) < 3 then
    v_username := 'user_' || substr(replace(new.id::text, '-', ''), 1, 8);
  end if;
  v_username := substr(v_username, 1, 24);
  if exists (select 1 from public.profiles where lower(username) = lower(v_username)) then
    v_username := substr(v_username, 1, 19) || '_' || substr(replace(new.id::text, '-', ''), 1, 4);
  end if;

  -- No signup credits: new accounts get one free build (see the free_*_used
  -- flags above) and buy a subscription from there.
  insert into public.profiles (
    id, email, username, full_name, credits,
    marketing_opt_in, marketing_consent_at, marketing_consent_source
  )
  values (
    new.id, new.email, v_username, v_full_name, 0,
    v_opt_in,
    case when v_opt_in then now() end,
    case when v_opt_in then 'signup_form' end
  );
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ── Atomic credit spend (returns false when balance is insufficient) ─
create or replace function public.spend_credits(p_user uuid, p_amount integer, p_reason text, p_ref text default null)
returns boolean
language plpgsql
security definer set search_path = public
as $$
declare updated integer;
begin
  -- Expiring credits are spent before permanent ones: better for the customer,
  -- and it keeps the carried liability as small as possible. Right-hand column
  -- references in an UPDATE ... SET read the OLD row, so both expressions here
  -- see the same pre-update `subscription_credits`.
  update public.profiles
     set credits = credits - p_amount,
         subscription_credits = subscription_credits - least(subscription_credits, p_amount)
   where id = p_user and credits >= p_amount;
  get diagnostics updated = row_count;
  if updated = 0 then
    return false;
  end if;
  insert into public.credit_ledger (user_id, delta, reason, ref)
  values (p_user, -p_amount, p_reason, p_ref);
  return true;
end;
$$;

-- ── Free-build allowance ─────────────────────────────────────────────
-- Claiming flips a flag false → true and reports whether *this* call was the
-- one that flipped it. Two concurrent requests therefore can't both spend the
-- same free build: the loser's UPDATE matches zero rows. Same shape as
-- spend_credits, for the same reason.
create or replace function public.claim_free_allowance(p_user uuid, p_kind text)
returns boolean
language plpgsql
security definer set search_path = public
as $$
declare updated integer;
begin
  if p_kind = 'video' then
    update public.profiles set free_video_used = true
     where id = p_user and free_video_used = false;
  elsif p_kind = 'site' then
    update public.profiles set free_site_used = true
     where id = p_user and free_site_used = false;
  else
    raise exception 'unknown allowance kind: %', p_kind;
  end if;
  get diagnostics updated = row_count;
  return updated = 1;
end;
$$;

-- Hands the allowance back when the generation never happened — the mirror of
-- refunding credits on a failed render.
create or replace function public.release_free_allowance(p_user uuid, p_kind text)
returns void
language plpgsql
security definer set search_path = public
as $$
begin
  if p_kind = 'video' then
    update public.profiles set free_video_used = false where id = p_user;
  elsif p_kind = 'site' then
    update public.profiles set free_site_used = false where id = p_user;
  end if;
end;
$$;

-- ── Grant credits (top-ups, subscription renewals, refunds) ──────────
create or replace function public.grant_credits(p_user uuid, p_amount integer, p_reason text, p_ref text default null)
returns void
language plpgsql
security definer set search_path = public
as $$
begin
  -- A retried webhook must not grant the same payment twice.
  if p_ref is not null and p_reason in ('topup', 'subscription') then
    perform 1 from public.credit_ledger
      where user_id = p_user and reason = p_reason and ref = p_ref;
    if found then
      return;
    end if;
  end if;

  update public.profiles set credits = credits + p_amount where id = p_user;
  insert into public.credit_ledger (user_id, delta, reason, ref)
  values (p_user, p_amount, p_reason, p_ref);
end;
$$;

-- ── Monthly subscription grant, capped ───────────────────────────────
-- Unused plan credits roll over, but the expiring balance is capped at `p_cap`
-- (one extra month's grant, see ROLLOVER_MONTHS in lib/pricing.ts). Anything
-- above it is forfeited at renewal and recorded, so a balance that stops
-- growing is explainable rather than looking like a missing grant.
create or replace function public.grant_subscription_credits(
  p_user uuid,
  p_amount integer,
  p_cap integer,
  p_ref text default null
)
returns void
language plpgsql
security definer set search_path = public
as $$
declare
  v_before integer;
  v_after integer;
  v_added integer;
begin
  -- A replayed invoice must not grant a second month.
  if p_ref is not null then
    perform 1 from public.credit_ledger
      where user_id = p_user and reason = 'subscription' and ref = p_ref;
    if found then
      return;
    end if;
  end if;

  select subscription_credits into v_before from public.profiles where id = p_user for update;
  if v_before is null then
    return;
  end if;

  -- greatest(p_cap, v_before) so a cap that drops (a downgrade) never claws
  -- back credits the customer has already been granted.
  v_after := least(v_before + p_amount, greatest(p_cap, v_before));
  v_added := v_after - v_before;

  if v_added > 0 then
    update public.profiles
       set credits = credits + v_added,
           subscription_credits = v_after
     where id = p_user;
    insert into public.credit_ledger (user_id, delta, reason, ref)
    values (p_user, v_added, 'subscription', p_ref);
  end if;

  if v_added < p_amount then
    insert into public.credit_ledger (user_id, delta, reason, ref)
    values (p_user, 0, 'rollover_capped', p_ref);
  end if;
end;
$$;

-- Only the service role may call the credit functions.
revoke execute on function public.spend_credits(uuid, integer, text, text) from public, anon, authenticated;
revoke execute on function public.grant_credits(uuid, integer, text, text) from public, anon, authenticated;
revoke execute on function public.grant_subscription_credits(uuid, integer, integer, text) from public, anon, authenticated;

-- ── Rate limiting ────────────────────────────────────────────────────
-- Bounds how fast one account can hit the endpoints that cost us money at a
-- provider. Credits cap total spend but not rate, and admin ids bypass credits
-- entirely. Kept in Postgres rather than process memory because the app runs
-- as serverless functions (an in-memory counter would be per-instance and
-- would reset on every cold start).
create table if not exists public.rate_limits (
  user_id uuid not null references auth.users (id) on delete cascade,
  bucket text not null,
  window_start timestamptz not null default now(),
  count integer not null default 0,
  primary key (user_id, bucket)
);

-- RLS on with no policies: reachable only via the function below or the
-- service role.
alter table public.rate_limits enable row level security;

-- Fixed-window counter. The whole read-modify-write is one statement, so two
-- concurrent requests cannot both slip past the limit.
create or replace function public.consume_rate_limit(
  p_user uuid,
  p_bucket text,
  p_limit integer,
  p_window_seconds integer
) returns jsonb
language plpgsql
security definer set search_path = public
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
            then v_now else rl.window_start end,
        count = case
          when rl.window_start < v_now - make_interval(secs => p_window_seconds)
            then 1 else rl.count + 1 end
  returning rl.window_start, rl.count into v_start, v_count;

  return jsonb_build_object(
    'allowed', v_count <= p_limit,
    'remaining', greatest(p_limit - v_count, 0),
    'reset_at', v_start + make_interval(secs => p_window_seconds)
  );
end;
$$;

revoke execute on function public.consume_rate_limit(uuid, text, integer, integer) from public, anon, authenticated;

-- ── Deploying a site to the user's own Vercel / Supabase accounts ────

-- ── Connected third-party accounts ───────────────────────────────────
-- Tokens are sealed with INTEGRATION_SECRET before they reach this table
-- (see lib/crypto.ts). RLS is enabled with *no policies on purpose*: nothing
-- but the service-role client may read a row, so a token can never be pulled
-- through the browser client the way a project row can.
create table if not exists public.integrations (
  user_id uuid not null references public.profiles (id) on delete cascade,
  provider text not null check (provider in ('vercel', 'supabase')),
  access_token text not null,                  -- encrypted
  refresh_token text,                          -- encrypted
  expires_at timestamptz,                      -- null = does not expire (Vercel)
  account_id text,                             -- Vercel team id, when installed on a team
  account_name text,                           -- display label for the UI
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, provider)
);

alter table public.integrations enable row level security;

revoke all on public.integrations from anon, authenticated;

-- ── Deployment history ───────────────────────────────────────────────
create table if not exists public.deployments (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  provider text not null check (provider in ('vercel', 'supabase')),
  -- vercel: hosting. supabase: backend, storage, or both.
  target text not null default 'hosting',
  status text not null default 'queued',       -- queued | building | ready | error
  url text,                                    -- the live site, once it is up
  external_id text,                            -- Vercel deployment id
  error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists deployments_project_idx
  on public.deployments (project_id, created_at desc);
create index if not exists deployments_user_idx
  on public.deployments (user_id, created_at desc);

alter table public.deployments enable row level security;

-- Read-only for the owner: rows are written by the deploy route with the
-- service-role client, which already knows the user is entitled to deploy.
drop policy if exists "deployments_select_own" on public.deployments;
create policy "deployments_select_own" on public.deployments
  for select using (user_id = auth.uid());

-- ── Where a project currently lives ──────────────────────────────────
-- Kept on the project so a re-deploy lands on the same Vercel project and
-- writes into the same Supabase project instead of creating a new one, and so
-- the live-site cap can be counted per plan.
alter table public.projects add column if not exists vercel_project_id text;
alter table public.projects add column if not exists vercel_url text;
alter table public.projects add column if not exists supabase_project_ref text;
alter table public.projects add column if not exists supabase_url text;
alter table public.projects add column if not exists live_at timestamptz;

create index if not exists projects_live_idx on public.projects (user_id)
  where live_at is not null;

-- ── Keep profiles.email in step with auth.users.email (see migrations/20260902_sync_profile_email.sql)
create or replace function public.handle_user_email_change()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  if new.email is distinct from old.email then
    update public.profiles set email = new.email where id = new.id;
  end if;
  return new;
end;
$$;

-- Not callable through the REST API; it only ever runs as a trigger.
revoke execute on function public.handle_user_email_change() from anon, authenticated, public;

drop trigger if exists on_auth_user_email_changed on auth.users;
create trigger on_auth_user_email_changed
  after update of email on auth.users
  for each row execute function public.handle_user_email_change();

-- ── Email marketing: consent stamps + send log ───────────────────────
create or replace function public.stamp_marketing_consent()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  if new.marketing_opt_in and not old.marketing_opt_in then
    new.marketing_consent_at := now();
    new.marketing_unsubscribed_at := null;
  elsif old.marketing_opt_in and not new.marketing_opt_in then
    new.marketing_unsubscribed_at := now();
  end if;
  return new;
end;
$$;

drop trigger if exists on_profile_marketing_change on public.profiles;
create trigger on_profile_marketing_change
  before update of marketing_opt_in on public.profiles
  for each row execute function public.stamp_marketing_consent();

create table if not exists public.email_log (
  id bigint generated always as identity primary key,
  user_id uuid references public.profiles (id) on delete cascade,
  email text not null,
  kind text not null,
  provider_id text,
  created_at timestamptz not null default now()
);
create index if not exists email_log_user_kind_idx on public.email_log (user_id, kind);
create index if not exists email_log_created_idx on public.email_log (created_at desc);
alter table public.email_log enable row level security;

-- ── RPC lockdown (see migrations/20260902_lock_down_rpc.sql): only the service role may call the entitlement helpers
revoke execute on function public.claim_free_allowance(uuid, text) from anon, authenticated, public;
revoke execute on function public.release_free_allowance(uuid, text) from anon, authenticated, public;
revoke execute on function public.handle_new_user() from anon, authenticated, public;
revoke execute on function public.stamp_marketing_consent() from anon, authenticated, public;
revoke execute on function public.set_follow_accepted() from anon, authenticated, public;
alter default privileges in schema public revoke execute on functions from anon, authenticated, public;
