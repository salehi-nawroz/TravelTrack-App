import styles from "./Spinner.module.css";

// Shared loading indicator. Announced to screen readers as a polite status
// ("Loading…" unless a more specific label is given); the ring itself is
// decorative.
function Spinner({ label = "Loading…" }) {
  return (
    <div className={styles.spinnerContainer} role="status" aria-live="polite">
      <div className={styles.spinner} aria-hidden="true"></div>
      <span className={styles.srOnly}>{label}</span>
    </div>
  );
}

export default Spinner;
