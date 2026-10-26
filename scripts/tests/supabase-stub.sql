-- Minimal stand-in for the parts of a Supabase database the scripts in
-- scripts/ rely on, so they can run in PGlite for the tests in this folder.
-- Only for tests: never run this against a real project.
--
--   roles     anon, authenticated, service_role (BYPASSRLS, like Supabase)
--   auth      auth.users and auth.uid(), which reads the JWT subject the
--             tests set with set_config('request.jwt.claim.sub', ...)
--   storage   storage.objects (RLS on, as in Supabase) and
--             storage.foldername()
--   grants    Supabase's default: anon and authenticated get every
--             privilege on new public tables; RLS and the scripts' own
--             revokes do the limiting.

create role anon nologin;
create role authenticated nologin;
create role service_role nologin bypassrls;

create schema auth;
create schema storage;

grant usage on schema public, auth, storage to anon, authenticated, service_role;

alter default privileges in schema public
  grant all on tables to anon, authenticated, service_role;

create table auth.users (
  id uuid primary key,
  email text,
  encrypted_password text,
  raw_user_meta_data jsonb not null default '{}'::jsonb
);

create function auth.uid()
returns uuid
language sql
stable
as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid;
$$;

grant execute on function auth.uid() to anon, authenticated, service_role;

create table storage.buckets (
  id text primary key,
  name text not null,
  public boolean not null default false
);

create table storage.objects (
  id uuid primary key default gen_random_uuid(),
  bucket_id text references storage.buckets (id),
  name text not null,
  owner uuid,
  unique (bucket_id, name)
);

alter table storage.objects enable row level security;
grant select, insert, update, delete on storage.objects to authenticated, service_role;
grant select on storage.buckets to authenticated, service_role;

-- Same result as Supabase's storage.foldername(): every path segment but
-- the last.
create function storage.foldername(name text)
returns text[]
language plpgsql
immutable
as $$
declare
  _parts text[] := string_to_array(name, '/');
begin
  return _parts[1:array_length(_parts, 1) - 1];
end;
$$;

grant execute on function storage.foldername(text) to anon, authenticated, service_role;

insert into storage.buckets (id, name) values ('avatars', 'avatars'), ('trip-photos', 'trip-photos');
