-- Email marketing: consent, proof of consent, and a send log.
--
-- Canada's anti-spam law (CASL) and Quebec's Law 25 both come down to the
-- same three things for us:
--
--   1. Marketing email needs *express, opt-in* consent, asked for separately
--      from the terms of service, with a box that is unchecked by default.
--   2. We must be able to prove that consent: when it was given and how.
--   3. Withdrawing it has to be free, easy, and honoured promptly (CASL gives
--      ten business days; we do it on the spot).
--
-- Transactional email (receipts, account notices, the welcome mail) needs no
-- consent, but a hard bounce or a spam complaint still turns everything off.

alter table public.profiles add column if not exists marketing_opt_in boolean not null default false;
-- Proof of consent. Set by trigger whenever marketing_opt_in flips to true.
alter table public.profiles add column if not exists marketing_consent_at timestamptz;
-- Where the consent came from: signup_form | signup_google | account_settings.
alter table public.profiles add column if not exists marketing_consent_source text;
-- Set by trigger whenever marketing_opt_in flips to false.
alter table public.profiles add column if not exists marketing_unsubscribed_at timestamptz;
-- Hard bounce or spam complaint reported by the email provider. Once set, the
-- address receives nothing further from us (the auth emails go through
-- Supabase and are unaffected).
alter table public.profiles add column if not exists email_bounced_at timestamptz;

-- Consent is written through the server (so the source is recorded), never by
-- the browser directly: the column-level grant deliberately stays as it was.

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

revoke execute on function public.stamp_marketing_consent() from anon, authenticated, public;

drop trigger if exists on_profile_marketing_change on public.profiles;
create trigger on_profile_marketing_change
  before update of marketing_opt_in on public.profiles
  for each row execute function public.stamp_marketing_consent();

-- One row per email we send. Two jobs: the drip schedule reads it so nobody
-- gets the same message twice, and it is the audit trail for "what did you
-- send me and when".
create table if not exists public.email_log (
  id bigint generated always as identity primary key,
  user_id uuid references public.profiles (id) on delete cascade,
  email text not null,
  kind text not null,          -- welcome | topup_receipt | plan_started | ... | tips_1 | nudge_free_build
  provider_id text,            -- Resend's id for the message
  created_at timestamptz not null default now()
);

create index if not exists email_log_user_kind_idx on public.email_log (user_id, kind);
create index if not exists email_log_created_idx on public.email_log (created_at desc);

-- No policies: the service role writes it, nobody else reads it over the API.
alter table public.email_log enable row level security;

-- The signup trigger now carries the consent given on the signup form. The
-- form sends marketing_opt_in in the user metadata; a Google signup has no
-- form, so the callback records that consent afterwards through the server.
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

revoke execute on function public.handle_new_user() from anon, authenticated, public;
