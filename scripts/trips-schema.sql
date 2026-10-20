-- Trip tracking for TravelTrack: trips, trip_destinations, trip_photos.
--
-- Run once, manually, in the Supabase Dashboard -> SQL Editor.
--
-- Order of the trip setup (each step needs the one before it):
--   1. scripts/trips-schema.sql                  (this file - tables, RLS, RPCs)
--   2. scripts/setup-trip-photos-storage.mjs     (creates the private bucket)
--   3. scripts/trip-photos-storage-policies.sql  (Storage RLS for the bucket)
--   4. deploy the frontend (trip tracking is always on; it needs steps 1-3).
-- Undo with scripts/trips-rollback.sql.
--
-- Requires the existing helpers public.current_user_role() and
-- public.get_role_for_user(uuid) (add-admin-roles.sql and
-- restrict-admin-super-admin-access.sql).
--
-- Access rule (same as the existing cities policies): the owner, any
-- super_admin, or an admin when the owner is NOT a super_admin. Admins can
-- view/edit/delete trips of `user` and `admin` accounts, never a
-- super_admin's. Only the owner creates trips and uploads photos.
--
-- Everything this file creates is trip-specific (no shared helper names),
-- so the rollback can drop all of it without affecting cities, profiles or
-- avatars. The only existing object it changes is delete_own_account()
-- (section 8); the rollback restores the original.
--
-- Runs in one transaction: if any statement fails, nothing is applied.
-- Not re-runnable once it has succeeded (CREATE TABLE fails on the second
-- run, rolling that run back without changing anything).

begin;

-- 1. Helpers -----------------------------------------------------------------

create function public.trips_set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- Trigger functions are never called directly; firing a trigger doesn't
-- check EXECUTE, so nobody needs it (same as the other trigger functions).
revoke execute on function public.trips_set_updated_at() from public;
revoke execute on function public.trips_set_updated_at() from anon;
revoke execute on function public.trips_set_updated_at() from authenticated;

-- True when the caller may view/manage trips owned by owner_id. SECURITY
-- INVOKER on purpose: it only combines the existing SECURITY DEFINER role
-- helpers, so it exposes nothing they don't already. A missing owner
-- profile makes get_role_for_user() null, and `null <> 'super_admin'` is
-- not true, so an admin is denied (fails closed).
create function public.can_manage_trips_of(owner_id uuid)
returns boolean
language sql
stable
set search_path = ''
as $$
  select
    owner_id = auth.uid()
    or public.current_user_role() = 'super_admin'
    or (
      public.current_user_role() = 'admin'
      and public.get_role_for_user(owner_id) <> 'super_admin'
    );
$$;

revoke execute on function public.can_manage_trips_of(uuid) from public;
revoke execute on function public.can_manage_trips_of(uuid) from anon;
grant execute on function public.can_manage_trips_of(uuid) to authenticated;

-- 2. trips -------------------------------------------------------------------

create table public.trips (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid()
              references auth.users (id) on delete cascade,
  title       text not null
              check (char_length(btrim(title)) between 1 and 120),
  description text not null default ''
              check (char_length(description) <= 2000),
  start_date  date not null,
  end_date    date,
  -- Derived from end_date, so the two can never disagree.
  status      text generated always as (
                case when end_date is null then 'active' else 'completed' end
              ) stored,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  constraint trips_dates_check
    check (end_date is null or end_date >= start_date)
);

create index trips_user_id_start_date_idx
  on public.trips (user_id, start_date desc);

-- At most one active (not yet ended) trip per user; completed trips are
-- unlimited. Also guards against a double-submitted "Start trip".
create unique index trips_one_active_per_user
  on public.trips (user_id) where end_date is null;

create trigger trips_set_updated_at
  before update on public.trips
  for each row execute function public.trips_set_updated_at();

-- 3. trip_destinations -------------------------------------------------------
-- city_id is set when the destination was picked from the owner's Cities,
-- and null for a new place added only to this trip (never added to
-- Cities). Name, country and coordinates are always copied in, so the
-- itinerary keeps its details if the city is later edited, trashed or
-- permanently deleted (city_id then becomes null via ON DELETE SET NULL).

