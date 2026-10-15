import supabase from "./supabaseClient";
import { uploadWithProgress } from "./uploadWithProgress";

// Private bucket; access rules in scripts/trip-photos-storage-policies.sql.
// Objects live at {owner id}/{trip id}/{photo id}.{ext} - one object per
// trip_photos row, never shared - and are only ever shown through
// short-lived signed URLs.
export const TRIP_PHOTOS_BUCKET = "trip-photos";
export const MAX_PHOTO_SIZE_BYTES = 5 * 1024 * 1024; // 5MB, as the bucket
export const MAX_PHOTOS_PER_TRIP = 50;
export const ACCEPTED_PHOTO_TYPES = "image/jpeg,image/png,image/webp";

const EXTENSION_BY_MIME_TYPE = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};
const SIGNED_URL_EXPIRES_IN_SECONDS = 60 * 60; // 1 hour
const REMOVE_BATCH_SIZE = 100;
const LIST_PAGE_SIZE = 1000;

export function validateTripPhoto(file) {
  if (!EXTENSION_BY_MIME_TYPE[file.type]) {
    return "Please choose a JPEG, PNG or WEBP image.";
  }
  if (file.size > MAX_PHOTO_SIZE_BYTES) {
    return "Photos must be 5MB or smaller.";
  }
  if (file.size === 0) return "This file is empty.";
  return null;
}

export function buildPhotoPath(userId, tripId, photoId, mimeType) {
  return `${userId}/${tripId}/${photoId}.${EXTENSION_BY_MIME_TYPE[mimeType]}`;
}

export function toDomainPhoto(row) {
  return {
    id: row.id,
    tripId: row.trip_id,
    userId: row.user_id,
    storagePath: row.storage_path,
    isCover: row.is_cover,
    caption: row.caption ?? "",
    contentType: row.content_type,
    sizeBytes: row.size_bytes,
    createdAt: row.created_at,
  };
}

const chunk = (items, size) =>
  Array.from({ length: Math.ceil(items.length / size) }, (_, i) =>
    items.slice(i * size, i * size + size),
  );

// Upload first, then record it. If recording fails the file is removed
// again, so a failed upload doesn't leave a file behind (if even that
// removal fails, the file stays in the owner's own folder, where deleting
// the trip or the account clears it).
export async function uploadTripPhoto(trip, file, { onProgress } = {}) {
  const validationError = validateTripPhoto(file);
  if (validationError) throw new Error(validationError);

  const {
    data: { session },
    error: sessionError,
  } = await supabase.auth.getSession();
  if (sessionError) throw new Error(sessionError.message);
  if (!session) throw new Error("You're signed out. Please log in again.");
  if (session.user.id !== trip.userId) {
    throw new Error("Only the trip's owner can add photos.");
  }

  const photoId = crypto.randomUUID();
  const path = buildPhotoPath(trip.userId, trip.id, photoId, file.type);

  await uploadWithProgress({
    bucket: TRIP_PHOTOS_BUCKET,
    path,
    file,
    accessToken: session.access_token,
    onProgress,
  });

  const { data, error } = await supabase
    .from("trip_photos")
    .insert({
      id: photoId,
      trip_id: trip.id,
      storage_path: path,
      content_type: file.type,
      size_bytes: file.size,
    })
    .select()
    .single();

  if (error) {
    const { error: removeError } = await supabase.storage
      .from(TRIP_PHOTOS_BUCKET)
      .remove([path]);
    if (removeError) {
      console.error("Failed to remove unrecorded upload:", removeError.message);
    }
    throw new Error("The photo was uploaded but couldn't be saved. Please try again.");
  }

  return toDomainPhoto(data);
}

// { [path]: signedUrl } for the paths the caller may read; any other path
// is simply missing, so the UI falls back per photo.
export async function getPhotoUrls(paths) {
  if (!paths.length) return {};

  const { data, error } = await supabase.storage
    .from(TRIP_PHOTOS_BUCKET)
    .createSignedUrls(paths, SIGNED_URL_EXPIRES_IN_SECONDS);

  if (error) throw new Error(error.message);

  return data.reduce((acc, item) => {
    if (!item.error && item.signedUrl) acc[item.path] = item.signedUrl;
    return acc;
  }, {});
}

