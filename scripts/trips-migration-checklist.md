# Trip Tracking: live migration checklist

Apply manually, in order. Every step says what to expect; stop at the first
surprise. Steps 1–6 change the live project. Steps 0 and 7 are read-only.

Local verification done beforehand (PostgreSQL 17 via PGlite, fake Storage
API): schema, policies, rollback and the bucket script behave as intended.
That does **not** prove every live Supabase Storage API behaviour (uploads,
`remove()`, signed URLs, size/type limits, error responses); those are covered
by the live checks after the migration, with separate approval.

## 0. Before you start (read-only)

- [ ] `frontend/.env.local` does **not** set `VITE_TRIPS_ENABLED` (the app keeps
      the old Trips page until step 8).
- [ ] Nothing named `trips`, `trip_destinations`, `trip_photos` exists yet:
      ```sql
      select to_regclass('public.trips'), to_regclass('public.trip_destinations'),
             to_regclass('public.trip_photos'),
             (select count(*) from storage.buckets where id = 'trip-photos') as bucket;
      ```
      Expect `null, null, null, 0`.
- [ ] `scripts/.env` exists with `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`
      (same file the avatars script uses; never commit it).

## 1. Backup

- [ ] Dashboard → Database → Backups: confirm a recent backup exists (or note
      that your plan has none).
- [ ] If there's no usable backup, export one first (needs the Postgres client
      tools and the connection string from Dashboard → Connect):
      `pg_dump "<connection string>" --schema=public --file=traveltrack-before-trips.sql`

Recovery notes: the migration only **adds** objects, except that it
replaces `public.delete_own_account()`. `trips-rollback.sql` restores the
original function and removes everything the migration added, so a backup is
for the unexpected, not the normal undo path. Existing cities, profiles and
avatars are never modified.

## 2. Schema

- [ ] Dashboard → SQL Editor → paste **all** of `scripts/trips-schema.sql` → Run.
- [ ] Expect "Success. No rows returned". It runs in one transaction: on any
      error nothing is applied; fix the cause and run it again.

## 3. Storage bucket

From the repository root:

```sh
node --env-file=scripts/.env scripts/setup-trip-photos-storage.mjs
```

- [ ] Expect `Created private bucket "trip-photos".` (or "already exists
      (private). Nothing changed.").
- [ ] The script stops with an error if the bucket is public or versioned; it
      never changes an existing bucket. Fix it in the Dashboard if that
      happens, then re-run.

## 4. Bucket check (read-only)

```sql
select id, public, file_size_limit, allowed_mime_types, versioning_status
from storage.buckets where id = 'trip-photos';
```

- [ ] `public = false`
- [ ] `versioning_status = DISABLED` (required: with versioning, a deleted
      file leaves a version row and the photo record could never be deleted)
- [ ] `file_size_limit = 5242880`, `allowed_mime_types = {image/jpeg,image/png,image/webp}`

## 5. Storage policies

- [ ] SQL Editor → run `scripts/trip-photos-storage-policies.sql`.
- [ ] Expect success. Safe to re-run.

## 6. Verify (read-only)

- [ ] Run each query in `scripts/trips-verify.sql` and compare with its
      "Expect" comment. Key points:
  - RLS enabled on all three tables; 12 table policies; 3 storage policies
    (INSERT/SELECT/DELETE), no UPDATE policy.
  - `anon` has no table privileges; `authenticated` has table-level SELECT and
    DELETE only, plus the listed column-level INSERT/UPDATE; never `user_id`,
    `status` or timestamps.
  - `trip_photos.trip_id` is NO ACTION (`a`); the other trip foreign keys are
    as listed.
  - No trip function is executable by PUBLIC or `anon`; `delete_own_account`
    still lists `authenticated` and `service_role`.
  - `delete_own_account` removes photos and trips first and still checks the
    signed-in user.
  - Bucket: private, versioning DISABLED.
  - Counts all 0; `records_without_file` and `files_without_record` both 0.

## 7. Tell Claude it's applied

Claude then re-runs the same read-only checks. It writes nothing.

## 8. Live testing (separate approval)

Only after approval: set `VITE_TRIPS_ENABLED=true` in `frontend/.env.local`
and test with test accounts (user, admin, super_admin): start/end trips,
destinations, real photo uploads and progress, signed URLs, cover, photo and
trip deletion (then `trips-verify.sql` query 12 must still show 0/0),
admin/super_admin boundaries, and account deletion of a test user with photos.
This creates real data.

## Account deletion and photo cleanup: what to expect live

- Deleting a trip removes its photo files first, then the photo records, then
  the trip; destinations go with the trip. If any file can't be removed, the
  trip and the remaining photos stay, and the app says so.
- Deleting your account (Profile) removes your trip photo files first and stops
  if any remain; `delete_own_account()` itself also refuses while files exist.
- Deleting a user from the Supabase **Auth dashboard** fails while they still
  have trip photo files. That's intentional. Remove their files in Storage
  first.

## Rollback

Prerequisites, in this order:
1. `VITE_TRIPS_ENABLED` off (removed) and the frontend redeployed, so nothing
   uses the trip tables.
2. Every object in the `trip-photos` bucket removed (Dashboard → Storage, or
   the Storage API). The rollback refuses to run otherwise.

Then:
- [ ] SQL Editor → run `scripts/trips-rollback.sql` (one transaction; safe to
      re-run).
- [ ] Optional: delete the now-empty `trip-photos` bucket in the Dashboard.

Consequences: **all trip data is permanently deleted** (trips, destinations,
photo records; files were removed in prerequisite 2). `delete_own_account()`
returns to its original version. Cities, profiles, avatars and existing
policies are untouched.
