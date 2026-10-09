-- Storage RLS policies for the private "avatars" bucket.
--
-- Run once, manually, in the Supabase Dashboard -> SQL Editor, after the
-- bucket has been created via scripts/setup-avatars-storage.mjs.
--
-- Each policy restricts access to objects under the authenticated user's
-- own folder, matching the path convention avatars/{user_id}/profile.{ext}.
-- (storage.foldername(name))[1] extracts the first path segment of the
-- object name, i.e. the user id folder.

create policy "Users can upload their own avatar"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'avatars'
  and (storage.foldername(name))[1] = auth.uid()::text
);

create policy "Users can view their own avatar"
on storage.objects
for select
to authenticated
using (
  bucket_id = 'avatars'
  and (storage.foldername(name))[1] = auth.uid()::text
);

create policy "Users can update their own avatar"
on storage.objects
for update
to authenticated
using (
  bucket_id = 'avatars'
  and (storage.foldername(name))[1] = auth.uid()::text
)
with check (
  bucket_id = 'avatars'
  and (storage.foldername(name))[1] = auth.uid()::text
);

create policy "Users can delete their own avatar"
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'avatars'
  and (storage.foldername(name))[1] = auth.uid()::text
);

-- Read-only access for the admin dashboard, mirroring the "Admins can view
-- all profiles" rule: super_admin can read every avatar, admin can read every
-- avatar except a super_admin's. No insert/update/delete is granted.
-- The CASE only casts the folder name to uuid when it looks like one, so a
-- malformed object name can't make the whole query error out.
create policy "Admins can view avatars"
on storage.objects
for select
to authenticated
using (
  bucket_id = 'avatars'
  and (
    public.current_user_role() = 'super_admin'
    or (
      public.current_user_role() = 'admin'
      and case
        when (storage.foldername(name))[1]
          ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
        then public.get_role_for_user(((storage.foldername(name))[1])::uuid)
      end <> 'super_admin'
    )
  )
);