create table public.trip_destinations (
  id             uuid primary key default gen_random_uuid(),
  trip_id        uuid not null
                 references public.trips (id) on delete cascade,
  city_id        uuid references public.cities (id) on delete set null,
  city_name      text not null
                 check (char_length(btrim(city_name)) between 1 and 200),
  country        text not null
                 check (char_length(btrim(country)) between 1 and 200),
  country_code   text not null check (char_length(country_code) = 2),
  region         text,
  latitude       double precision not null
                 check (latitude between -90 and 90),
  longitude      double precision not null
                 check (longitude between -180 and 180),
  position       integer not null check (position >= 0),
  arrival_date   date,
  departure_date date,
  notes          text not null default ''
                 check (char_length(notes) <= 1000),
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  constraint trip_destinations_dates_check check (
    arrival_date is null
    or departure_date is null
    or departure_date >= arrival_date
  ),
  -- Deferrable so reorder_trip_destinations() can swap positions in a
  -- single UPDATE (checked at the end of the statement, not per row).
  constraint trip_destinations_position_key
    unique (trip_id, position) deferrable initially immediate
);

create index trip_destinations_city_id_idx
  on public.trip_destinations (city_id);

create trigger trip_destinations_set_updated_at
  before update on public.trip_destinations
  for each row execute function public.trips_set_updated_at();

-- A linked city must belong to the trip's owner - blocks linking someone
-- else's city by id (including an admin editing another user's trip).
-- SECURITY DEFINER so the check sees the city regardless of the caller's
-- own cities visibility; it only reads, and returns nothing to the caller.
create function public.trip_destinations_check_city()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.city_id is not null and not exists (
    select 1
    from public.cities c
    join public.trips t on t.id = new.trip_id
    where c.id = new.city_id
      and c.user_id = t.user_id
  ) then
    raise exception 'Destination city must belong to the trip owner'
      using errcode = '23514';
  end if;
  return new;
end;
$$;

-- Trigger functions are never called directly; firing a trigger doesn't
-- check EXECUTE, so nobody needs it.
revoke execute on function public.trip_destinations_check_city() from public;
revoke execute on function public.trip_destinations_check_city() from anon;
revoke execute on function public.trip_destinations_check_city() from authenticated;

create trigger trip_destinations_check_city
  before insert or update of city_id on public.trip_destinations
  for each row execute function public.trip_destinations_check_city();

-- 4. trip_photos -------------------------------------------------------------
-- One row per object in the private "trip-photos" bucket, at exactly
--   {owner user id}/{trip id}/{photo id}.{jpg|png|webp}
-- (enforced below). Every object belongs to exactly one row and no object
-- is shared, so deleting a photo can never remove another trip's or
-- another user's file.
--
-- trip_id uses the default NO ACTION (not CASCADE): a trip can't be deleted
-- while photo rows still exist, and a photo row can't be deleted while its
-- file still exists (trigger below). Together that forces the only safe
-- order - file, then photo row, then trip - so a trip is never removed
-- while its photos remain in Storage.

create table public.trip_photos (
  id           uuid primary key default gen_random_uuid(),
  trip_id      uuid not null references public.trips (id),
  user_id      uuid not null default auth.uid()
               references auth.users (id) on delete cascade,
  storage_path text not null unique,
  is_cover     boolean not null default false,
  caption      text not null default ''
               check (char_length(caption) <= 300),
  content_type text not null
               check (content_type in ('image/jpeg', 'image/png', 'image/webp')),
  size_bytes   integer not null
               check (size_bytes > 0 and size_bytes <= 5242880),
  created_at   timestamptz not null default now(),
  constraint trip_photos_path_check check (
    storage_path = user_id::text || '/' || trip_id::text || '/' || id::text
      || case content_type
           when 'image/jpeg' then '.jpg'
           when 'image/png' then '.png'
           when 'image/webp' then '.webp'
         end
  )
);

create index trip_photos_trip_id_created_at_idx
  on public.trip_photos (trip_id, created_at);

create unique index trip_photos_one_cover_per_trip
  on public.trip_photos (trip_id) where is_cover;

