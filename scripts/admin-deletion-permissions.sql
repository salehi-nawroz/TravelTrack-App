-- Admin deletion permissions: who may delete accounts, cities and trips.
--
-- Applied to the live project. Narrowed by admin-ownership-deletion.sql
-- (run it after this one): regular admins there delete only their own data
-- and no account, so the admin rules for cities and accounts below are
-- replaced. Run once, manually, in the Supabase Dashboard -> SQL Editor,
-- AFTER every other script (it changes policies
-- created by add-admin-roles.sql, trips-schema.sql and
-- trip-photos-storage-policies.sql). Then deploy the admin-delete-user Edge
-- Function (supabase/functions/admin-delete-user, see README "Database
-- setup"). Safe to re-run, and all-or-nothing (one transaction).
--
-- Roles stay as they are (`user`, `admin`, `super_admin`), and so does the
-- existing scope rule: an admin works on `user` and `admin` accounts and
-- never sees or touches a super_admin's; a super_admin is unrestricted.
--
--   cities    admins may now delete cities in their scope (before: only
--             super_admins, and owners with the `user` role).
--   trips     only the owner or a super_admin may delete a trip, its photo
--             records or its photo files. Admins keep viewing and editing
--             trips in their scope (details, destinations, cover, captions).
--   accounts  admin_delete_user() deletes another account and all its rows
--             in one transaction, after checking the caller's role in
--             public.profiles (never user-editable metadata).
--
-- Rollback (restores the previous behaviour):
--   - cities: drop policy "Admins can delete cities"; recreate
--     "Super admins can delete any city" from add-admin-roles.sql, section 6.
--   - trips: drop the two "Owner and super admins ..." policies and the
--     storage policy below; recreate "Owner and admins can delete trips" and
--     "Photos follow trip access (delete)" from trips-schema.sql, section 6,
--     and "Trip photos are deletable by owner and trip admins" from
--     trip-photos-storage-policies.sql; drop function can_delete_trips_of.
--   - accounts: drop function public.admin_delete_user(uuid, boolean).

begin;

-- 1. Cities: admins delete within their scope ------------------------------
-- Same condition as the existing "Admins can view all cities" and "Admins can
-- update all cities" policies. "Users can delete their own cities" stays.
-- This one also covers a super_admin (unrestricted, as before) and an
-- admin's own cities, so it replaces "Super admins can delete any city".
-- A city's trip destinations keep their copied name, country and
-- coordinates: trip_destinations.city_id is ON DELETE SET NULL.

drop policy if exists "Super admins can delete any city" on public.cities;
drop policy if exists "Admins can delete cities" on public.cities;

create policy "Admins can delete cities"
on public.cities
for delete
to authenticated
using (
  public.current_user_role() = 'super_admin'
  or (
    public.current_user_role() = 'admin'
    and public.get_role_for_user(user_id) <> 'super_admin'
  )
);

-- 2. Trips: only the owner or a super_admin deletes ------------------------
-- SECURITY INVOKER, like can_manage_trips_of(): it only combines the
-- existing role helper with auth.uid().

create or replace function public.can_delete_trips_of(owner_id uuid)
returns boolean
language sql
stable
set search_path = ''
as $$
  select
    owner_id = auth.uid()
    or public.current_user_role() = 'super_admin';
$$;

revoke execute on function public.can_delete_trips_of(uuid) from public;
revoke execute on function public.can_delete_trips_of(uuid) from anon;
grant execute on function public.can_delete_trips_of(uuid) to authenticated;

drop policy if exists "Owner and admins can delete trips" on public.trips;
drop policy if exists "Owner and super admins can delete trips" on public.trips;

create policy "Owner and super admins can delete trips"
on public.trips for delete to authenticated
using (public.can_delete_trips_of(user_id));

-- Photo records: deleting them is the first step of deleting a trip, so an
-- admin must not be able to do it either.
drop policy if exists "Photos follow trip access (delete)" on public.trip_photos;
drop policy if exists "Owner and super admins can delete trip photos" on public.trip_photos;

create policy "Owner and super admins can delete trip photos"
on public.trip_photos for delete to authenticated
using (exists (
  select 1 from public.trips t
  where t.id = trip_photos.trip_id
    and public.can_delete_trips_of(t.user_id)
));

-- Photo files: the owner within their own folder, or a super_admin for a
-- recorded photo. An admin can still view the files (SELECT policy
-- unchanged) but no longer remove them.
drop policy if exists "Trip photos are deletable by owner and trip admins" on storage.objects;
drop policy if exists "Trip photos are deletable by owner and super admins" on storage.objects;

create policy "Trip photos are deletable by owner and super admins"
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'trip-photos'
  and (
    (storage.foldername(objects.name))[1] = auth.uid()::text
    or (
      public.current_user_role() = 'super_admin'
      and exists (
        select 1
        from public.trip_photos p
        where p.storage_path = objects.name
      )
    )
  )
);

-- 3. Accounts: admin_delete_user() -----------------------------------------
-- Deletes another user's account: photo records, trips (destinations
-- cascade), cities, profile and auth user, in one transaction - either all
-- of it happens or none of it.
--
-- Who may delete whom (checked here, from public.profiles):
--   - the caller must be an admin or super_admin;
--   - never the caller's own account (that's Profile -> Delete account,
--     i.e. delete_own_account());
--   - an admin never a super_admin account - reported exactly like an
--     unknown id, since admins can't see super_admins at all;
--   - never an account listed in public.demo_accounts, when that table
--     exists (demo-account-guard.sql; its trigger would refuse anyway).
--
-- Photo FILES can't be removed from SQL. The admin-delete-user Edge Function
-- calls this with p_dry_run => true first (checks only, changes nothing),
-- then removes the files with the service role, then calls it for real. If
-- files remain, the trip_photos_prevent_orphan_file trigger fails the
-- whole call and nothing is deleted. Avatar files are removed by the Edge
-- Function afterwards.
--
-- SECURITY DEFINER to delete other users' rows and the auth user. It runs
-- as the signed-in caller (auth.uid()), so it can't be pointed at an
-- arbitrary actor.

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
  if caller_role is null or caller_role not in ('admin', 'super_admin') then
    raise exception 'Only admins can delete accounts.'
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

  -- Locks the profile, so a concurrent role change can't slip between this
  -- check and the deletes below.
  select p.role into target_role
  from public.profiles p
  join auth.users u on u.id = p.id
  where p.id = target_user_id
  for update of p;

  if target_role is null
     or (caller_role = 'admin' and target_role = 'super_admin') then
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
  where user_id = target_user_id;  -- trip_destinations cascade

  delete from public.cities
  where user_id = target_user_id;  -- only the owner's own trips link them

  delete from public.profiles
  where id = target_user_id;

  delete from auth.users
  where id = target_user_id;
end;
$$;

revoke execute on function public.admin_delete_user(uuid, boolean) from public;
revoke execute on function public.admin_delete_user(uuid, boolean) from anon;
grant execute on function public.admin_delete_user(uuid, boolean) to authenticated;

commit;
