// Database tests for who may delete accounts, cities and trips.
//
// Runs the real scripts in scripts/ (README "Database setup" order, then
// admin-deletion-permissions.sql) in PGlite - Postgres 16 in WebAssembly,
// in memory - on top of supabase-stub.sql, and checks the RLS policies and
// admin_delete_user() as the signed-in roles would hit them. Nothing here
// talks to a real Supabase project.
//
//   npm test   (from the repository root, after npm ci)

import { readFileSync } from "node:fs";
import { describe, test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { PGlite } from "@electric-sql/pglite";

const script = (name) => readFileSync(new URL(`../${name}`, import.meta.url), "utf8");

const SETUP = [
  "tests/supabase-stub.sql",
  "base-schema.sql",
  "add-admin-roles.sql",
  "restrict-admin-super-admin-access.sql",
  "get-admin-users-function.sql",
  "cities-soft-delete.sql",
  "delete-own-account-function.sql",
  "avatars-storage-policies.sql",
  "trips-schema.sql",
  "trip-photos-storage-policies.sql",
  "demo-account-guard.sql",
  "admin-deletion-permissions.sql",
].map(script);

// Fixed ids, readable in failures.
const id = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const SUPER = id(1);
const SUPER_2 = id(2);
const ADMIN = id(3);
const ADMIN_2 = id(4);
const USER = id(5);
const USER_2 = id(6);
const DEMO = id(7);

const CITY_USER = id(101);
const CITY_ADMIN = id(102);
const CITY_SUPER = id(103);
const CITY_USER_2 = id(104);

const TRIP_USER = id(201);
const TRIP_SUPER = id(202);
const TRIP_USER_2 = id(203);
const TRIP_ADMIN_2 = id(204);

const PHOTO_USER = id(301);
const PHOTO_SUPER = id(302);
const PHOTO_USER_2 = id(303);

const DEST_USER = id(401);

const photoPath = (owner, trip, photo) => `${owner}/${trip}/${photo}.jpg`;

let db;

async function superuser(sql, params) {
  await db.exec("reset role");
  return db.query(sql, params);
}

// Runs sql as the signed-in user `uid` (authenticated) or, with null, as an
// anonymous visitor. Returns the rows; throws Postgres errors.
async function as(uid, sql, params) {
  await db.exec("reset role");
  await db.query("select set_config('request.jwt.claim.sub', $1, false)", [uid ?? ""]);
  await db.exec(uid ? "set role authenticated" : "set role anon");
  try {
    return (await db.query(sql, params)).rows;
  } finally {
    await db.exec("reset role");
    await db.query("select set_config('request.jwt.claim.sub', '', false)");
  }
}

async function errorOf(promise) {
  try {
    await promise;
  } catch (err) {
    return err;
  }
  assert.fail("expected the statement to fail");
}

const count = async (sql, params) => Number((await superuser(sql, params)).rows[0].n);

async function seed() {
  const users = [
    [SUPER, "super_admin"],
    [SUPER_2, "super_admin"],
    [ADMIN, "admin"],
    [ADMIN_2, "admin"],
    [USER, "user"],
    [USER_2, "user"],
    [DEMO, "user"],
  ];
  for (const [uid, role] of users) {
    await superuser(
      `insert into auth.users (id, email, raw_user_meta_data) values ($1, $2, jsonb_build_object('full_name', $3::text))`,
      [uid, `${role}-${uid.slice(-2)}@example.test`, `${role} ${uid.slice(-2)}`],
    );
    await superuser("update public.profiles set role = $2 where id = $1", [uid, role]);
  }
  await superuser("insert into public.demo_accounts (user_id) values ($1)", [DEMO]);

  const city = (cid, owner, name) =>
    superuser(
      `insert into public.cities (id, user_id, city_name, country, country_code, latitude, longitude, visit_date)
       values ($1, $2, $3, 'Portugal', 'PT', 38.7, -9.1, '2026-01-01')`,
      [cid, owner, name],
    );
  await city(CITY_USER, USER, "Lisbon");
  await city(CITY_ADMIN, ADMIN, "Porto");
  await city(CITY_SUPER, SUPER, "Faro");
  await city(CITY_USER_2, USER_2, "Braga");

  const trip = (tid, owner, title) =>
    superuser(
      `insert into public.trips (id, user_id, title, start_date, end_date) values ($1, $2, $3, '2026-01-01', '2026-01-05')`,
      [tid, owner, title],
    );
  await trip(TRIP_USER, USER, "User trip");
  await trip(TRIP_SUPER, SUPER, "Super trip");
  await trip(TRIP_USER_2, USER_2, "User 2 trip");
  await trip(TRIP_ADMIN_2, ADMIN_2, "Admin 2 trip");

  await superuser(
    `insert into public.trip_destinations (id, trip_id, city_id, city_name, country, country_code, latitude, longitude, position)
     values ($1, $2, $3, 'Lisbon', 'Portugal', 'PT', 38.7, -9.1, 0)`,
    [DEST_USER, TRIP_USER, CITY_USER],
  );

  const photo = async (pid, owner, tid) => {
    const path = photoPath(owner, tid, pid);
    await superuser("insert into storage.objects (bucket_id, name, owner) values ('trip-photos', $1, $2)", [path, owner]);
    await superuser(
      `insert into public.trip_photos (id, trip_id, user_id, storage_path, content_type, size_bytes, is_cover)
       values ($1, $2, $3, $4, 'image/jpeg', 1000, true)`,
      [pid, tid, owner, path],
    );
  };
  await photo(PHOTO_USER, USER, TRIP_USER);
  await photo(PHOTO_SUPER, SUPER, TRIP_SUPER);
  await photo(PHOTO_USER_2, USER_2, TRIP_USER_2);

  // An avatar file, to show account deletion leaves Storage to the Edge Function.
  await superuser("insert into storage.objects (bucket_id, name, owner) values ('avatars', $1, $2)", [`${USER}/avatar.png`, USER]);
}

beforeEach(async () => {
  db = new PGlite();
  for (const sql of SETUP) await db.exec(sql);
  await seed();
});

describe("cities", () => {
  test("an admin deletes a user's city; the trip destination keeps its snapshot", async () => {
    const rows = await as(ADMIN, "delete from public.cities where id = $1 returning id", [CITY_USER]);
    assert.deepEqual(rows, [{ id: CITY_USER }]);

    const { rows: dest } = await superuser(
      "select city_id, city_name, country, country_code, latitude, longitude from public.trip_destinations where id = $1",
      [DEST_USER],
    );
    assert.deepEqual(dest, [
      { city_id: null, city_name: "Lisbon", country: "Portugal", country_code: "PT", latitude: 38.7, longitude: -9.1 },
    ]);
    assert.equal(await count("select count(*) n from public.trips where id = $1", [TRIP_USER]), 1);
  });

  test("an admin deletes their own city and another admin's", async () => {
    assert.equal((await as(ADMIN, "delete from public.cities where id = $1 returning id", [CITY_ADMIN])).length, 1);
    await superuser(
      `insert into public.cities (id, user_id, city_name, country, country_code, latitude, longitude, visit_date)
       values ($1, $2, 'Evora', 'Portugal', 'PT', 38.5, -7.9, '2026-01-01')`,
      [id(105), ADMIN_2],
    );
    assert.equal((await as(ADMIN, "delete from public.cities where id = $1 returning id", [id(105)])).length, 1);
  });

  test("an admin can't delete a super admin's city", async () => {
    assert.deepEqual(await as(ADMIN, "delete from public.cities where id = $1 returning id", [CITY_SUPER]), []);
    assert.equal(await count("select count(*) n from public.cities where id = $1", [CITY_SUPER]), 1);
  });

  test("a super admin deletes any city", async () => {
    assert.equal((await as(SUPER, "delete from public.cities where id = $1 returning id", [CITY_ADMIN])).length, 1);
    assert.equal((await as(SUPER, "delete from public.cities where id = $1 returning id", [CITY_USER_2])).length, 1);
  });

  test("a user deletes only their own cities", async () => {
    assert.deepEqual(await as(USER, "delete from public.cities where id = $1 returning id", [CITY_USER_2]), []);
    assert.deepEqual(await as(USER, "delete from public.cities where id = $1 returning id", [CITY_ADMIN]), []);
    assert.equal((await as(USER, "delete from public.cities where id = $1 returning id", [CITY_USER])).length, 1);
    assert.equal(await count("select count(*) n from public.cities"), 3);
  });

  test("an anonymous visitor deletes nothing", async () => {
    // cities: anon has Supabase's default table grants, but every policy is
    // for `authenticated`, so the delete matches no rows. trips: anon has
    // no grant at all (trips-schema.sql revokes it).
    assert.deepEqual(await as(null, "delete from public.cities returning id"), []);
    const err = await errorOf(as(null, "delete from public.trips returning id"));
    assert.equal(err.code, "42501");
    assert.equal(await count("select count(*) n from public.cities"), 4);
    assert.equal(await count("select count(*) n from public.trips"), 4);
  });

  test("trash and restore still work for the owner only", async () => {
    assert.equal((await as(USER, "update public.cities set deleted_at = now() where id = $1 returning id", [CITY_USER])).length, 1);
    assert.deepEqual(await as(USER_2, "update public.cities set deleted_at = null where id = $1 returning id", [CITY_USER]), []);
    assert.equal((await as(USER, "update public.cities set deleted_at = null where id = $1 returning id", [CITY_USER])).length, 1);
  });
});

describe("trips", () => {
  test("an admin can't delete a user's trip, its photo records or its photo files", async () => {
    assert.deepEqual(await as(ADMIN, "delete from public.trips where id = $1 returning id", [TRIP_USER]), []);
    assert.deepEqual(await as(ADMIN, "delete from public.trip_photos where id = $1 returning id", [PHOTO_USER]), []);
    assert.deepEqual(
      await as(ADMIN, "delete from storage.objects where bucket_id = 'trip-photos' and name = $1 returning id", [
        photoPath(USER, TRIP_USER, PHOTO_USER),
      ]),
      [],
    );
    assert.equal(await count("select count(*) n from public.trips where id = $1", [TRIP_USER]), 1);
    assert.equal(await count("select count(*) n from public.trip_photos where id = $1", [PHOTO_USER]), 1);
    assert.equal(await count("select count(*) n from storage.objects where bucket_id = 'trip-photos'"), 3);
  });

  test("an admin can't delete another admin's trip either", async () => {
    assert.deepEqual(await as(ADMIN, "delete from public.trips where id = $1 returning id", [TRIP_ADMIN_2]), []);
    assert.equal(await count("select count(*) n from public.trips where id = $1", [TRIP_ADMIN_2]), 1);
  });

  test("an admin can't delete a super admin's trip", async () => {
    assert.deepEqual(await as(ADMIN, "delete from public.trips where id = $1 returning id", [TRIP_SUPER]), []);
    assert.equal(await count("select count(*) n from public.trips where id = $1", [TRIP_SUPER]), 1);
  });

  test("an admin still views and edits a user's trip, destinations and photos", async () => {
    assert.equal((await as(ADMIN, "select id from public.trips where id = $1", [TRIP_USER])).length, 1);
    assert.equal((await as(ADMIN, "update public.trips set title = 'Renamed' where id = $1 returning id", [TRIP_USER])).length, 1);
    assert.equal(
      (await as(ADMIN, "update public.trip_photos set caption = 'Nice' where id = $1 returning id", [PHOTO_USER])).length,
      1,
    );
    await as(ADMIN, "select public.set_trip_cover($1)", [PHOTO_USER]);
    assert.equal(
      (await as(ADMIN, "select name from storage.objects where bucket_id = 'trip-photos' and name = $1", [
        photoPath(USER, TRIP_USER, PHOTO_USER),
      ])).length,
      1,
    );
    assert.equal((await as(ADMIN, "delete from public.trip_destinations where id = $1 returning id", [DEST_USER])).length, 1);
  });

  test("the owner deletes their trip: file, then photo record, then trip", async () => {
    const path = photoPath(USER, TRIP_USER, PHOTO_USER);
    // The record can't go while its file exists.
    const err = await errorOf(as(USER, "delete from public.trip_photos where id = $1", [PHOTO_USER]));
    assert.match(err.message, /Remove the photo file from Storage/);

    assert.equal(
      (await as(USER, "delete from storage.objects where bucket_id = 'trip-photos' and name = $1 returning id", [path])).length,
      1,
    );
    assert.equal((await as(USER, "delete from public.trip_photos where id = $1 returning id", [PHOTO_USER])).length, 1);
    assert.equal((await as(USER, "delete from public.trips where id = $1 returning id", [TRIP_USER])).length, 1);
    assert.equal(await count("select count(*) n from public.trip_destinations where trip_id = $1", [TRIP_USER]), 0);
  });

  test("a user can't delete someone else's trip, photo record or file", async () => {
    assert.deepEqual(await as(USER, "delete from public.trips where id = $1 returning id", [TRIP_USER_2]), []);
    assert.deepEqual(await as(USER, "delete from public.trip_photos where id = $1 returning id", [PHOTO_USER_2]), []);
    assert.deepEqual(
      await as(USER, "delete from storage.objects where bucket_id = 'trip-photos' and name = $1 returning id", [
        photoPath(USER_2, TRIP_USER_2, PHOTO_USER_2),
      ]),
      [],
    );
  });

  test("a super admin deletes any trip with its photos", async () => {
    const path = photoPath(USER_2, TRIP_USER_2, PHOTO_USER_2);
    assert.equal(
      (await as(SUPER, "delete from storage.objects where bucket_id = 'trip-photos' and name = $1 returning id", [path])).length,
      1,
    );
    assert.equal((await as(SUPER, "delete from public.trip_photos where id = $1 returning id", [PHOTO_USER_2])).length, 1);
    assert.equal((await as(SUPER, "delete from public.trips where id = $1 returning id", [TRIP_USER_2])).length, 1);
  });

  test("a super admin can't remove unrecorded files from another user's folder", async () => {
    const stray = `${USER_2}/${TRIP_USER_2}/stray.jpg`;
    await superuser("insert into storage.objects (bucket_id, name, owner) values ('trip-photos', $1, $2)", [stray, USER_2]);
    assert.deepEqual(
      await as(SUPER, "delete from storage.objects where bucket_id = 'trip-photos' and name = $1 returning id", [stray]),
      [],
    );
  });

  test("the only DELETE policies on trips, photo records and photo files are the owner/super admin ones", async () => {
    const { rows } = await superuser(
      `select policyname, qual from pg_policies
       where cmd = 'DELETE' and (tablename in ('trips', 'trip_photos') or (tablename = 'objects' and qual like '%trip-photos%'))
       order by policyname`,
    );
    assert.deepEqual(
      rows.map((row) => row.policyname),
      [
        "Owner and super admins can delete trip photos",
        "Owner and super admins can delete trips",
        "Trip photos are deletable by owner and super admins",
      ],
    );
    for (const row of rows) assert.doesNotMatch(row.qual, /'admin'|can_manage_trips_of/, row.policyname);
  });
});

const deleteUser = (caller, target, dryRun = false) =>
  as(caller, "select public.admin_delete_user($1, $2)", [target, dryRun]);

async function removeFilesAsService(owner) {
  await superuser("delete from storage.objects where bucket_id = 'trip-photos' and name like $1", [`${owner}/%`]);
}

async function accountRows(uid) {
  return {
    auth: await count("select count(*) n from auth.users where id = $1", [uid]),
    profile: await count("select count(*) n from public.profiles where id = $1", [uid]),
    cities: await count("select count(*) n from public.cities where user_id = $1", [uid]),
    trips: await count("select count(*) n from public.trips where user_id = $1", [uid]),
    photos: await count("select count(*) n from public.trip_photos where user_id = $1", [uid]),
  };
}

describe("accounts", () => {
  test("an admin deletes a user's whole account once the photo files are gone", async () => {
    await removeFilesAsService(USER);
    await deleteUser(ADMIN, USER);

    assert.deepEqual(await accountRows(USER), { auth: 0, profile: 0, cities: 0, trips: 0, photos: 0 });
    assert.equal(await count("select count(*) n from public.trip_destinations where trip_id = $1", [TRIP_USER]), 0);
    // Nobody else's data is touched.
    assert.deepEqual(await accountRows(USER_2), { auth: 1, profile: 1, cities: 1, trips: 1, photos: 1 });
    assert.deepEqual(await accountRows(SUPER), { auth: 1, profile: 1, cities: 1, trips: 1, photos: 1 });
    // Avatars are the Edge Function's job; SQL leaves Storage alone.
    assert.equal(await count("select count(*) n from storage.objects where bucket_id = 'avatars'"), 1);
  });

  test("with photo files still in Storage, nothing at all is deleted", async () => {
    const err = await errorOf(deleteUser(ADMIN, USER));
    assert.match(err.message, /Remove the photo file from Storage/);
    assert.deepEqual(await accountRows(USER), { auth: 1, profile: 1, cities: 1, trips: 1, photos: 1 });
  });

  test("a dry run checks permission and changes nothing", async () => {
    await deleteUser(ADMIN, USER, true);
    assert.deepEqual(await accountRows(USER), { auth: 1, profile: 1, cities: 1, trips: 1, photos: 1 });
  });

  test("an admin deletes another admin's account", async () => {
    await deleteUser(ADMIN, ADMIN_2);
    assert.deepEqual(await accountRows(ADMIN_2), { auth: 0, profile: 0, cities: 0, trips: 0, photos: 0 });
  });

  test("an admin can't delete a super admin; it looks like an unknown account", async () => {
    const err = await errorOf(deleteUser(ADMIN, SUPER, true));
    assert.equal(err.code, "P0002");
    const unknown = await errorOf(deleteUser(ADMIN, id(999), true));
    assert.equal(unknown.code, "P0002");
    assert.equal(err.message, unknown.message);
    await errorOf(deleteUser(ADMIN, SUPER));
    assert.deepEqual(await accountRows(SUPER), { auth: 1, profile: 1, cities: 1, trips: 1, photos: 1 });
  });

  test("nobody deletes their own account here", async () => {
    for (const caller of [ADMIN, SUPER]) {
      const err = await errorOf(deleteUser(caller, caller, true));
      assert.equal(err.code, "42501");
      assert.match(err.message, /own account/);
    }
    assert.equal(await count("select count(*) n from auth.users where id in ($1, $2)", [ADMIN, SUPER]), 2);
  });

  test("a regular user can't delete anyone", async () => {
    const err = await errorOf(deleteUser(USER, USER_2));
    assert.equal(err.code, "42501");
    assert.deepEqual(await accountRows(USER_2), { auth: 1, profile: 1, cities: 1, trips: 1, photos: 1 });
  });

  test("an anonymous visitor can't call it", async () => {
    const err = await errorOf(as(null, "select public.admin_delete_user($1)", [USER]));
    assert.match(err.message, /permission denied/);
  });

  test("a super admin deletes admins and other super admins", async () => {
    await deleteUser(SUPER, ADMIN);
    await removeFilesAsService(SUPER_2);
    await deleteUser(SUPER, SUPER_2);
    assert.equal(await count("select count(*) n from auth.users where id in ($1, $2)", [ADMIN, SUPER_2]), 0);
  });

  test("the demo account is refused before anything is removed", async () => {
    const err = await errorOf(deleteUser(SUPER, DEMO, true));
    assert.equal(err.code, "42501");
    assert.match(err.message, /demo account/);
  });

  test("a deleted user's city links in other trips can't exist (only owners link cities)", async () => {
    const err = await errorOf(
      superuser(
        `insert into public.trip_destinations (trip_id, city_id, city_name, country, country_code, latitude, longitude, position)
         values ($1, $2, 'Lisbon', 'Portugal', 'PT', 38.7, -9.1, 0)`,
        [TRIP_USER_2, CITY_USER],
      ),
    );
    assert.match(err.message, /must belong to the trip owner/);
  });

  test("profiles and auth users stay one-to-one after deletions", async () => {
    await removeFilesAsService(USER);
    await deleteUser(ADMIN, USER);
    await deleteUser(SUPER, ADMIN_2);
    assert.equal(
      await count(
        `select count(*) n from auth.users u full join public.profiles p on p.id = u.id where u.id is null or p.id is null`,
      ),
      0,
    );
  });

  test("delete_own_account() still works for the owner", async () => {
    await removeFilesAsService(USER_2);
    await as(USER_2, "select public.delete_own_account()");
    assert.deepEqual(await accountRows(USER_2), { auth: 0, profile: 0, cities: 0, trips: 0, photos: 0 });
  });
});
