// admin-delete-user: an admin or super admin deletes another user's account.
// Plain JavaScript with its dependencies passed in, so the same code runs in
// the Edge Function (index.ts, Deno) and in the Node tests next to it.
//
//   POST { "userId": "<uuid>" }   Authorization: Bearer <caller's access token>
//   200  { "deleted": true, "userId": "...", "warnings": [] }
//   4xx/5xx { "error": "<message for the admin>" }
//
// Who may delete whom is decided in the database, by
// public.admin_delete_user() (scripts/admin-deletion-permissions.sql), called
// with the CALLER's token so it checks the caller's role in public.profiles.
// The service role is used only for Storage, which SQL can't change:
//   1. admin_delete_user(dry_run) - permission checks only, nothing changes;
//   2. remove the user's trip photo files and confirm none remain (the
//      database refuses to drop photo records while their files exist);
//   3. admin_delete_user() - every row and the auth user, in ONE transaction;
//   4. remove the user's avatar files (best effort: the account is gone).
// Steps 2 and 3 are separate requests and can't be atomic together: if 3
// fails after 2, the response says the photo files are already gone.
//
// Never logs or returns the caller's token or the service-role key.

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const TRIP_PHOTOS_BUCKET = "trip-photos";
const AVATARS_BUCKET = "avatars";
const LIST_PAGE_SIZE = 1000;
const REMOVE_BATCH_SIZE = 100;

export const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

// Error codes raised on purpose by admin_delete_user(); their messages are
// written for the admin. Anything else is reported generically.
const STATUS_BY_CODE = {
  28000: 401,
  42501: 403,
  P0002: 404,
  22004: 400,
};

function json(status, body) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
  });
}

function rpcFailure(error, log) {
  const status = STATUS_BY_CODE[error.code];
  if (status) return { status, message: error.message };
  log.error(`admin-delete-user: admin_delete_user failed (${error.code ?? "no code"}): ${error.message}`);
  return { status: 500, message: "Couldn't delete this account." };
}

function chunk(items, size) {
  const batches = [];
  for (let i = 0; i < items.length; i += size) batches.push(items.slice(i, i + size));
  return batches;
}

// Paths of every file under prefix (Storage lists one level at a time;
// folders come back with id null).
async function listFiles(storage, bucket, prefix) {
  const paths = [];
  for (let offset = 0; ; offset += LIST_PAGE_SIZE) {
    const { data, error } = await storage.from(bucket).list(prefix, { limit: LIST_PAGE_SIZE, offset });
    if (error) throw new Error(error.message);

    for (const entry of data) {
      const path = `${prefix}/${entry.name}`;
      if (entry.id) paths.push(path);
      else paths.push(...(await listFiles(storage, bucket, path)));
    }
    if (data.length < LIST_PAGE_SIZE) return paths;
  }
}

async function removeFiles(storage, bucket, paths) {
  for (const batch of chunk(paths, REMOVE_BATCH_SIZE)) {
    const { error } = await storage.from(bucket).remove(batch);
    if (error) throw new Error(error.message);
  }
}

export async function handleRequest(request, { env, createClient, log = console }) {
  if (request.method === "OPTIONS") return new Response("ok", { headers: CORS_HEADERS });
  if (request.method !== "POST") return json(405, { error: "Method not allowed." });

  const { SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY } = env;
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY || !SUPABASE_SERVICE_ROLE_KEY) {
    log.error("admin-delete-user: SUPABASE_URL, SUPABASE_ANON_KEY or SUPABASE_SERVICE_ROLE_KEY is not set.");
    return json(500, { error: "Account deletion isn't configured on the server." });
  }

  const token = (request.headers.get("Authorization") ?? "").match(/^Bearer\s+(\S+)$/i)?.[1];
  if (!token) return json(401, { error: "Please sign in again." });

  let userId;
  try {
    userId = (await request.json())?.userId;
  } catch {
    userId = undefined;
  }
  if (typeof userId !== "string" || !UUID.test(userId)) {
    return json(400, { error: "A valid user id is required." });
  }

  const clientOptions = { auth: { persistSession: false, autoRefreshToken: false } };
  const asCaller = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    ...clientOptions,
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
  const service = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, clientOptions);

  const { data: caller, error: callerError } = await asCaller.auth.getUser(token);
  if (callerError || !caller?.user) return json(401, { error: "Your session has expired. Please sign in again." });

  // 1. Permission checks only.
  const check = await asCaller.rpc("admin_delete_user", { target_user_id: userId, p_dry_run: true });
  if (check.error) {
    const failure = rpcFailure(check.error, log);
    return json(failure.status, { error: failure.message });
  }

  // 2. Trip photo files.
  let removedPhotoFiles = 0;
  try {
    const files = await listFiles(service.storage, TRIP_PHOTOS_BUCKET, userId);
    await removeFiles(service.storage, TRIP_PHOTOS_BUCKET, files);
    removedPhotoFiles = files.length;

    const remaining = await listFiles(service.storage, TRIP_PHOTOS_BUCKET, userId);
    if (remaining.length) {
      return json(500, {
        error: `${remaining.length} trip photo file(s) couldn't be removed, so the account wasn't deleted. Please try again.`,
      });
    }
  } catch (err) {
    log.error(`admin-delete-user: removing trip photo files failed: ${err.message}`);
    return json(500, {
      error:
        "This user's trip photos couldn't all be removed, so the account wasn't deleted. Some photos may already be gone. Please try again.",
    });
  }

  // 3. Every row and the auth user, in one transaction.
  const result = await asCaller.rpc("admin_delete_user", { target_user_id: userId, p_dry_run: false });
  if (result.error) {
    const failure = rpcFailure(result.error, log);
    const filesNote = removedPhotoFiles
      ? ` Its ${removedPhotoFiles} trip photo file(s) were already removed.`
      : "";
    return json(failure.status, { error: `The account wasn't deleted: ${failure.message}${filesNote}` });
  }

  // 4. Avatar files.
  const warnings = [];
  try {
    await removeFiles(service.storage, AVATARS_BUCKET, await listFiles(service.storage, AVATARS_BUCKET, userId));
  } catch (err) {
    log.error(`admin-delete-user: removing avatar files failed: ${err.message}`);
    warnings.push("The account was deleted, but its profile picture file couldn't be removed.");
  }

  return json(200, { deleted: true, userId, warnings });
}
