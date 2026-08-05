-- Usernames, full names, private accounts and follows — delta migration for
-- databases that already ran schema.sql before 2026-07-19 (second migration).
-- Paste into the Supabase SQL editor and run.

-- ── Profile identity columns ─────────────────────────────────────────
alter table public.profiles
  add column if not exists username text,
  add column if not exists full_name text,
  add column if not exists is_private boolean not null default false;

-- Backfill usernames for existing accounts from the email local part,
-- suffixed with part of the user id so collisions are practically impossible.
update public.profiles
   set username = substr(
         coalesce(
           nullif(regexp_replace(split_part(coalesce(email, ''), '@', 1), '[^A-Za-z0-9_]', '', 'g'), ''),
           'user'
         ), 1, 19) || '_' || substr(replace(id::text, '-', ''), 1, 4)
 where username is null;

alter table public.profiles
  add constraint profiles_username_format
  check (username is null or username ~ '^[A-Za-z0-9_]{3,24}$');

create unique index if not exists profiles_username_key
  on public.profiles (lower(username));

-- Members can edit their own public identity — and nothing else.
revoke update on public.profiles from anon, authenticated;
grant update (username, full_name, is_private) on public.profiles to authenticated;

drop policy if exists "update own profile" on public.profiles;
create policy "update own profile" on public.profiles
  for update using (auth.uid() = id) with check (auth.uid() = id);

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

create index if not exists follows_followee_idx on public.follows (followee_id);

alter table public.follows enable row level security;

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

create policy "follow" on public.follows
  for insert with check (auth.uid() = follower_id);

-- Followers can unfollow / cancel a request; owners can remove followers
-- or decline requests.
create policy "unfollow" on public.follows
  for delete using (auth.uid() = follower_id or auth.uid() = followee_id);

-- Only the account owner can approve a pending request.
create policy "approve follow" on public.follows
  for update using (auth.uid() = followee_id) with check (auth.uid() = followee_id);

create policy "read follows" on public.follows
  for select using (
    auth.uid() = follower_id
    or auth.uid() = followee_id
    or public.can_view_profile(followee_id)
  );

-- ── Privacy-aware showcase ───────────────────────────────────────────
-- Published sites from private accounts are only visible to their followers.
drop policy if exists "read published projects" on public.projects;
create policy "read published projects" on public.projects
  for select using (published = true and public.can_view_profile(user_id));

-- ── New-user bootstrap now records username + full name ──────────────
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
