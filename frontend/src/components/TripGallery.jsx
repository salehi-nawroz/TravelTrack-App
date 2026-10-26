import { useEffect, useId, useRef, useState } from "react";
import Button from "./Button";
import ConfirmDialog from "./ConfirmDialog";
import EmptyState from "./EmptyState";
import { FormMessage } from "./Field";
import PhotoLightbox from "./PhotoLightbox";
import { useTripPhotoUrls } from "../hooks/useTripPhotoUrls";
import {
  ACCEPTED_PHOTO_TYPES,
  MAX_PHOTOS_PER_TRIP,
  deleteTripPhoto,
  setTripCover,
  uploadTripPhoto,
  validateTripPhoto,
} from "../services/tripPhotoService";
import styles from "./TripGallery.module.css";

const formatSize = (bytes) =>
  bytes >= 1024 * 1024
    ? `${(bytes / (1024 * 1024)).toFixed(1)} MB`
    : `${Math.max(1, Math.round(bytes / 1024))} KB`;

let queueKey = 0;

// A trip's photos: grid, lightbox, cover choice and delete, plus (for the
// owner) an upload queue with previews, per-file progress and errors.
//   canUpload:    the trip's owner (the storage policy only lets them)
//   canManage:    owner or permitted admin: set cover
//   canDelete:    owner or super admin: delete (a plain admin can't)
//   onTripChange: receives the trip with its updated photos
function TripGallery({ trip, canUpload, canManage, canDelete = false, onTripChange }) {
  const titleId = useId();
  const fileInputRef = useRef(null);

  const photos = trip.photos;
  const { urls, error: urlsError } = useTripPhotoUrls(photos.map((p) => p.storagePath));

  // [{ key, file, preview, status: "ready"|"uploading"|"done"|"error", progress, error }]
  const [queue, setQueue] = useState([]);
  const [isUploading, setIsUploading] = useState(false);
  const [lightboxIndex, setLightboxIndex] = useState(null);
  const [pendingDelete, setPendingDelete] = useState(null);
  const [busyId, setBusyId] = useState(null);
  const [error, setError] = useState("");
  const [announcement, setAnnouncement] = useState("");

  // Latest trip for the sequential upload loop, which outlives renders.
  const tripRef = useRef(trip);
  tripRef.current = trip;

  // Free preview object URLs when items leave the queue or on unmount.
  const previewsRef = useRef([]);
  previewsRef.current = queue.map((item) => item.preview);
  useEffect(() => () => previewsRef.current.forEach((url) => URL.revokeObjectURL(url)), []);

  const remainingSlots = MAX_PHOTOS_PER_TRIP - photos.length;
  const readyItems = queue.filter((item) => item.status === "ready");

  function updateItem(key, changes) {
    setQueue((current) => current.map((item) => (item.key === key ? { ...item, ...changes } : item)));
  }

  function removeItem(key) {
    setQueue((current) => {
      const item = current.find((i) => i.key === key);
      if (item) URL.revokeObjectURL(item.preview);
      return current.filter((i) => i.key !== key);
    });
  }

  function handleFilesChosen(e) {
    const files = [...(e.target.files ?? [])];
    e.target.value = ""; // choosing the same file again still fires change

    let slots = remainingSlots - queue.filter((i) => i.status !== "error").length;
    const items = files.map((file) => {
      let validationError = validateTripPhoto(file);
      if (!validationError && slots <= 0) {
        validationError = `A trip can have up to ${MAX_PHOTOS_PER_TRIP} photos.`;
      }
      if (!validationError) slots -= 1;
      return {
        key: ++queueKey,
        file,
        preview: URL.createObjectURL(file),
        status: validationError ? "error" : "ready",
        progress: 0,
        error: validationError ?? "",
      };
    });
    setQueue((current) => [...current, ...items]);
  }

  // One at a time: clearer progress, and a failure only affects its file.
  async function handleUpload() {
    if (isUploading || !readyItems.length) return;
    setIsUploading(true);
    setError("");

    // Photos added in this run, re-applied on top of the latest trip each
    // time in case the parent hasn't re-rendered between two uploads.
    const added = [];
    let uploaded = 0;
    for (const item of readyItems) {
      updateItem(item.key, { status: "uploading", progress: 0 });
      try {
        const photo = await uploadTripPhoto(tripRef.current, item.file, {
          onProgress: (progress) => updateItem(item.key, { progress }),
        });
        added.push(photo);
        const current = tripRef.current;
        const addedIds = new Set(added.map((p) => p.id));
        onTripChange({
          ...current,
          photos: [...current.photos.filter((p) => !addedIds.has(p.id)), ...added],
        });
        removeItem(item.key);
        uploaded += 1;
      } catch (err) {
        updateItem(item.key, { status: "error", error: err.message });
      }
    }

    const failed = readyItems.length - uploaded;
    setAnnouncement(
      failed
        ? `${uploaded} uploaded, ${failed} failed. Check the list for details.`
        : `${uploaded} ${uploaded === 1 ? "photo" : "photos"} uploaded.`,
    );
    setIsUploading(false);
  }

  function retryItem(key) {
    updateItem(key, { status: "ready", error: "", progress: 0 });
  }

  async function handleSetCover(photo) {
    setBusyId(photo.id);
    setError("");
    try {
      await setTripCover(photo.id);
      onTripChange({
        ...trip,
        photos: photos.map((p) => ({ ...p, isCover: p.id === photo.id })),
      });
      setAnnouncement("Cover photo updated.");
    } catch (err) {
      setError(err.message);
    } finally {
      setBusyId(null);
    }
  }

  async function handleConfirmDelete() {
    const photo = pendingDelete;
    setPendingDelete(null);
    setBusyId(photo.id);
    setError("");
    try {
      await deleteTripPhoto(photo);
      onTripChange({ ...trip, photos: photos.filter((p) => p.id !== photo.id) });
      setLightboxIndex(null);
      setAnnouncement("Photo deleted.");
    } catch (err) {
      setError(err.message);
    } finally {
      setBusyId(null);
    }
  }

  return (
    <section className={styles.gallery} aria-labelledby={titleId}>
      <div className={styles.header}>
        <h3 id={titleId} className={styles.title}>
          Photos
          <span className={styles.count}>{photos.length}</span>
        </h3>

        {canUpload && remainingSlots > 0 && (
          <>
            <input
              ref={fileInputRef}
              tabIndex={-1}
              aria-hidden="true"
              type="file"
              accept={ACCEPTED_PHOTO_TYPES}
              multiple
              className={styles.hiddenInput}
              onChange={handleFilesChosen}
              disabled={isUploading}
            />
            <Button
              variant="outline"
              size="sm"
              htmlType="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={isUploading}
            >
              + Add photos
            </Button>
          </>
        )}
      </div>

      {error && <FormMessage>{error}</FormMessage>}
      {urlsError && <FormMessage>{urlsError}</FormMessage>}
      <p className={styles.srOnly} role="status">
        {announcement}
      </p>

      {queue.length > 0 && (
        <div className={styles.queue}>
          <ul className={styles.queueList} aria-label="Photos to upload">
            {queue.map((item) => (
              <li key={item.key} className={styles.queueItem}>
                <img src={item.preview} alt="" className={styles.queueThumb} />
                <div className={styles.queueInfo}>
                  <span className={styles.queueName}>{item.file.name}</span>
                  <span className={styles.queueMeta}>{formatSize(item.file.size)}</span>
                  {item.status === "uploading" && (
                    <progress
                      className={styles.progress}
                      max={100}
                      value={item.progress}
                      aria-label={`Uploading ${item.file.name}`}
                    >
                      {item.progress}%
                    </progress>
                  )}
                  {item.status === "error" && (
                    <span className={styles.queueError} role="alert">
                      {item.error}
                    </span>
                  )}
                </div>
                {item.status !== "uploading" && (
                  <div className={styles.queueActions}>
                    {item.status === "error" && validateTripPhoto(item.file) === null && (
                      <Button variant="ghost" size="sm" htmlType="button" onClick={() => retryItem(item.key)} disabled={isUploading}>
                        Retry
                      </Button>
                    )}
                    <Button
                      variant="ghost"
                      size="sm"
                      htmlType="button"
                      onClick={() => removeItem(item.key)}
                      disabled={isUploading}
                      aria-label={`Remove ${item.file.name} from the upload list`}
                    >
                      Remove
                    </Button>
                  </div>
                )}
              </li>
            ))}
          </ul>

          <div className={styles.queueFooter}>
            <span className={styles.queueMeta}>JPEG, PNG or WEBP, up to 5MB each.</span>
            <Button
              variant="primary"
              size="sm"
              htmlType="button"
              onClick={handleUpload}
              disabled={isUploading || !readyItems.length}
            >
              {isUploading
                ? "Uploading…"
                : readyItems.length
                  ? `Upload ${readyItems.length} ${readyItems.length === 1 ? "photo" : "photos"}`
                  : "Upload photos"}
            </Button>
          </div>
        </div>
      )}

      {!photos.length ? (
        <EmptyState
          compact
          icon="trips"
          title="No photos yet"
          message={canUpload ? "Add photos to keep the memories of this trip together." : undefined}
        />
      ) : (
        <ul className={styles.grid}>
          {photos.map((photo, index) => {
            const url = urls[photo.storagePath];
            const isBusy = busyId === photo.id;
            return (
              <li key={photo.id} className={styles.tile}>
                <button
                  type="button"
                  className={styles.thumbButton}
                  onClick={() => setLightboxIndex(index)}
                  aria-label={`Open photo ${index + 1} of ${photos.length}${photo.isCover ? " (cover)" : ""}`}
                >
                  {url ? (
                    <img src={url} alt="" loading="lazy" />
                  ) : (
                    <span className={styles.thumbPlaceholder} aria-hidden="true" />
                  )}
                  {photo.isCover && <span className={styles.coverBadge}>Cover</span>}
                </button>

                {(canManage || canDelete) && (
                  <div className={styles.tileActions}>
                    {canManage && !photo.isCover && (
                      <Button
                        variant="ghost"
                        size="sm"
                        htmlType="button"
                        onClick={() => handleSetCover(photo)}
                        disabled={isBusy}
                        aria-label={`Make photo ${index + 1} the cover`}
                      >
                        Set as cover
                      </Button>
                    )}
                    {canDelete && (
                      <Button
                        variant="ghost"
                        size="sm"
                        htmlType="button"
                        className={styles.delete}
                        onClick={() => setPendingDelete(photo)}
                        disabled={isBusy}
                        aria-label={`Delete photo ${index + 1}`}
                      >
                        {isBusy ? "Working…" : "Delete"}
                      </Button>
                    )}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {lightboxIndex !== null && photos[lightboxIndex] && (
        <PhotoLightbox
          photos={photos}
          urls={urls}
          index={lightboxIndex}
          onIndexChange={setLightboxIndex}
          onClose={() => setLightboxIndex(null)}
          tripTitle={trip.title}
        />
      )}

      {pendingDelete && (
        <ConfirmDialog
          title="Delete photo?"
          message={
            <>
              Delete this photo from <strong>{trip.title}</strong>?
              {pendingDelete.isCover && " It's the trip's cover photo."}
            </>
          }
          confirmLabel="Delete photo"
          onConfirm={handleConfirmDelete}
          onCancel={() => setPendingDelete(null)}
        />
      )}
    </section>
  );
}

export default TripGallery;
