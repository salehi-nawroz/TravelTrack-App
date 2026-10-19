-- Recommended hardening for the LIVE project, from the production-readiness
-- review on 2026-10-19 (Supabase security/performance advisors + a review of
-- grants). NOT applied. Nothing here changes what the app can do; run it
-- manually in the Dashboard -> SQL Editor once you have reviewed it, ideally
-- after a backup. Every statement is safe to re-run.
--
-- Not included on purpose:
--   * current_user_role(), get_role_for_user(), get_admin_users() and
--     delete_own_account() stay executable by `authenticated`: the RLS
--     policies and the app call them as the signed-in user.
--   * Rewriting policies to `(select auth.uid())` (advisor "auth_rls_initplan")
--     only matters at a much larger row count; revisit if lists get slow.

-- 1. handle_new_user() is a trigger function but is also reachable as
--    /rest/v1/rpc/handle_new_user. Calling it that way fails, but there is no
--    reason to expose it. The trigger keeps working (triggers don't need
--    EXECUTE for the calling role).
revoke execute on function public.handle_new_user() from public, anon, authenticated;

-- 2. Profiles are created only by the trigger above (the app never inserts
--    them). The INSERT grant currently includes the `role` column; an insert
--    can't succeed today because every user already has a profile row, but
--    removing the grant closes the door for good.
revoke insert on public.profiles from anon, authenticated;

-- 3. Indexes for the foreign keys the advisor flagged (owner lookups on
--    every list query and on account deletion).
create index if not exists cities_user_id_idx on public.cities (user_id);
create index if not exists trip_photos_user_id_idx on public.trip_photos (user_id);

-- 4. Not SQL - Dashboard -> Authentication -> Settings:
--    enable "Leaked password protection" (advisor: auth_leaked_password_protection).

-- Verify (read-only):
--   select has_function_privilege('authenticated', 'public.handle_new_user()', 'execute');  -- false
--   select has_table_privilege('authenticated', 'public.profiles', 'insert');              -- false
--   select indexname from pg_indexes where indexname in ('cities_user_id_idx', 'trip_photos_user_id_idx');
