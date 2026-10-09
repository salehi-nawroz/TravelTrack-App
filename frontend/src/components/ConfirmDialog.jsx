import { useEffect } from "react";
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

  return (
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
    </div>
  );
}

export default ConfirmDialog;