export async function setTripCover(photoId) {
  const { error } = await supabase.rpc("set_trip_cover", { p_photo_id: photoId });
  if (error) throw new Error("Couldn't change the cover photo. Please try again.");
}

async function deletePhotoRecord(photoId) {
  const { data, error } = await supabase
    .from("trip_photos")
    .delete()
    .eq("id", photoId)
    .select("id");
  return !error && data.length === 1;
}

// Files first, then records. The database refuses to delete a record whose
// file still exists (trip_photos_prevent_orphan_file), so the records that
// do get deleted are exactly the photos whose files are gone - whatever
// Storage reported. Returns { deletedIds, failed: [photo, ...] }.
export async function deleteTripPhotos(photos) {
  if (!photos.length) return { deletedIds: [], failed: [] };

  for (const batch of chunk(photos.map((p) => p.storagePath), REMOVE_BATCH_SIZE)) {
    const { error } = await supabase.storage.from(TRIP_PHOTOS_BUCKET).remove(batch);
    if (error) console.error("Failed to remove trip photo files:", error.message);
  }

  // All at once when every file is gone; if any file remains the trigger
  // aborts the whole statement, so retry one by one to keep the rest.
  const { data, error } = await supabase
    .from("trip_photos")
    .delete()
    .in("id", photos.map((p) => p.id))
    .select("id");

  let deletedIds;
  if (!error) {
    deletedIds = data.map((row) => row.id);
  } else {
    const results = await Promise.all(photos.map((p) => deletePhotoRecord(p.id)));
    deletedIds = photos.filter((_, i) => results[i]).map((p) => p.id);
  }

  const deleted = new Set(deletedIds);
  return { deletedIds, failed: photos.filter((p) => !deleted.has(p.id)) };
}

export async function deleteTripPhoto(photo) {
  const { failed } = await deleteTripPhotos([photo]);
  if (failed.length) {
    throw new Error("Couldn't delete this photo. Please try again.");
  }
}

// Paths of every file under a folder of the caller's own (Storage lists
// one level at a time; folders come back with id null).
async function listFiles(prefix) {
  const paths = [];
  for (let offset = 0; ; offset += LIST_PAGE_SIZE) {
    const { data, error } = await supabase.storage
      .from(TRIP_PHOTOS_BUCKET)
      .list(prefix, { limit: LIST_PAGE_SIZE, offset });
    if (error) throw new Error(error.message);

    for (const entry of data) {
      const path = `${prefix}/${entry.name}`;
      if (entry.id) paths.push(path);
      else paths.push(...(await listFiles(path)));
    }
    if (data.length < LIST_PAGE_SIZE) return paths;
  }
}

async function removeFiles(paths) {
  for (const batch of chunk(paths, REMOVE_BATCH_SIZE)) {
    const { error } = await supabase.storage.from(TRIP_PHOTOS_BUCKET).remove(batch);
    if (error) throw new Error(error.message);
  }
}

// Owner only: clears files left in a trip's folder without a record (a
// failed upload whose clean-up also failed). Best effort - the caller is
// about to delete the trip.
export async function removeLeftoverTripFiles(userId, tripId) {
  try {
    await removeFiles(await listFiles(`${userId}/${tripId}`));
  } catch (error) {
    console.error("Failed to clear leftover trip files:", error.message);
  }
}

// Account deletion: removes every file in the user's own folder and
// confirms none remain. Throws if anything is left, so the account (and
// the photo records) are never deleted while files remain.
export async function removeAllMyTripFiles(userId) {
  await removeFiles(await listFiles(userId));

  const remaining = await listFiles(userId);
  if (remaining.length) {
    throw new Error(
      `${remaining.length} trip photo(s) couldn't be removed, so your account wasn't deleted. Please try again.`,
    );
  }
}
