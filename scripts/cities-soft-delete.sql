-- Soft delete ("Trash") for cities.
--
-- Applied to the live project on 2026-10-09. Run once, manually, in the
-- Supabase Dashboard -> SQL Editor.
--
-- deleted_at is null      -> active city (all existing rows)
-- deleted_at is not null  -> in the owner's Trash, restorable
--
-- No RLS changes: trashing/restoring is an UPDATE of this column, already
-- limited to the owner by the existing "Users can update own cities"
-- policy (auth.uid() = user_id). Permanent deletion still uses the existing
-- DELETE policies, and delete_own_account() still removes trashed cities.
--
-- Rollback (trashed cities become active again):
--   alter table public.cities drop column deleted_at;

alter table public.cities add column deleted_at timestamptz;
