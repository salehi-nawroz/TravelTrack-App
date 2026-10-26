-- Regular admins delete only their own data.
--
-- Applied to the live project on 2026-10-26 (via the Supabase MCP
-- connection, migration name "admin_ownership_deletion"). Runs after
-- admin-deletion-permissions.sql, whose rules it narrows. Safe to re-run and
-- all-or-nothing (one transaction).
--
--   role         may delete
--   user         their own cities, trips, trip photos, destinations, account
--   admin        their own cities, trips, trip photos, destinations - and
--                NO account at all, not even their own
--   super_admin  any city, trip, photo, destination; any other account
--                (admin_delete_user); their own account
--
-- Admins keep viewing and editing other users' cities and trips (as
-- before); they can't delete them, soft-delete (Trash) them, or take them
-- over by changing the owner.
--
-- Rollback: re-run admin-deletion-permissions.sql (it restores its own
-- versions of the cities DELETE policy and admin_delete_user), then the
-- trips-schema.sql version of delete_own_account(), the trip_destinations
-- DELETE policy from trips-schema.sql, and drop the cities_guard_update
-- trigger and function. The revoked grants weren't used by the app.

begin;

-- 1. cities DELETE: the owner (any role) or a super admin -------------------
-- Every existing DELETE policy is dropped, whatever its name: permissive
-- policies are OR-ed, so leaving any broader one in place would defeat this.

do $$
declare
  pol record;
begin
  for pol in
    select policyname from pg_policies
    where schemaname = 'public' and tablename = 'cities' and cmd = 'DELETE'
  loop
    execute format('drop policy %I on public.cities', pol.policyname);
  end loop;
end $$;

create policy "Owners and super admins can delete cities"
on public.cities
for delete
to authenticated
using (
  user_id = auth.uid()
  or public.current_user_role() = 'super_admin'
);

-- 2. cities UPDATE can't be used to delete or take over --------------------
-- The admin edit policy allows UPDATE on other users' cities, and the
-- table-wide UPDATE grant includes user_id and deleted_at. Without this an
-- admin could move someone's city to the Trash, or make it their own and
-- then delete it as its owner. Requests without a signed-in user (service
-- role, SQL Editor) aren't affected.

create or replace function public.cities_guard_update()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if auth.uid() is null then
    return new;
  end if;

  if new.user_id is distinct from old.user_id then
    raise exception 'A city''s owner can''t be changed.'
      using errcode = '42501';
  end if;

  if new.deleted_at is distinct from old.deleted_at
     and old.user_id <> auth.uid()
     and coalesce(public.current_user_role(), '') <> 'super_admin' then
    raise exception 'Only the city''s owner can move it to or from the Trash.'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

revoke execute on function public.cities_guard_update() from public;
revoke execute on function public.cities_guard_update() from anon;
revoke execute on function public.cities_guard_update() from authenticated;

drop trigger if exists cities_guard_update on public.cities;
create trigger cities_guard_update
  before update on public.cities
  for each row execute function public.cities_guard_update();

-- 3. trip destinations: removing one follows trip deletion -----------------
-- (owner or super admin, can_delete_trips_of from
-- admin-deletion-permissions.sql). Admins still add, edit and reorder.

drop policy if exists "Destinations follow trip access (delete)" on public.trip_destinations;
drop policy if exists "Owner and super admins can delete destinations" on public.trip_destinations;

create policy "Owner and super admins can delete destinations"
on public.trip_destinations for delete to authenticated
using (exists (
  select 1 from public.trips t
  where t.id = trip_destinations.trip_id
    and public.can_delete_trips_of(t.user_id)
));

-- (trips, trip_photos and trip-photos Storage DELETE are already owner or
-- super admin only - admin-deletion-permissions.sql - and stay as they are.)

-- 4. Accounts: only a super admin deletes another account ------------------
-- Same function as in admin-deletion-permissions.sql; only the role check
-- changes, from admin-or-super-admin to super admin.

create or replace function public.admin_delete_user(
  target_user_id uuid,
  p_dry_run boolean default false
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid := auth.uid();
  caller_role text;
  target_role text;
  is_demo boolean := false;
begin
  if caller_id is null then
    raise exception 'admin_delete_user() requires an authenticated user'
      using errcode = '28000';
  end if;

  caller_role := public.current_user_role();
  if caller_role is distinct from 'super_admin' then
    raise exception 'Only a super admin can delete accounts.'
      using errcode = '42501';
  end if;

  if target_user_id is null then
    raise exception 'No account to delete was given.'
      using errcode = '22004';
  end if;

  if target_user_id = caller_id then
    raise exception 'You can''t delete your own account here. Use Profile -> Delete account.'
      using errcode = '42501';
  end if;

  select p.role into target_role
  from public.profiles p
  join auth.users u on u.id = p.id
  where p.id = target_user_id
  for update of p;

  if target_role is null then
    raise exception 'This account doesn''t exist, or you can''t delete it.'
      using errcode = 'P0002';
  end if;

  if to_regclass('public.demo_accounts') is not null then
    execute 'select exists (select 1 from public.demo_accounts where user_id = $1)'
      into is_demo
      using target_user_id;
    if is_demo then
      raise exception 'The shared demo account cannot be deleted.'
        using errcode = '42501';
    end if;
  end if;

  if p_dry_run then
    return;
  end if;

  delete from public.trip_photos
  where user_id = target_user_id
     or trip_id in (select id from public.trips where user_id = target_user_id);

  delete from public.trips
  where user_id = target_user_id;

  delete from public.cities
  where user_id = target_user_id;

  delete from public.profiles
  where id = target_user_id;

  delete from auth.users
  where id = target_user_id;
end;
$$;

revoke execute on function public.admin_delete_user(uuid, boolean) from public;
revoke execute on function public.admin_delete_user(uuid, boolean) from anon;
grant execute on function public.admin_delete_user(uuid, boolean) to authenticated;

-- 5. delete_own_account(): not for regular admins --------------------------
-- The trips-schema.sql version, plus the admin check at the start.

create or replace function public.delete_own_account()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_uid uuid := auth.uid();
begin
  if current_uid is null then
    raise exception 'delete_own_account() requires an authenticated user'
      using errcode = '28000';
  end if;

  if public.current_user_role() = 'admin' then
    raise exception 'Admin accounts can''t be deleted here. Contact your super admin.'
      using errcode = '42501';
  end if;

  delete from public.trip_photos
  where trip_id in (select id from public.trips where user_id = current_uid);

  delete from public.trips
  where user_id = current_uid;  -- trip_destinations cascade

  delete from public.cities
  where user_id = current_uid;

  delete from public.profiles
  where id = current_uid;

  delete from auth.users
  where id = current_uid;
end;
$$;

revoke execute on function public.delete_own_account() from public;
revoke execute on function public.delete_own_account() from anon;
grant execute on function public.delete_own_account() to authenticated;

-- 6. Grants the app never uses ---------------------------------------------
-- TRUNCATE bypasses RLS entirely; anon never writes; profiles are only ever
-- deleted by the functions above (SECURITY DEFINER), never by a client.

revoke truncate, trigger, references on public.cities, public.profiles from anon, authenticated;
revoke insert, update, delete on public.cities, public.profiles from anon;
revoke delete on public.profiles from authenticated;

commit;
