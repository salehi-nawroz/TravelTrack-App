-- Narrowly-scoped RPC for the Admin -> Users management UI (Feature 9A).
--
-- Run once, manually, in the Supabase Dashboard -> SQL Editor.
--
-- The browser's anon/authenticated Supabase client can never query
-- auth.users directly (no grant exists, and none should ever be added) -
-- email only lives there, never on public.profiles. This function is the
-- one controlled, read-only bridge: it runs SECURITY DEFINER so its
-- internal join to auth.users bypasses RLS, the same way
-- current_user_role() / get_role_for_user() / delete_own_account() already
-- do, but the WHERE clause re-implements the exact same visibility rule as
-- the existing "Admins can view all profiles" RLS policy (admin sees
-- everyone except super_admin; super_admin sees everyone; anyone else gets
-- zero rows). Nothing is exposed here beyond what that policy already
-- allows for profiles/role, plus the one additional field (email) this
-- function exists specifically to surface safely.
--
-- This does not grant, widen, or touch role-management permissions in any
-- way: profiles.role remains excluded from the UPDATE grant exactly as
-- before (see add-admin-roles.sql, section 3), and this function is
-- read-only - there is no UPDATE/DELETE/INSERT anywhere in its body.

create or replace function public.get_admin_users()
returns table (
  id uuid,
  full_name text,
  avatar_path text,
  role text,
  created_at timestamptz,
  email text
)
language sql
security definer
stable
set search_path = ''
as $$
  select
    p.id,
    p.full_name,
    p.avatar_path,
    p.role,
    p.created_at,
    u.email
  from public.profiles p
  join auth.users u on u.id = p.id
  where
    public.current_user_role() = 'super_admin'
    or (public.current_user_role() = 'admin' and p.role <> 'super_admin');
$$;

-- Postgres grants EXECUTE to PUBLIC by default on function creation; close
-- that immediately, then grant only to the authenticated role - same
-- pattern as every other SECURITY DEFINER function in this project.
revoke execute on function public.get_admin_users() from public;
revoke execute on function public.get_admin_users() from anon;
grant execute on function public.get_admin_users() to authenticated;
