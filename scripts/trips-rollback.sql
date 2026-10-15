-- Rollback for trips-schema.sql and trip-photos-storage-policies.sql.
--
-- Run manually in the Supabase Dashboard -> SQL Editor, only if you want to
-- remove the trip feature and ALL trip data.
--
-- Before running:
--   1. Set VITE_TRIPS_ENABLED=false (or remove it) and redeploy, so the app
--      stops using the trip tables.
--   2. Remove every object in the "trip-photos" bucket (Dashboard -> Storage,
--      or the Storage API). This script refuses to run while any remain,
--      because dropping the tables would leave those files untracked.
-- After running: delete the now-empty "trip-photos" bucket in the Dashboard
-- (optional).
--
-- Order matters: delete_own_account() is restored to its original body
-- FIRST, so account deletion never points at dropped tables, even briefly.
-- Every object dropped here was created by the trip scripts; nothing
-- shared with cities, profiles or avatars is touched. Safe to re-run (IF
-- EXISTS throughout) and all-or-nothing (one transaction).

begin;

do $$
begin
  if exists (select 1 from storage.objects where bucket_id = 'trip-photos') then
    raise exception 'The trip-photos bucket still has files. Remove them through the Storage API or Dashboard first.';
  end if;
end;
$$;

-- 1. Original delete_own_account() (verbatim from
--    scripts/delete-own-account-function.sql). CREATE OR REPLACE keeps its
--    owner and EXECUTE grants.
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

-- 2. Storage policies for the trip-photos bucket.
drop policy if exists "Trip owners can upload trip photos" on storage.objects;
drop policy if exists "Trip photos are visible to owner and trip admins" on storage.objects;
drop policy if exists "Trip photos are deletable by owner and trip admins" on storage.objects;

-- 3. RPCs, tables (their policies, indexes and triggers go with them), then
--    the trip-only helper functions.
drop function if exists public.reorder_trip_destinations(uuid, uuid[]);
drop function if exists public.set_trip_cover(uuid);
drop table if exists public.trip_photos;
drop table if exists public.trip_destinations;
drop table if exists public.trips;
drop function if exists public.trip_photos_prevent_orphan_file();
drop function if exists public.trip_destinations_check_city();
drop function if exists public.can_manage_trips_of(uuid);
drop function if exists public.trips_set_updated_at();

commit;
