import styles from "./TripStatusBadge.module.css";

const LABELS = { active: "Active", completed: "Completed" };

// Trip status as a pill: green for an active trip, neutral once completed.
// Text, not colour alone, carries the meaning.
function TripStatusBadge({ status }) {
  return (
    <span className={`${styles.badge} ${styles[status] ?? ""}`}>
      {status === "active" && <span className={styles.dot} aria-hidden="true" />}
      {LABELS[status] ?? status}
    </span>
  );
}

export default TripStatusBadge;
