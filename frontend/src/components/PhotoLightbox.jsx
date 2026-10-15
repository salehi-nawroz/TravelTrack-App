import { useEffect, useId } from "react";
import Button from "./Button";
import Dialog from "./Dialog";
import styles from "./TripGallery.module.css";

// One photo at a time, full size, on the shared Dialog (Escape, focus trap
// and focus return). Left/Right arrow keys and the buttons step through.
function PhotoLightbox({ photos, urls, index, onIndexChange, onClose, tripTitle }) {
  const titleId = useId();
  const photo = photos[index];
  const url = urls[photo.storagePath];
  const count = photos.length;

  const go = (offset) => onIndexChange((index + offset + count) % count);

  // On the document, like Dialog's own Escape handling, so the arrows work
  // wherever focus is inside the dialog (it starts on the close button).
  useEffect(() => {
    if (count < 2) return;

    function handleKeyDown(e) {
      if (e.key === "ArrowLeft") onIndexChange((index - 1 + count) % count);
      if (e.key === "ArrowRight") onIndexChange((index + 1) % count);
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [index, count, onIndexChange]);

  return (
    <Dialog
      labelledBy={titleId}
      onClose={onClose}
      size="lg"
      showCloseButton
      className={styles.lightbox}
    >
      <div className={styles.lightboxBody}>
        <h2 id={titleId} className={styles.lightboxTitle}>
          {tripTitle}
          <span className={styles.lightboxCounter}>
            Photo {index + 1} of {count}
            {photo.isCover && " · Cover"}
          </span>
        </h2>

        <div className={styles.lightboxImage}>
          {url ? (
            <img
              src={url}
              alt={photo.caption || `Photo ${index + 1} of ${count} from ${tripTitle}`}
            />
          ) : (
            <p className={styles.unavailable}>This photo can&apos;t be shown right now.</p>
          )}
        </div>

        {photo.caption && <p className={styles.caption}>{photo.caption}</p>}

        {count > 1 && (
          <div className={styles.lightboxNav}>
            <Button variant="secondary" size="sm" htmlType="button" onClick={() => go(-1)}>
              &larr; Previous
            </Button>
            <Button variant="secondary" size="sm" htmlType="button" onClick={() => go(1)}>
              Next &rarr;
            </Button>
          </div>
        )}
      </div>
    </Dialog>
  );
}

export default PhotoLightbox;
