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

do $$
begin
  alter table public.profiles add constraint profiles_username_format
    check (username is null or username ~ '^[A-Za-z0-9_]{3,24}$');
exception when duplicate_object then null;
end $$;

create unique index if not exists profiles_username_key
  on public.profiles (lower(username));

-- Public-safe slice of profiles (no email, credits or Stripe ids). The view
-- runs as its owner, so it bypasses profiles RLS by design.
create or replace view public.public_profiles as
  select id, username, full_name, is_private, created_at
    from public.profiles;

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

-- ── Chat messages (per project, for both Claude and Seedance threads) ─
create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  role text not null,                          -- user | assistant
  target text not null default 'claude',       -- claude | seedance
  content text not null,
  created_at timestamptz not null default now()
);

alter table public.messages add column if not exists target text not null default 'claude';

create index if not exists messages_project_idx on public.messages (project_id, created_at);

-- ── Credit ledger (audit trail of every credit movement) ─────────────
create table if not exists public.credit_ledger (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.profiles (id) on delete cascade,
  delta integer not null,
  reason text not null,                        -- signup_bonus | video_generation | site_generation | refund | subscription | topup
  ref text,
  created_at timestamptz not null default now()
);

create index if not exists ledger_user_idx on public.credit_ledger (user_id, created_at desc);

-- ── Row Level Security ───────────────────────────────────────────────
alter table public.profiles enable row level security;
alter table public.projects enable row level security;
alter table public.messages enable row level security;
alter table public.credit_ledger enable row level security;
alter table public.follows enable row level security;

drop policy if exists "read own profile" on public.profiles;
create policy "read own profile" on public.profiles
  for select using (auth.uid() = id);

-- Members can edit their own public identity — and nothing else. Column-level
-- grants keep credits/plan/Stripe fields out of reach even for the row owner.
revoke update on public.profiles from anon, authenticated;
grant update (username, full_name, is_private) on public.profiles to authenticated;

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

  insert into public.profiles (id, email, username, full_name, credits)
  values (new.id, new.email, v_username, v_full_name, 150);
  insert into public.credit_ledger (user_id, delta, reason) values (new.id, 150, 'signup_bonus');
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
  update public.profiles
     set credits = credits - p_amount
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

-- ── Grant credits (top-ups, subscription renewals, refunds) ──────────
create or replace function public.grant_credits(p_user uuid, p_amount integer, p_reason text, p_ref text default null)
returns void
language plpgsql
security definer set search_path = public
as $$
begin
  update public.profiles set credits = credits + p_amount where id = p_user;
  insert into public.credit_ledger (user_id, delta, reason, ref)
  values (p_user, p_amount, p_reason, p_ref);
end;
$$;

-- Only the service role may call the credit functions.
revoke execute on function public.spend_credits(uuid, integer, text, text) from public, anon, authenticated;
revoke execute on function public.grant_credits(uuid, integer, text, text) from public, anon, authenticated;
