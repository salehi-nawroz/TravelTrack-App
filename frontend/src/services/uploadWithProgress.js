// Uploads one file to Supabase Storage with byte-level progress, which
// supabase-js's own upload() doesn't report. Same endpoint and headers as
// supabase-js, signed in as the user (their access token), so the bucket's
// Storage RLS policies apply exactly as they would to any other upload.
// x-upsert is false: an existing object is never overwritten.

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

const encodePath = (path) => path.split("/").map(encodeURIComponent).join("/");

function storageErrorMessage(status, responseText) {
  let message = "";
  try {
    message = JSON.parse(responseText)?.message ?? "";
  } catch {
    // Not JSON - fall through to the status-based messages.
  }

  if (status === 413 || /exceeded the maximum allowed size/i.test(message))
    return "This photo is too large. Photos must be 5MB or smaller.";
  if (status === 415 || /mime type/i.test(message))
    return "This file type isn't supported. Use JPEG, PNG or WEBP.";
  if (status === 401 || status === 403 || /row-level security/i.test(message))
    return "You don't have permission to add photos to this trip.";
  if (status === 409) return "A photo with this name already exists.";
  return "The photo couldn't be uploaded. Please try again.";
}

//   onProgress: called with 0-100 as the upload advances.
export function uploadWithProgress({ bucket, path, file, accessToken, onProgress }) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open(
      "POST",
      `${SUPABASE_URL}/storage/v1/object/${bucket}/${encodePath(path)}`,
    );
    xhr.setRequestHeader("Authorization", `Bearer ${accessToken}`);
    xhr.setRequestHeader("apikey", SUPABASE_ANON_KEY);
    xhr.setRequestHeader("x-upsert", "false");
    xhr.setRequestHeader("cache-control", "max-age=3600");
    xhr.setRequestHeader("Content-Type", file.type);

    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgress?.(Math.round((e.loaded / e.total) * 100));
    };

    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        onProgress?.(100);
        resolve();
      } else {
        reject(new Error(storageErrorMessage(xhr.status, xhr.responseText)));
      }
    };

    xhr.onerror = () =>
      reject(
        new Error("Network error while uploading. Check your connection and try again."),
      );

    xhr.send(file);
  });
}
