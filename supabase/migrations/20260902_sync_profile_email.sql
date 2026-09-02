-- Keep profiles.email in step with auth.users.email.
--
-- The signup trigger copies the address once, but a confirmed email change
-- (Account → Security → Change email) only updates auth.users. Everything the
-- app shows and every Stripe customer we create reads profiles.email, so
-- without this the account page kept showing the old address forever.

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
