import { useState } from "react";
import styles from "./PasswordInput.module.css";

// Password field with a Show/Hide toggle. Every prop (id, name,
// autoComplete, value, onChange, aria-describedby, aria-invalid, ...) goes
// to the <input>, so it works inside the shared Field component exactly
// like a plain input. The toggle is a real button: keyboard reachable,
// labelled, and aria-pressed while the password is shown.
function PasswordInput({ id, className = "", disabled, ...inputProps }) {
  const [isVisible, setIsVisible] = useState(false);

  return (
    <div className={styles.wrapper}>
      <input
        {...inputProps}
        id={id}
        type={isVisible ? "text" : "password"}
        disabled={disabled}
        className={`${styles.input} ${className}`}
        autoCapitalize="none"
        autoCorrect="off"
        spellCheck={false}
      />
      <button
        type="button"
        className={styles.toggle}
        onClick={() => setIsVisible((visible) => !visible)}
        aria-pressed={isVisible}
        aria-controls={id}
        aria-label={isVisible ? "Hide password" : "Show password"}
        disabled={disabled}
      >
        {isVisible ? "Hide" : "Show"}
      </button>
    </div>
  );
}

export default PasswordInput;
