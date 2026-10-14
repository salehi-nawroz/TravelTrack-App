import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import Button from "./Button";
import styles from "./Dialog.module.css";

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

// Shared modal shell: overlay, panel, Escape / overlay-click to close, focus
// moved into the dialog on open, Tab kept inside it, and focus returned to
// what opened it on close. Content (heading, text, actions) comes from the
// caller, which names the dialog via labelledBy (the heading's id).
//
// Portaled to <body>: rendered inside the sidebar (a size container) or a
// sticky toolbar, the overlay would otherwise be confined or layered below
// the map, bottom nav and other UI.
//
//   size: "sm" (42rem) | "md" (52rem) | "lg" (64rem)
//   onClose: called for Escape, overlay click and the close button; a
//            caller that must not close right now (e.g. mid-import) simply
//            ignores the call.
function Dialog({
  labelledBy,
  onClose,
  size = "sm",
  showCloseButton = false,
  className = "",
  children,
}) {
  const panelRef = useRef(null);
  // Latest onClose without re-running the focus effect when it changes.
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    const panel = panelRef.current;
    const opener = document.activeElement;

    // First focusable control, or the panel itself.
    (panel.querySelector(FOCUSABLE) ?? panel).focus();

    function handleKeyDown(e) {
      if (e.key === "Escape") {
        e.stopPropagation();
        onCloseRef.current();
        return;
      }
      if (e.key !== "Tab") return;

      const focusable = [...panel.querySelectorAll(FOCUSABLE)];
      if (!focusable.length) {
        e.preventDefault();
        return;
      }
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      } else if (!panel.contains(document.activeElement)) {
        e.preventDefault();
        first.focus();
      }
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      if (opener instanceof HTMLElement && document.contains(opener)) {
        opener.focus();
      }
    };
  }, []);

  return createPortal(
    <div className={styles.overlay} onClick={() => onCloseRef.current()}>
      <div
        ref={panelRef}
        className={`${styles.dialog} ${styles[size]} ${className}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby={labelledBy}
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
      >
        {showCloseButton && (
          <Button
            variant="ghost"
            iconOnly
            htmlType="button"
            className={styles.closeButton}
            onClick={() => onCloseRef.current()}
            aria-label="Close"
          >
            &times;
          </Button>
        )}
        {children}
      </div>
    </div>,
    document.body,
  );
}

export default Dialog;
