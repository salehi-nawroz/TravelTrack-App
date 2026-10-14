import { Children, cloneElement, isValidElement } from "react";
import styles from "./Field.module.css";

// Shared form field: a label, the control, and an optional hint or
// validation error, wired together for assistive tech.
//
//   id:       the control's id (the child element with this id is the
//             control; other children - e.g. a flag badge - render as is)
//   label:    visible label text
//   hint:     helper text under the control
//   error:    validation message; marks the control aria-invalid
//   variant:  "stacked" (default, forms) | "toolbar" (compact filter field
//             with a small uppercase label and a 36px control)
//   className: extra class for the wrapper (e.g. a positioned row)
//
// The control gets aria-describedby for the hint/error, and the toolbar
// variant adds its control class. Works with native inputs, selects,
// textareas, buttons and DatePicker (anything taking id/className).
function Field({
  id,
  label,
  hint,
  error,
  variant = "stacked",
  className = "",
  children,
}) {
  const hintId = hint ? `${id}-hint` : null;
  const errorId = error ? `${id}-error` : null;
  const describedBy = [hintId, errorId].filter(Boolean).join(" ") || undefined;

  const content = Children.map(children, (child) => {
    if (!isValidElement(child) || child.props.id !== id) return child;
    return cloneElement(child, {
      className:
        [child.props.className, variant === "toolbar" ? styles.control : ""]
          .filter(Boolean)
          .join(" ") || undefined,
      "aria-describedby":
        [child.props["aria-describedby"], describedBy]
          .filter(Boolean)
          .join(" ") || undefined,
      "aria-invalid": error ? true : child.props["aria-invalid"],
    });
  });

  return (
    <div className={`${styles.field} ${styles[variant]} ${className}`}>
      <label htmlFor={id} className={styles.label}>
        {label}
      </label>
      {content}
      {hint && (
        <span id={hintId} className={styles.hint}>
          {hint}
        </span>
      )}
      {error && (
        <span id={errorId} className={styles.error} role="alert">
          {error}
        </span>
      )}
    </div>
  );
}

// Form-level feedback that isn't tied to one field (e.g. "Could not save").
//   tone: "error" (announced immediately) | "success" (announced politely)
export function FormMessage({ tone = "error", children }) {
  return (
    <p
      className={`${styles.formMessage} ${styles[tone]}`}
      role={tone === "error" ? "alert" : "status"}
    >
      {children}
    </p>
  );
}

export default Field;
