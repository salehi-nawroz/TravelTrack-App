import { useEffect, useRef, useState } from "react";
import Button from "./Button";
import styles from "./DemoAccess.module.css";

// "Try the Demo Account" panel under the login form. Shows the shared demo
// account's (intentionally public) credentials with copy buttons, and fills
// the login form via `onFill` - it never signs in by itself.
function DemoAccess({ email, password, onFill }) {
  const [status, setStatus] = useState("");
  const clearTimer = useRef(null);

  useEffect(() => () => clearTimeout(clearTimer.current), []);

  function announce(message) {
    clearTimeout(clearTimer.current);
    setStatus(message);
    clearTimer.current = setTimeout(() => setStatus(""), 4000);
  }

  async function copy(label, value) {
    try {
      await navigator.clipboard.writeText(value);
      announce(`${label} copied to the clipboard.`);
    } catch {
      announce(`Couldn't copy the ${label.toLowerCase()} - please select it and copy it manually.`);
    }
  }

  function handleFill() {
    onFill(email, password);
    announce("Demo credentials filled in - select Login to continue.");
  }

  return (
    <section className={styles.demo} aria-labelledby="demo-title">
      <div className={styles.header}>
        <h2 id="demo-title" className={styles.title}>
          Try the Demo Account
        </h2>
        <p className={styles.notice}>
          A shared account with sample data, provided for portfolio testing. Anyone can use it and
          its data may be reset at any time, so please don&apos;t add personal information.
        </p>
      </div>

      <dl className={styles.credentials}>
        <div className={styles.row}>
          <dt>Email</dt>
          <dd>
            <code className={styles.value}>{email}</code>
            <Button
              htmlType="button"
              variant="ghost"
              size="sm"
              className={styles.copy}
              aria-label="Copy demo email"
              onClick={() => copy("Email", email)}
            >
              Copy
            </Button>
          </dd>
        </div>
        <div className={styles.row}>
          <dt>Password</dt>
          <dd>
            <code className={styles.value}>{password}</code>
            <Button
              htmlType="button"
              variant="ghost"
              size="sm"
              className={styles.copy}
              aria-label="Copy demo password"
              onClick={() => copy("Password", password)}
            >
              Copy
            </Button>
          </dd>
        </div>
      </dl>

      <Button htmlType="button" variant="outline" className={styles.fill} onClick={handleFill}>
        Fill Demo Credentials
      </Button>

      <p className={styles.status} role="status">
        {status}
      </p>
    </section>
  );
}

export default DemoAccess;
