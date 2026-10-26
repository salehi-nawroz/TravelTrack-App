import { useEffect, useId, useRef, useState } from "react";
import styles from "./CollapsibleFilters.module.css";

// Search and filter fields that fold away behind a toggle when the sidebar
// is narrow: tablets, the phone bottom sheet, or a desktop sidebar dragged
// narrower than its default (a container query on Sidebar's .sidebar, see
// the CSS). On a wide sidebar the toggle is hidden and the fields show in
// one row, laid out like the toolbar they sit in.
//
// With `toggleable` (Admin and Cities toolbars), the toggle is a compact
// icon-only button at every width, with a tooltip and an aria-label saying
// what it does, and the panel starts closed on every screen size.
//
// Only the panel's visibility lives here. The field values stay in the
// parent, so closing the panel never clears a search, filter or sort.
//   label:           toggle text (not shown on the icon-only toggle)
//   toggleable:      icon-only toggle at every width, closed by default
//   activeCount:     searches/filters/sorts currently set - shown on the
//                    toggle so a closed panel doesn't hide that results are
//                    filtered
//   toggleClassName: extra class for the toggle (e.g. spacing)
//   open, onOpenChange: optional, to control it from outside - e.g. a
//                    search that folds away once a result is picked
function CollapsibleFilters({
  label = "Search & filter",
  activeCount = 0,
  toggleable = false,
  toggleClassName = "",
  open,
  onOpenChange,
  children,
}) {
  const panelId = useId();
  const [ownIsOpen, setOwnIsOpen] = useState(false);
  const isOpen = open ?? ownIsOpen;
  const setIsOpen = onOpenChange ?? setOwnIsOpen;
  const panelRef = useRef(null);
  const focusOnOpenRef = useRef(false);

  // Opening from the toggle moves focus to the first field, so keyboard
  // users land where they wanted to type. preventScroll: the field opens
  // right under the toggle that was just pressed, so it's already in view,
  // and letting the browser scroll would shift the app's fixed-height
  // layout (the sidebar and map containers) out of place.
  useEffect(() => {
    if (!isOpen || !focusOnOpenRef.current) return;
    focusOnOpenRef.current = false;
    panelRef.current
      ?.querySelector("input, select, textarea")
      ?.focus({ preventScroll: true });
  }, [isOpen]);

  function handleToggle() {
    focusOnOpenRef.current = !isOpen;
    setIsOpen(!isOpen);
  }

  const action = `${isOpen ? "Hide" : "Show"} search and filters`;

  return (
    <div
      className={`${styles.root} ${toggleable ? styles.toggleable : ""} ${
        toggleable && isOpen ? styles.rootOpen : ""
      }`}
    >
      <button
        type="button"
        className={`${styles.toggle} ${toggleable ? styles.iconToggle : ""} ${toggleClassName}`}
        aria-expanded={isOpen}
        aria-controls={panelId}
        aria-label={
          toggleable
            ? `${action}${activeCount > 0 ? ` (${activeCount} active)` : ""}`
            : undefined
        }
        onClick={handleToggle}
      >
        {toggleable ? (
          // Horizontal sliders: the usual "filters" mark.
          <svg
            className={styles.icon}
            viewBox="0 0 24 24"
            aria-hidden="true"
            focusable="false"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
          >
            <path d="M4 6h9M17 6h3M4 12h3M11 12h9M4 18h11M19 18h1" />
            <circle cx="15" cy="6" r="2" />
            <circle cx="9" cy="12" r="2" />
            <circle cx="17" cy="18" r="2" />
          </svg>
        ) : (
          <svg
            className={styles.icon}
            viewBox="0 0 24 24"
            aria-hidden="true"
            focusable="false"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.2"
            strokeLinecap="round"
          >
            <circle cx="11" cy="11" r="6.5" />
            <path d="m16 16 4.5 4.5" />
          </svg>
        )}
        {!toggleable && <span>{label}</span>}
        {activeCount > 0 && (
          <span className={styles.badge} aria-hidden={toggleable || undefined}>
            {activeCount}
            <span className={styles.srOnly}> active</span>
          </span>
        )}
        {/* Visual tooltip on hover and keyboard focus; the aria-label above
            already gives screen readers the same words. */}
        {toggleable && (
          <span className={styles.tooltip} aria-hidden="true">
            {action}
          </span>
        )}
      </button>

      <div
        id={panelId}
        ref={panelRef}
        className={`${styles.panel} ${isOpen ? styles.open : ""}`}
        data-filters-panel=""
      >
        {children}
      </div>
    </div>
  );
}

export default CollapsibleFilters;
