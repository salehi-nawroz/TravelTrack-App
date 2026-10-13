import { useEffect } from "react";
import { createPortal } from "react-dom";
import Button from "./Button";
import styles from "./ConfirmDialog.module.css";

function ConfirmDialog({
  title = "Delete city?",
  message,
  cityName,
  confirmLabel = "Delete",
  warning = "This action cannot be undone.",
  onConfirm,
  onCancel,
}) {
  useEffect(() => {
    function handleKeyDown(e) {
      if (e.key === "Escape") {
        onCancel();
      }
    }

    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [onCancel]);

  // Portaled to <body> (like CityImport): rendered inside the sidebar, the
  // overlay would be confined to it (the sidebar is a size container) and,
  // on phones, layered under the bottom nav.
  return createPortal(
    <div className={styles.overlay} onClick={onCancel}>
      <div
        className={styles.dialog}
        role="dialog"
        aria-modal="true"
        aria-labelledby="dialog-title"
        onClick={(e) => e.stopPropagation()}
      >
        <div className={styles.icon}>!</div>

        <h2 id="dialog-title">{title}</h2>

        <p>
          {message ?? (
            <>
              Are you sure you want to delete <strong>{cityName}</strong>?
            </>
          )}
        </p>

        <p className={styles.warning}>{warning}</p>

        <div className={styles.actions}>
          <Button type="back" onClick={onCancel}>
            Cancel
          </Button>

          <Button type="danger" onClick={onConfirm}>
            {confirmLabel}
          </Button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

export default ConfirmDialog;
