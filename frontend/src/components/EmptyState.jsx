import NavIcon from "./NavIcon";
import styles from "./EmptyState.module.css";

// Shared "nothing here yet" panel.
//   icon:    an icon id from NavIcon ("cities", "countries", "trips",
//            "stats", "admin", "profile", "trash"); "cities" (a map pin) by
//            default, and "alert" for the error tone
//   title:   short headline
//   message: one line of guidance (optional)
//   action:  optional element(s) - usually Buttons or button-styled Links
//   compact: borderless, smaller version for inline cases such as
//            "no results for these filters"
//   tone:    "neutral" (default) | "error" - a failed load; red accent and
//            announced to screen readers. Pair it with a "Try again" action.
function EmptyState({
  icon,
  title,
  message,
  action,
  compact = false,
  tone = "neutral",
}) {
  const isError = tone === "error";

  return (
    <div
      className={[
        styles.empty,
        compact ? styles.compact : "",
        isError ? styles.error : "",
      ].join(" ")}
      role={isError ? "alert" : undefined}
    >
      <NavIcon
        id={icon ?? (isError ? "alert" : "cities")}
        className={styles.icon}
      />
      <p className={styles.title}>{title}</p>
      {message && <p className={styles.message}>{message}</p>}
      {action && <div className={styles.actions}>{action}</div>}
    </div>
  );
}

export default EmptyState;
