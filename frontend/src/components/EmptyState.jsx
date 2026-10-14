import NavIcon from "./NavIcon";
import styles from "./EmptyState.module.css";

// Shared "nothing here yet" panel.
//   icon:    a section icon id from NavIcon ("cities", "countries", "trips",
//            "stats", "admin", "profile"); "cities" (a map pin) by default
//   title:   short headline
//   message: one line of guidance (optional)
//   action:  optional element(s) - usually Buttons or button-styled Links
//   compact: borderless, smaller version for inline cases such as
//            "no results for these filters"
function EmptyState({
  icon = "cities",
  title,
  message,
  action,
  compact = false,
}) {
  return (
    <div className={`${styles.empty} ${compact ? styles.compact : ""}`}>
      <NavIcon id={icon} className={styles.icon} />
      <p className={styles.title}>{title}</p>
      {message && <p className={styles.message}>{message}</p>}
      {action && <div className={styles.actions}>{action}</div>}
    </div>
  );
}

export default EmptyState;
