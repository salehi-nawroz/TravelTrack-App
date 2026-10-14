import { useId } from "react";
import Button from "./Button";
import Dialog from "./Dialog";
import styles from "./ConfirmDialog.module.css";

// Confirmation for destructive actions, on the shared Dialog shell (which
// handles Escape, overlay click, focus and the portal). Focus starts on
// Cancel, the safe choice.
function ConfirmDialog({
  title = "Delete city?",
  message,
  cityName,
  confirmLabel = "Delete",
  warning = "This action cannot be undone.",
  onConfirm,
  onCancel,
}) {
  const titleId = useId();

  return (
    <Dialog
      labelledBy={titleId}
      onClose={onCancel}
      size="sm"
      className={styles.confirm}
    >
      <div className={styles.icon} aria-hidden="true">
        !
      </div>

      <h2 id={titleId}>{title}</h2>

      <p>
        {message ?? (
          <>
            Are you sure you want to delete <strong>{cityName}</strong>?
          </>
        )}
      </p>

      <p className={styles.warning}>{warning}</p>

      <div className={styles.actions}>
        <Button variant="secondary" htmlType="button" onClick={onCancel}>
          Cancel
        </Button>

        <Button variant="danger" htmlType="button" onClick={onConfirm}>
          {confirmLabel}
        </Button>
      </div>
    </Dialog>
  );
}

export default ConfirmDialog;
