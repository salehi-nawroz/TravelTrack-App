-- Guard for the shared portfolio demo account (README, "Portfolio demo
-- account"). NOT applied automatically - review it, then run it once,
-- manually, in the Supabase Dashboard -> SQL Editor.
--
-- The demo account's password is public, so any visitor can sign in as it.
-- The Profile page hides "Change password" and "Delete account" for it, but
-- that is only the UI: anyone could still call the Auth API or
-- delete_own_account() directly and lock everyone else out. This makes the
-- database refuse that:
--
--   - the demo user's auth.users row can't be deleted (covers
--     delete_own_account(), which then rolls back as a whole), and
--   - its email and password can't be changed.
--
-- Nothing else changes: no RLS policy is touched, and the demo account keeps
-- the plain `user` role, so it only ever sees and edits its own rows.
--
-- Safe to re-run (CREATE ... IF NOT EXISTS / OR REPLACE, DROP ... IF EXISTS).

-- 1. Which accounts are demo accounts -------------------------------------
--
-- RLS on with no policies, and no grants to anon/authenticated: no client
-- can read the list or add/remove itself. Only the SQL Editor (postgres) and
-- the SECURITY DEFINER trigger below use it.

create table if not exists public.demo_accounts (
  user_id uuid primary key references auth.users (id) on delete cascade
);

alter table public.demo_accounts enable row level security;
revoke all on public.demo_accounts from anon, authenticated;

-- 2. Refuse destructive changes to a demo account ---------------------------
--
-- Triggers on auth.users run for every writer, including the Auth server
-- itself, so the Dashboard can't change these either while the account is
-- listed. To change the password or delete the account on purpose, remove
-- its row from public.demo_accounts first, then add it back.

create or replace function public.protect_demo_account()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if exists (select 1 from public.demo_accounts where user_id = old.id) then
    if tg_op = 'DELETE' then
      raise exception 'The shared demo account cannot be deleted.'
        using errcode = '42501';
    end if;
    if new.email is distinct from old.email
       or new.encrypted_password is distinct from old.encrypted_password then
      raise exception 'The shared demo account''s email and password cannot be changed.'
        using errcode = '42501';
    end if;
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

revoke execute on function public.protect_demo_account() from public, anon, authenticated;

drop trigger if exists protect_demo_account on auth.users;

create trigger protect_demo_account
before update or delete on auth.users
for each row execute function public.protect_demo_account();

-- 3. Register the demo account ----------------------------------------------
--
-- After creating the account (README), replace the placeholder with its
-- email and run this. The role check makes sure it is a regular user.

-- insert into public.demo_accounts (user_id)
-- select u.id
-- from auth.users u
-- join public.profiles p on p.id = u.id
-- where u.email = 'REPLACE_WITH_DEMO_EMAIL'
--   and p.role = 'user'
-- on conflict do nothing;

-- Verify: exactly one row, role `user`.
-- select u.email, p.role
-- from public.demo_accounts d
-- join auth.users u on u.id = d.user_id
-- join public.profiles p on p.id = d.user_id;

-- Rollback:
-- drop trigger if exists protect_demo_account on auth.users;
-- drop function if exists public.protect_demo_account();
-- drop table if exists public.demo_accounts;
