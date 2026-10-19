import { Link, useNavigate } from "react-router-dom";
import PageNav from "../components/PageNav";
import { useAuth } from "../contexts/AuthContext";
import styles from "./Auth.module.css";
import { useEffect, useState } from "react";
import Button from "../components/Button";
import Field, { FormMessage } from "../components/Field";
import PasswordInput from "../components/PasswordInput";

export default function Login() {
  const { isAuthenticated, login } = useAuth();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const navigate = useNavigate();

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
      setError("Invalid email or password.");
    } finally {
      setIsSubmitting(false);
    }
  }

  useEffect(() => {
    if (isAuthenticated) navigate("/app", { replace: true });
  }, [isAuthenticated, navigate]);

  return (
    <main className={styles.page}>
      <PageNav />
      <form className={styles.form} onSubmit={handleSubmit} aria-labelledby="login-title">
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
    </main>
  );
}
