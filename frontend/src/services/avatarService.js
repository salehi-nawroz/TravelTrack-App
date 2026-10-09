import supabase from "./supabaseClient";

const BUCKET = "avatars";
const MAX_FILE_SIZE_BYTES = 2 * 1024 * 1024; // 2MB
const EXTENSION_BY_MIME_TYPE = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
};
const SIGNED_URL_EXPIRES_IN_SECONDS = 60 * 60; // 1 hour

export function validateAvatarFile(file) {
  if (!EXTENSION_BY_MIME_TYPE[file.type]) {
    return "Please choose a PNG, JPEG, or WEBP image.";
  }
  if (file.size > MAX_FILE_SIZE_BYTES) {
    return "Image must be smaller than 2MB.";
  }
  return null;
}

async function getCurrentUserId() {
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error) throw new Error(error.message);
  if (!user) throw new Error("User is not authenticated.");

  return user.id;
}

export async function uploadAvatar(file) {
  const validationError = validateAvatarFile(file);
  if (validationError) throw new Error(validationError);

  const userId = await getCurrentUserId();
  const extension = EXTENSION_BY_MIME_TYPE[file.type];
  const path = `${userId}/profile.${extension}`;

  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(path, file, { upsert: true, contentType: file.type });

  if (error) throw new Error(error.message);

  return path;
}

export async function removeAvatar(path) {
  if (!path) return;

  const { error } = await supabase.storage.from(BUCKET).remove([path]);
  if (error) throw new Error(error.message);
}

export async function getAvatarSignedUrl(path) {
  if (!path) return null;

  const { data, error } = await supabase.storage
    .from(BUCKET)
    .createSignedUrl(path, SIGNED_URL_EXPIRES_IN_SECONDS);

  if (error) throw new Error(error.message);

  return data.signedUrl;
}

// Batch version for lists: one request for many paths. Returns
// { [path]: signedUrl } - paths the caller isn't allowed to read (or that
// no longer exist) are simply left out, so the UI falls back per item.
export async function getAvatarSignedUrls(paths) {
  if (!paths.length) return {};

  const { data, error } = await supabase.storage
    .from(BUCKET)
    .createSignedUrls(paths, SIGNED_URL_EXPIRES_IN_SECONDS);

  if (error) throw new Error(error.message);

  return data.reduce((acc, item) => {
    if (!item.error && item.signedUrl) acc[item.path] = item.signedUrl;
    return acc;
  }, {});
}
