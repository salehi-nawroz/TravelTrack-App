// One-off setup: create the private "trip-photos" Storage bucket used for
// TravelTrack trip photos. Same local-only, dependency-free, service-role
// pattern as setup-avatars-storage.mjs.
//
// Requires scripts/.env (gitignored, never committed) via Node's built-in
// --env-file flag:
//   SUPABASE_URL               - bare project URL, e.g. https://xxxx.supabase.co
//   SUPABASE_SERVICE_ROLE_KEY  - service_role key (trusted, local-only, never shipped to the browser)
//
// Run with:
//   node --env-file=scripts/.env scripts/setup-trip-photos-storage.mjs
//
// When: after scripts/trips-schema.sql and before
// scripts/trip-photos-storage-policies.sql (see trips-schema.sql for the
// full order).
//
// What it will and won't do:
//   - creates the bucket only if no "trip-photos" bucket exists, always
//     with public: false;
//   - never updates an existing bucket: it only reads it, fails if it is
//     public, and prints a warning for any other setting that differs from
//     the values below (fix those in the Dashboard if needed);
//   - re-reads the bucket after creating it and fails unless it is private;
//   - fails if object versioning is enabled on the bucket: a deleted file
//     would leave a version row behind, and the database's orphan-file
//     check (trips-schema.sql) would then refuse to delete its record;
//   - does NOT create Storage RLS policies - those are plain SQL.
// Safe to re-run.

const BUCKET_ID = "trip-photos";
const FILE_SIZE_LIMIT_BYTES = 5 * 1024 * 1024; // 5MB
const ALLOWED_MIME_TYPES = ["image/jpeg", "image/png", "image/webp"];

function requireEnv(name) {
  const value = process.env[name];
  if (!value) {
    console.error(`Missing required environment variable: ${name}`);
    console.error("See scripts/.env.example for the expected variables.");
    process.exit(1);
  }
  return value;
}

// Guards against pasting the URL with a trailing /storage/v1.
function normalizeBaseUrl(rawUrl) {
  return rawUrl.trim().replace(/\/storage\/v1\/?$/, "").replace(/\/+$/, "");
}

// Returns the bucket, or null if it doesn't exist.
async function getBucket(baseUrl, serviceRoleKey) {
  const response = await fetch(`${baseUrl}/storage/v1/bucket/${BUCKET_ID}`, {
    method: "GET",
    headers: {
      apikey: serviceRoleKey,
      Authorization: `Bearer ${serviceRoleKey}`,
    },
  });

  if (response.status === 200) return response.json();
  if (response.status === 404) return null;

  const bodyText = await response.text();

  // Supabase Storage answers a missing bucket with HTTP 400 and the real
  // "not found" signal in the JSON body (see setup-avatars-storage.mjs).
  if (response.status === 400) {
    let body;
    try {
      body = JSON.parse(bodyText);
    } catch {
      body = null;
    }

    if (body?.code === "NoSuchBucket" || body?.statusCode === "404") {
      return null;
    }
  }

  throw new Error(`Failed to check bucket: ${response.status} ${bodyText}`);
}

// POST only creates: if a bucket with this id appeared in the meantime,
// Storage rejects the request instead of changing it.
async function createBucket(baseUrl, serviceRoleKey) {
  const response = await fetch(`${baseUrl}/storage/v1/bucket`, {
    method: "POST",
    headers: {
      apikey: serviceRoleKey,
      Authorization: `Bearer ${serviceRoleKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      id: BUCKET_ID,
      name: BUCKET_ID,
      public: false,
      file_size_limit: FILE_SIZE_LIMIT_BYTES,
      allowed_mime_types: ALLOWED_MIME_TYPES,
    }),
  });

  if (!response.ok) {
    throw new Error(
      `Failed to create bucket: ${response.status} ${await response.text()}`,
    );
  }
}

function assertPrivate(bucket) {
  if (bucket.public !== false) {
    throw new Error(
      `Bucket "${BUCKET_ID}" is PUBLIC. Make it private in the Dashboard before using it for trip photos.`,
    );
  }
}

// The API may not report versioning; the SQL check in the setup steps
// (storage.buckets.versioning_status) confirms it either way.
function assertNotVersioned(bucket) {
  const versioning = bucket.versioning_status ?? bucket.versioningStatus;
  if (versioning === undefined) {
    console.warn("Note: the API didn't report versioning; confirm it is DISABLED with the SQL check.");
  } else if (String(versioning).toUpperCase() !== "DISABLED") {
    throw new Error(
      `Bucket "${BUCKET_ID}" has versioning "${versioning}". Trip photos need it DISABLED.`,
    );
  }
}

function warnOnDifferences(bucket) {
  if (Number(bucket.file_size_limit) !== FILE_SIZE_LIMIT_BYTES) {
    console.warn(
      `Warning: file_size_limit is ${bucket.file_size_limit}, expected ${FILE_SIZE_LIMIT_BYTES}. Not changed.`,
    );
  }

  const actualTypes = [...(bucket.allowed_mime_types ?? [])].sort().join(",");
  const expectedTypes = [...ALLOWED_MIME_TYPES].sort().join(",");
  if (actualTypes !== expectedTypes) {
    console.warn(
      `Warning: allowed_mime_types is [${actualTypes || "any"}], expected [${expectedTypes}]. Not changed.`,
    );
  }
}

async function main() {
  const rawUrl = requireEnv("SUPABASE_URL");
  const serviceRoleKey = requireEnv("SUPABASE_SERVICE_ROLE_KEY");
  const baseUrl = normalizeBaseUrl(rawUrl);

  const existing = await getBucket(baseUrl, serviceRoleKey);

  if (existing) {
    assertPrivate(existing);
    assertNotVersioned(existing);
    warnOnDifferences(existing);
    console.log(`Bucket "${BUCKET_ID}" already exists (private). Nothing changed.`);
    return;
  }

  await createBucket(baseUrl, serviceRoleKey);

  const created = await getBucket(baseUrl, serviceRoleKey);
  if (!created) throw new Error(`Bucket "${BUCKET_ID}" was not found after creating it.`);
  assertPrivate(created);
  assertNotVersioned(created);
  warnOnDifferences(created);

  console.log(`Created private bucket "${BUCKET_ID}".`);
  console.log(
    "Next: run scripts/trip-photos-storage-policies.sql once in the Supabase SQL Editor to set up access policies.",
  );
}

main().catch((error) => {
  console.error("Setup failed:", error.message);
  process.exit(1);
});
