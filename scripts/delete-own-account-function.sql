-- Self-service account deletion for TravelTrack.
--
-- Run once, manually, in the Supabase Dashboard -> SQL Editor.
--
-- Superseded once scripts/trips-schema.sql has been applied: that file
-- redefines this function to also remove the user's trips first. Don't
-- re-run this file after that (scripts/trips-rollback.sql restores this
-- version when the trip feature is removed).
--
-- public.delete_own_account() lets the currently authenticated user
-- permanently delete their own account: their `cities` rows, their
-- `profiles` row, and finally their `auth.users` row. It only ever acts on
-- auth.uid() and never accepts a user id as a parameter, so one user can
-- never delete another's account through it.
--
-- Note on avatars: this function deliberately does NOT touch storage.objects.
-- Deleting a Storage object properly (both its metadata and the underlying
-- file) requires the Storage API, which plain SQL cannot call - a raw SQL
-- delete against storage.objects would only remove the metadata row and
-- leave the file itself behind. Left alone, an avatar file becomes
-- permanently inaccessible the moment its owning auth user is deleted
-- (Storage RLS requires auth.uid() to match the file's folder, which no
-- caller can ever satisfy again for a deleted user), so nothing becomes
-- newly readable by leaving it - it just continues to occupy a small
-- amount of storage. If you want it actually reclaimed later, that needs a
-- small script using the service-role key and the Storage API (the same
-- pattern as scripts/setup-avatars-storage.mjs), not this function.

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

-- Postgres grants EXECUTE to PUBLIC by default on function creation; close
-- that immediately, then grant only to the authenticated role.
revoke execute on function public.delete_own_account() from public;
revoke execute on function public.delete_own_account() from anon;
grant execute on function public.delete_own_account() to authenticated;