-- Refuses to delete a photo row while its Storage object still exists, so
-- a failed file removal can never leave an untracked (orphaned) file.
-- SECURITY DEFINER to read storage.objects regardless of Storage RLS; it
-- only checks existence. Side effect, by design: deleting an auth user who
-- still has trip photo files fails until those files are removed (the
-- app's account deletion removes them first).
create function public.trip_photos_prevent_orphan_file()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if exists (
    select 1
    from storage.objects o
    where o.bucket_id = 'trip-photos'
      and o.name = old.storage_path
  ) then
    raise exception 'Remove the photo file from Storage before deleting its record'
      using errcode = '23503';
  end if;
  return old;
end;
$$;

revoke execute on function public.trip_photos_prevent_orphan_file() from public;
revoke execute on function public.trip_photos_prevent_orphan_file() from anon;
revoke execute on function public.trip_photos_prevent_orphan_file() from authenticated;

create trigger trip_photos_prevent_orphan_file
  before delete on public.trip_photos
  for each row execute function public.trip_photos_prevent_orphan_file();

-- 5. Privileges --------------------------------------------------------------
-- Supabase's default privileges give anon/authenticated ALL on new tables
-- (including TRUNCATE and TRIGGER, which RLS doesn't cover), so start from
-- nothing and grant only what the app uses. Clients can never write
-- ownership (user_id), trip_id or storage_path after insert, ids, status or
-- timestamps. user_id is filled by its auth.uid() default. anon gets
-- nothing. service_role keeps its defaults (server-side only).

revoke all on public.trips, public.trip_destinations, public.trip_photos from anon;
revoke all on public.trips, public.trip_destinations, public.trip_photos from authenticated;

grant select, delete on public.trips, public.trip_destinations, public.trip_photos
  to authenticated;

grant insert (title, description, start_date, end_date)
  on public.trips to authenticated;
grant update (title, description, start_date, end_date)
  on public.trips to authenticated;

grant insert (trip_id, city_id, city_name, country, country_code, region,
              latitude, longitude, position, arrival_date, departure_date, notes)
  on public.trip_destinations to authenticated;
grant update (city_id, city_name, country, country_code, region,
              latitude, longitude, position, arrival_date, departure_date, notes)
  on public.trip_destinations to authenticated;

-- id is client-supplied so the file can be uploaded under its final path
-- first; the path check above ties the row to that id. is_cover is not
-- insertable - the cover is only ever set through set_trip_cover().
grant insert (id, trip_id, storage_path, caption, content_type, size_bytes)
  on public.trip_photos to authenticated;
grant update (is_cover, caption)
  on public.trip_photos to authenticated;

-- 6. Row Level Security ------------------------------------------------------

alter table public.trips enable row level security;
alter table public.trip_destinations enable row level security;
alter table public.trip_photos enable row level security;

-- trips

create policy "Trips are visible to owner and admins"
on public.trips for select to authenticated
using (public.can_manage_trips_of(user_id));

create policy "Users can create their own trips"
on public.trips for insert to authenticated
with check (user_id = auth.uid());

create policy "Owner and admins can update trips"
on public.trips for update to authenticated
using (public.can_manage_trips_of(user_id))
with check (public.can_manage_trips_of(user_id));

create policy "Owner and admins can delete trips"
on public.trips for delete to authenticated
using (public.can_manage_trips_of(user_id));

-- trip_destinations: exactly the parent trip's access.

create policy "Destinations follow trip access (select)"
on public.trip_destinations for select to authenticated
using (exists (
  select 1 from public.trips t
  where t.id = trip_destinations.trip_id
    and public.can_manage_trips_of(t.user_id)
));

create policy "Destinations follow trip access (insert)"
on public.trip_destinations for insert to authenticated
with check (exists (
  select 1 from public.trips t
  where t.id = trip_destinations.trip_id
    and public.can_manage_trips_of(t.user_id)
));

create policy "Destinations follow trip access (update)"
on public.trip_destinations for update to authenticated
using (exists (
  select 1 from public.trips t
  where t.id = trip_destinations.trip_id
    and public.can_manage_trips_of(t.user_id)
))
with check (exists (
  select 1 from public.trips t
  where t.id = trip_destinations.trip_id
    and public.can_manage_trips_of(t.user_id)
));

create policy "Destinations follow trip access (delete)"
on public.trip_destinations for delete to authenticated
using (exists (
  select 1 from public.trips t
  where t.id = trip_destinations.trip_id
    and public.can_manage_trips_of(t.user_id)
));

-- trip_photos: only the trip's owner adds photos; owner and admins view,
-- change cover/caption and delete.

create policy "Photos follow trip access (select)"
on public.trip_photos for select to authenticated
using (exists (
  select 1 from public.trips t
  where t.id = trip_photos.trip_id
    and public.can_manage_trips_of(t.user_id)
));

create policy "Trip owners can add photos"
on public.trip_photos for insert to authenticated
with check (
  trip_photos.user_id = auth.uid()
  and exists (
    select 1 from public.trips t
    where t.id = trip_photos.trip_id
      and t.user_id = auth.uid()
  )
);

create policy "Photos follow trip access (update)"
on public.trip_photos for update to authenticated
using (exists (
  select 1 from public.trips t
  where t.id = trip_photos.trip_id
    and public.can_manage_trips_of(t.user_id)
))
with check (exists (
  select 1 from public.trips t
  where t.id = trip_photos.trip_id
    and public.can_manage_trips_of(t.user_id)
));

create policy "Photos follow trip access (delete)"
on public.trip_photos for delete to authenticated
using (exists (
  select 1 from public.trips t
  where t.id = trip_photos.trip_id
    and public.can_manage_trips_of(t.user_id)
));

-- 7. RPCs --------------------------------------------------------------------
-- SECURITY INVOKER: they run under the caller's own RLS and grants, so they
-- can't do anything the caller couldn't do with plain updates - they only
-- make multi-row changes atomic.

-- Moves the cover to one photo (the partial unique index allows one cover
-- per trip, so unset-then-set must happen together).
create function public.set_trip_cover(p_photo_id uuid)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_trip_id uuid;
begin
  select trip_id into v_trip_id
  from public.trip_photos
  where id = p_photo_id;

  if v_trip_id is null then
    raise exception 'Photo not found or not allowed' using errcode = 'P0002';
  end if;

  update public.trip_photos
  set is_cover = false
  where trip_id = v_trip_id and is_cover and id <> p_photo_id;

  update public.trip_photos
  set is_cover = true
  where id = p_photo_id;

  if not found then
    raise exception 'Photo not found or not allowed' using errcode = 'P0002';
  end if;
end;
$$;

-- Rewrites positions 0..n-1 in the given order. The id list must contain
-- exactly the trip's destinations: no more, no fewer, no duplicates.
create function public.reorder_trip_destinations(
  p_trip_id uuid,
  p_destination_ids uuid[]
)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_expected integer;
  v_updated integer;
begin
  select count(*) into v_expected
  from public.trip_destinations
  where trip_id = p_trip_id;

  if v_expected = 0
     or v_expected <> coalesce(array_length(p_destination_ids, 1), 0)
     or v_expected <> (
       select count(distinct x) from unnest(p_destination_ids) as x
     )
  then
    raise exception 'Destination list does not match the trip'
      using errcode = '22023';
  end if;

  update public.trip_destinations d
  set position = o.ord - 1
  from unnest(p_destination_ids) with ordinality as o (id, ord)
  where d.id = o.id and d.trip_id = p_trip_id;

  get diagnostics v_updated = row_count;
  if v_updated <> v_expected then
    raise exception 'Destination list does not match the trip'
      using errcode = '22023';
  end if;
end;
$$;

revoke execute on function public.set_trip_cover(uuid) from public;
revoke execute on function public.set_trip_cover(uuid) from anon;
grant execute on function public.set_trip_cover(uuid) to authenticated;

revoke execute on function public.reorder_trip_destinations(uuid, uuid[]) from public;
revoke execute on function public.reorder_trip_destinations(uuid, uuid[]) from anon;
grant execute on function public.reorder_trip_destinations(uuid, uuid[]) to authenticated;

-- 8. Account deletion --------------------------------------------------------
-- Same function as scripts/delete-own-account-function.sql (same name,
-- signature, SECURITY DEFINER, search_path, null-user check and error
-- code, same cities -> profiles -> auth.users deletes in the same order),
-- with the caller's trip photo rows and trips removed first.
--
-- CREATE OR REPLACE keeps the function's owner and existing EXECUTE grants
-- (live today: postgres, authenticated, service_role); the revoke/grant
-- lines below are the same ones the original script runs and don't touch
-- service_role.
--
-- Photo FILES can't be removed from SQL. The app removes them through the
-- Storage API first and aborts if any removal fails. If files remain anyway
-- (e.g. this RPC called directly), the trip_photos_prevent_orphan_file
-- trigger makes the whole call fail - nothing is deleted - rather than
-- orphaning them.

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

commit;
