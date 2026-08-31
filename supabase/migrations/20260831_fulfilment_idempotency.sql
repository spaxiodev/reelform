-- ── Stripe fulfilment idempotency ────────────────────────────────────
-- Stripe delivers webhooks *at least once*: any timeout, 5xx or network blip
-- makes it retry the same event, and a duplicate `checkout.session.completed`
-- or `invoice.paid` used to grant the credits a second time. The money paths
-- are now keyed on the Stripe object id carried in `ref`.
--
-- Only the two fulfilment reasons are keyed. `refund` deliberately reuses the
-- project id as its ref on every failed generation, so it must stay repeatable.

-- Collapse any duplicates an earlier at-least-once delivery already wrote,
-- keeping the first grant of each (user, reason, ref) and reversing the rest
-- out of the balance so the ledger and `profiles.credits` stay reconciled.
do $$
declare
  dup record;
begin
  for dup in
    select user_id, reason, ref, sum(delta) as extra
      from public.credit_ledger
     where reason in ('topup', 'subscription')
       and ref is not null
     group by user_id, reason, ref
    having count(*) > 1
  loop
    -- Everything after the earliest row of the group was a replay.
    delete from public.credit_ledger
     where id in (
       select id from public.credit_ledger
        where user_id = dup.user_id and reason = dup.reason and ref = dup.ref
        order by id offset 1
     );

    update public.profiles
       set credits = greatest(
             0,
             credits - (dup.extra - (
               select delta from public.credit_ledger
                where user_id = dup.user_id and reason = dup.reason and ref = dup.ref
                order by id limit 1
             ))
           )
     where id = dup.user_id;
  end loop;
end;
$$;

-- The hard guarantee: even if application logic regresses, the database
-- refuses to record the same fulfilment twice.
create unique index if not exists credit_ledger_fulfilment_key
  on public.credit_ledger (user_id, reason, ref)
  where ref is not null and reason in ('topup', 'subscription');

-- ── Grants become no-ops on replay ───────────────────────────────────
-- Checked in-function as well as indexed, so a retried webhook answers 200 and
-- Stripe stops retrying, instead of erroring on the constraint forever.
create or replace function public.grant_credits(p_user uuid, p_amount integer, p_reason text, p_ref text default null)
returns void
language plpgsql
security definer set search_path = public
as $$
begin
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

revoke execute on function public.grant_credits(uuid, integer, text, text) from public, anon, authenticated;
revoke execute on function public.grant_subscription_credits(uuid, integer, integer, text) from public, anon, authenticated;
