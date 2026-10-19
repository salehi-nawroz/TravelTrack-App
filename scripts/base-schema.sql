-- TravelTrack base schema: profiles + cities, their owner-only RLS policies,
-- and the trigger that creates a profile for every new auth user.
--
-- For a NEW Supabase project only. The live project already has all of this
-- (it was created in the Dashboard before the other scripts existed); this
-- file was reconstructed on 2026-10-19 from the live project's catalog
-- (tables, constraints, policies, grants, trigger) so that a fresh project
-- can be set up from the repository. It is safe to re-run.
--
-- Run first, in the Supabase Dashboard -> SQL Editor. Then continue with the
-- order in README.md ("Database setup"): add-admin-roles.sql, etc.

-- 1. Tables ------------------------------------------------------------------

create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  full_name text,
  avatar_path text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.cities (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id),
  city_name text not null,
  country text not null,
  country_code text not null check (char_length(country_code) = 2),
  region text,
  notes text not null default '',
  latitude double precision not null check (latitude >= -90 and latitude <= 90),
  longitude double precision not null check (longitude >= -180 and longitude <= 180),
  visit_date date not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.profiles enable row level security;
alter table public.cities enable row level security;

-- 2. Owner-only policies ------------------------------------------------------
-- The admin / super_admin policies are added by add-admin-roles.sql and
-- restrict-admin-super-admin-access.sql (which also replace the DELETE
-- policy below with role-aware ones).

drop policy if exists "Users can read own profile" on public.profiles;
create policy "Users can read own profile" on public.profiles
  for select to authenticated using (auth.uid() = id);

drop policy if exists "Users can insert own profile" on public.profiles;
create policy "Users can insert own profile" on public.profiles
  for insert to authenticated with check (auth.uid() = id);

drop policy if exists "Users can update own profile" on public.profiles;
create policy "Users can update own profile" on public.profiles
  for update to authenticated using (auth.uid() = id) with check (auth.uid() = id);

drop policy if exists "Users can read own cities" on public.cities;
create policy "Users can read own cities" on public.cities
  for select to authenticated using (auth.uid() = user_id);

drop policy if exists "Users can insert own cities" on public.cities;
create policy "Users can insert own cities" on public.cities
  for insert to authenticated with check (auth.uid() = user_id);

drop policy if exists "Users can update own cities" on public.cities;
create policy "Users can update own cities" on public.cities
  for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "Users can delete own cities" on public.cities;
create policy "Users can delete own cities" on public.cities
  for delete to authenticated using (auth.uid() = user_id);

-- 3. A profile for every new user -------------------------------------------
-- Only the display name is copied from the sign-up metadata, never a role:
-- the metadata is user-controlled. role is added (default 'user') by
-- add-admin-roles.sql.

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, full_name)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'full_name', ''));
  return new;
end;
$$;

-- A trigger function, not an API: nobody needs to call it directly.
revoke execute on function public.handle_new_user() from public, anon, authenticated;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- 4. Indexes -----------------------------------------------------------------

create index if not exists cities_user_id_idx on public.cities (user_id);
