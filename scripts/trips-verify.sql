-- Read-only checks for the trip migration. Run in the Supabase Dashboard
-- -> SQL Editor AFTER trips-schema.sql, the bucket script and
-- trip-photos-storage-policies.sql. Every statement is a SELECT: nothing
-- here changes data, schema or Storage. Run the queries one at a time and
-- compare with the "Expect" notes.

-- 1. Tables exist with RLS enabled.
-- Expect 3 rows, rls_enabled = true for all.
select c.relname as table_name, c.relrowsecurity as rls_enabled
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relname in ('trips', 'trip_destinations', 'trip_photos')
order by 1;

-- 2. Delete rules that enforce the photo cleanup order.
-- Expect:
--   trip_destinations_trip_id_fkey  c (cascade)
--   trip_destinations_city_id_fkey  n (set null)
--   trip_photos_trip_id_fkey        a (no action: trip can't go while photos exist)
--   trip_photos_user_id_fkey        c (cascade)
--   trips_user_id_fkey              c (cascade)
select conname, confdeltype as on_delete
from pg_constraint
where conrelid in ('public.trips'::regclass,
                   'public.trip_destinations'::regclass,
                   'public.trip_photos'::regclass)
  and contype = 'f'
order by 1;

-- 3. Functions: security mode and who may execute them.
-- Expect 7 rows:
--   can_manage_trips_of             security_definer false
--   delete_own_account              true  (acl still includes service_role)
--   reorder_trip_destinations       false
--   set_trip_cover                  false
--   trip_destinations_check_city    true
--   trip_photos_prevent_orphan_file true
--   trips_set_updated_at            false
-- No acl may contain "anon=" or an entry for PUBLIC (one starting with "=").
-- The three trigger functions have no "authenticated=" entry either.
select p.proname, p.prosecdef as security_definer, p.proacl::text as acl,
       pg_get_function_identity_arguments(p.oid) as args
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname in ('can_manage_trips_of', 'delete_own_account', 'reorder_trip_destinations',
                    'set_trip_cover', 'trip_destinations_check_city',
                    'trip_photos_prevent_orphan_file', 'trips_set_updated_at')
order by 1;

-- 4. delete_own_account() now removes trip photos and trips first.
-- Expect: removes_photos = true, removes_trips = true, still_checks_auth = true.
select position('public.trip_photos' in prosrc) > 0 as removes_photos,
       position('public.trips' in prosrc) > 0 as removes_trips,
       position('requires an authenticated user' in prosrc) > 0 as still_checks_auth
from pg_proc
where proname = 'delete_own_account'
  and pronamespace = 'public'::regnamespace;

-- 5. Triggers on the trip tables.
-- Expect 4 rows: trip_destinations_check_city, trip_destinations_set_updated_at,
-- trip_photos_prevent_orphan_file, trips_set_updated_at.
select tgrelid::regclass::text as table_name, tgname
from pg_trigger
where tgrelid in ('public.trips'::regclass,
                  'public.trip_destinations'::regclass,
                  'public.trip_photos'::regclass)
  and not tgisinternal
order by 1, 2;

-- 6. Table privileges. Expect NO rows for anon, and for authenticated only
-- SELECT and DELETE on each table (INSERT/UPDATE are column-level, see 7).
-- In particular: no TRUNCATE, TRIGGER or REFERENCES for either role.
select grantee, table_name, privilege_type
from information_schema.role_table_grants
where table_schema = 'public'
  and table_name in ('trips', 'trip_destinations', 'trip_photos')
  and grantee in ('anon', 'authenticated')
order by 1, 2, 3;

-- 7. Column-level INSERT/UPDATE for authenticated. Expect exactly:
--   trips             INSERT/UPDATE: description, end_date, start_date, title
--   trip_destinations INSERT: arrival_date, city_id, city_name, country, country_code,
--                     departure_date, latitude, longitude, notes, position, region, trip_id
--                     UPDATE: the same without trip_id
--   trip_photos       INSERT: caption, content_type, id, size_bytes, storage_path, trip_id
--                     UPDATE: caption, is_cover
-- user_id, status, created_at and updated_at must never appear.
select table_name, privilege_type, string_agg(column_name, ', ' order by column_name) as columns
from information_schema.column_privileges
where table_schema = 'public'
  and table_name in ('trips', 'trip_destinations', 'trip_photos')
  and grantee = 'authenticated'
  and privilege_type in ('INSERT', 'UPDATE')
group by 1, 2
order by 1, 2;

-- 8. RLS policies on the trip tables. Expect 12 rows:
--   trips: 1 each of SELECT, INSERT, UPDATE, DELETE
--   trip_destinations: 1 each of SELECT, INSERT, UPDATE, DELETE
--   trip_photos: 1 each of SELECT, INSERT, UPDATE, DELETE
-- All for role {authenticated}. The INSERT policies on trips and
-- trip_photos must compare user_id with auth.uid().
select tablename, cmd, policyname, roles::text, qual, with_check
from pg_policies
where schemaname = 'public'
  and tablename in ('trips', 'trip_destinations', 'trip_photos')
order by 1, 2;

-- 9. Storage policies for the trip-photos bucket. Expect 3 rows (INSERT,
-- SELECT, DELETE) for {authenticated}, and NO UPDATE policy. The existing
-- avatar policies are unaffected (not listed here).
select policyname, cmd, roles::text
from pg_policies
where schemaname = 'storage'
  and tablename = 'objects'
  and policyname like 'Trip%'
order by 2;

-- 10. The bucket: private, 5MB, image types only, versioning disabled.
-- Expect exactly 1 row: public = false, file_size_limit = 5242880,
-- allowed_mime_types = {image/jpeg,image/png,image/webp},
-- versioning_status = DISABLED.
select id, public, file_size_limit, allowed_mime_types, versioning_status
from storage.buckets
where id = 'trip-photos';

-- 11. Nothing stored yet (on a fresh migration). Expect 0, 0, 0, 0.
select (select count(*) from public.trips) as trips,
       (select count(*) from public.trip_destinations) as destinations,
       (select count(*) from public.trip_photos) as photo_records,
       (select count(*) from storage.objects where bucket_id = 'trip-photos') as photo_files;

-- 12. Consistency, any time later. Both counts must be 0:
--   records_without_file: photo rows whose file is gone (broken images)
--   files_without_record: files with no photo row (orphans, e.g. a failed
--                         upload whose clean-up also failed)
select
  (select count(*) from public.trip_photos p
   where not exists (select 1 from storage.objects o
                     where o.bucket_id = 'trip-photos' and o.name = p.storage_path))
    as records_without_file,
  (select count(*) from storage.objects o
   where o.bucket_id = 'trip-photos'
     and not exists (select 1 from public.trip_photos p where p.storage_path = o.name))
    as files_without_record;
