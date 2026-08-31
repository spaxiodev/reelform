-- Subscription credits expire; top-up credits do not.
--
-- Until now every credit was permanent: `grant_credits` only ever added, so a
-- subscriber who paid for months without generating anything accrued an
-- unbounded balance, and every one of those credits is deferred provider cost
-- carried against revenue that was already booked and spent. There was also no
-- breakage, which is most of the real margin in a credit business.
--
-- The balance is now split by *origin* rather than into two wallets:
--
--   profiles.credits              total spendable balance (unchanged meaning,
--                                 so every existing read stays correct)
--   profiles.subscription_credits how much of that total came from a plan and
--                                 is therefore subject to the rollover cap
--
-- Invariant: 0 <= subscription_credits <= credits. Spending burns the
-- expiring portion first, which is both the customer-friendly order and the
-- one that keeps the carried liability smallest.

alter table public.profiles
  add column if not exists subscription_credits integer not null default 0;

-- Existing balances predate the split and were sold as permanent. Leave them
-- at zero: everyone keeps what they already have, and the cap starts applying
-- from the next renewal onward.

alter table public.profiles
  drop constraint if exists profiles_subscription_credits_bounds;
alter table public.profiles
  add constraint profiles_subscription_credits_bounds
  check (subscription_credits >= 0 and subscription_credits <= credits);

-- ── Spend: expiring credits first ────────────────────────────────────
-- Right-hand column references in an UPDATE ... SET read the OLD row, so both
-- expressions below see the same pre-update `subscription_credits`.
create or replace function public.spend_credits(p_user uuid, p_amount integer, p_reason text, p_ref text default null)
returns boolean
language plpgsql
security definer set search_path = public
as $$
declare updated integer;
begin
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

-- ── Monthly subscription grant, capped ───────────────────────────────
-- Unused plan credits roll over, but only so far: the expiring balance is
-- capped at `p_cap` (one extra month's grant, see ROLLOVER_MONTHS in
-- lib/pricing.ts). Anything above the cap is forfeited at renewal and recorded
-- in the ledger, so a balance that stops growing is explainable rather than
-- looking like a missing grant.
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
  select subscription_credits into v_before from public.profiles where id = p_user for update;
  if v_before is null then
    return;
  end if;

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

-- ── Refunds ─────────────────────────────────────────────────────────
-- `grant_credits` is deliberately left alone, so a refund lands in the
-- permanent bucket even when the original spend came out of the expiring one.
--
-- The alternative (return it to the expiring bucket for anyone on a live plan)
-- is wrong more often than it is right: a subscriber whose spend actually came
-- out of purchased top-up credits would have those credits silently converted
-- into expiring ones. Tracking the per-spend split to refund it exactly would
-- mean threading a two-number balance through every call site.
--
-- The cost of the simple rule is that a refunded action converts an expiring
-- credit into a permanent one. That needs a genuine provider-side failure to
-- trigger (it cannot be induced on demand) and is bounded by the user's own
-- balance, so it is worth far less than the customer-facing correctness.

-- Postgres grants EXECUTE to PUBLIC by default, and this one is SECURITY
-- DEFINER: without the revoke any signed-in user could call it over PostgREST
-- and grant themselves credits. Matches the existing revokes on
-- spend_credits / grant_credits in schema.sql.
revoke execute on function public.grant_subscription_credits(uuid, integer, integer, text) from public, anon, authenticated;
