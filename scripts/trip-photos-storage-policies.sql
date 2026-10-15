-- Storage RLS policies for the private "trip-photos" bucket.
--
-- Run once, manually, in the Supabase Dashboard -> SQL Editor, AFTER
-- scripts/trips-schema.sql (these policies reference public.trips and
-- public.trip_photos) and after scripts/setup-trip-photos-storage.mjs has
-- created the bucket. Safe to re-run: each policy is dropped (if present)
-- and recreated, inside one transaction.
--
-- Path convention: trip-photos/{owner user id}/{trip id}/{photo id}.{ext}
-- (storage.foldername(name))[1] is the owner id, [2] the trip id.
--
-- Access mirrors the database exactly:
--   - upload: only the trip's owner, only into their own trip's folder,
--     exactly two folders deep;
--   - view / delete: the owner within their own folder, or anyone allowed
--     to see the matching public.trip_photos row. That subquery runs under
--     trip_photos' own RLS, so admins get precisely the photos of trips
--     they can manage (never a super_admin's) and no folder-wide access;
--   - no UPDATE policy: objects can't be overwritten or moved by anyone
--     (uploads must not use upsert).
--
-- These policies only ever match bucket_id = 'trip-photos'; the existing
-- avatars policies are untouched.

begin;

drop policy if exists "Trip owners can upload trip photos" on storage.objects;

create policy "Trip owners can upload trip photos"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'trip-photos'
  and array_length(storage.foldername(objects.name), 1) = 2
  and (storage.foldername(objects.name))[1] = auth.uid()::text
  and exists (
    select 1
    from public.trips t
    where t.id::text = (storage.foldername(objects.name))[2]
      and t.user_id = auth.uid()
  )
);

drop policy if exists "Trip photos are visible to owner and trip admins" on storage.objects;

create policy "Trip photos are visible to owner and trip admins"
on storage.objects
for select
to authenticated
using (
  bucket_id = 'trip-photos'
  and (
    (storage.foldername(objects.name))[1] = auth.uid()::text
    or exists (
      select 1
      from public.trip_photos p
      where p.storage_path = objects.name
    )
  )
);

drop policy if exists "Trip photos are deletable by owner and trip admins" on storage.objects;

create policy "Trip photos are deletable by owner and trip admins"
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'trip-photos'
  and (
    (storage.foldername(objects.name))[1] = auth.uid()::text
    or exists (
      select 1
      from public.trip_photos p
      where p.storage_path = objects.name
    )
  )
);

commit;
