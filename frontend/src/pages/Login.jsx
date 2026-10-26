import { Link, useLocation, useNavigate } from "react-router-dom";
import PageNav from "../components/PageNav";
import { useAuth } from "../contexts/AuthContext";
import styles from "./Auth.module.css";
import { useEffect, useRef, useState } from "react";
import Button from "../components/Button";
import NavIcon from "../components/NavIcon";
import Field, { FormMessage } from "../components/Field";
import PasswordInput from "../components/PasswordInput";
import { getLoginErrorMessage } from "../utils/authErrors";
import { useDocumentTitle } from "../hooks/useDocumentTitle";
import DemoAccess from "../components/DemoAccess";
import { DEMO_ACCOUNT } from "../config/portfolio";

// Shared admin demo account, shown on the login page on purpose (the
// project holds sample data only). Same rules as any admin: the database
// decides what it can do; this card only describes it.
const ADMIN_DEMO = { email: "admin_user@outlook.com", password: "admin@321" };
const ADMIN_DEMO_FIELDS = [
  ["Email", ADMIN_DEMO.email],
  ["Password", ADMIN_DEMO.password],
];

export default function Login() {
  useDocumentTitle("Log in");
  const { isAuthenticated, login } = useAuth();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const navigate = useNavigate();
  const location = useLocation();

  async function handleSubmit(e) {
    e.preventDefault();
    if (isSubmitting) return;
    if (!email || !password) {
      setError("Please enter your email address and password.");
      return;
    }

    setError("");
    setIsSubmitting(true);
    try {
      await login(email, password);

      if (window.PasswordCredential) {
        try {
          const credential = new window.PasswordCredential(e.target);
          await navigator.credentials.store(credential);
        } catch {
          // Best-effort only; not all browsers support this API.
        }
      }
    } catch (err) {
      setError(getLoginErrorMessage(err));
    } finally {
      setIsSubmitting(false);
    }
  }

  // Back to the page that sent the visitor here (ProtectRoute), but only
  // ever to a page inside the app - never an outside or arbitrary URL.
  const from = location.state?.from;
  const returnTo =
    typeof from === "string" && /^\/app(\/|\?|$)/.test(from) ? from : "/app";

  useEffect(() => {
    if (isAuthenticated) navigate(returnTo, { replace: true });
  }, [isAuthenticated, navigate, returnTo]);

  // Fills the form only; the visitor still presses Login.
  function fillDemoCredentials(demoEmail, demoPassword) {
    setEmail(demoEmail);
    setPassword(demoPassword);
    setError("");
  }

  // Copy / fill feedback for the admin demo card, cleared after a moment.
  const [adminDemoStatus, setAdminDemoStatus] = useState("");
  const adminDemoTimer = useRef(null);
  useEffect(() => () => clearTimeout(adminDemoTimer.current), []);

  function announceAdminDemo(message) {
    clearTimeout(adminDemoTimer.current);
    setAdminDemoStatus(message);
    adminDemoTimer.current = setTimeout(() => setAdminDemoStatus(""), 4000);
  }

  async function copyAdminDemo(label, value) {
    try {
      await navigator.clipboard.writeText(value);
      announceAdminDemo(`Admin ${label.toLowerCase()} copied to the clipboard.`);
    } catch {
      announceAdminDemo(`Couldn't copy the ${label.toLowerCase()} - please select it and copy it manually.`);
    }
  }

  function fillAdminDemo() {
    fillDemoCredentials(ADMIN_DEMO.email, ADMIN_DEMO.password);
    announceAdminDemo("Admin credentials filled in - select Login to continue.");
  }

  return (
    <main className={styles.page}>
      <PageNav />
      <form
        className={`${styles.form} ${styles.formWithDemo}`}
        onSubmit={handleSubmit}
        aria-labelledby="login-title"
      >
        <div className={styles.header}>
          <h1 id="login-title" className={styles.title}>
            Log in
          </h1>
          <p className={styles.subtitle}>Welcome back - your map is waiting.</p>
        </div>

        <Field id="email" label="Email address">
          <input
            type="email"
            id="email"
            name="email"
            autoComplete="username"
            inputMode="email"
            onChange={(e) => setEmail(e.target.value)}
            value={email}
          />
        </Field>

        <Field id="password" label="Password">
          <PasswordInput
            id="password"
            name="password"
            autoComplete="current-password"
            onChange={(e) => setPassword(e.target.value)}
            value={password}
          />
        </Field>

        {error && (
          <div className={styles.errorBox}>
            <FormMessage>{error}</FormMessage>
          </div>
        )}

        <Button type="primary" htmlType="submit" className={styles.submit} disabled={isSubmitting}>
          {isSubmitting ? "Logging in…" : "Login"}
        </Button>

        <p className={styles.switch}>
          Don&apos;t have an account? <Link to="/signup">Sign up</Link>
        </p>
      </form>

      <section
        className={`${styles.adminDemo} ${DEMO_ACCOUNT ? styles.adminDemoStacked : ""}`}
        aria-labelledby="admin-demo-title"
      >
        <div className={styles.adminDemoHeader}>
          <span className={styles.adminDemoBadge}>
            <NavIcon id="admin" className={styles.adminDemoIcon} />
          </span>
          <div className={styles.adminDemoIntro}>
            <h2 id="admin-demo-title" className={styles.adminDemoTitle}>
              Demo Admin Account
            </h2>
            <p className={styles.adminDemoNote}>
              Demo admin accounts can manage users and cities, including deleting them, but cannot
              delete trips.
            </p>
          </div>
        </div>

        <dl className={styles.adminDemoCredentials}>
          {ADMIN_DEMO_FIELDS.map(([label, value]) => (
            <div key={label} className={styles.adminDemoRow}>
              <dt>{label}</dt>
              <dd>
                <code className={styles.adminDemoValue}>{value}</code>
                <Button
                  htmlType="button"
                  variant="ghost"
                  size="sm"
                  className={styles.adminDemoCopy}
                  aria-label={`Copy demo admin ${label.toLowerCase()}`}
                  onClick={() => copyAdminDemo(label, value)}
                >
                  Copy
                </Button>
              </dd>
            </div>
          ))}
        </dl>

        <Button htmlType="button" variant="outline" className={styles.adminDemoFill} onClick={fillAdminDemo}>
          Fill Admin Credentials
        </Button>

        {/* aria-live rather than role="status": the user demo panel below
            already has the page's status region. */}
        <p className={styles.adminDemoStatus} aria-live="polite">
          {adminDemoStatus}
        </p>
      </section>

      {DEMO_ACCOUNT && (
        <DemoAccess
          email={DEMO_ACCOUNT.email}
          password={DEMO_ACCOUNT.password}
          onFill={fillDemoCredentials}
        />
      )}
    </main>
  );
}
