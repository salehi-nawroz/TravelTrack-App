import { Link, useNavigate } from "react-router-dom";
import { useEffect, useState } from "react";
import PageNav from "../components/PageNav";
import Button from "../components/Button";
import Field, { FormMessage } from "../components/Field";
import PasswordInput from "../components/PasswordInput";
import { useAuth } from "../contexts/AuthContext";
import styles from "./Auth.module.css";

function getSignupErrorMessage(error) {
  switch (error?.code) {
    case "weak_password":
      return "Please choose a stronger password (at least 8 characters).";
    case "validation_failed":
    case "email_address_invalid":
      return "Please enter a valid email address.";
    case "over_email_send_rate_limit":
      return "Too many attempts. Please wait a moment and try again.";
    default:
      return "We couldn't create your account. Please try again.";
  }
}

export default function Signup() {
  const { isAuthenticated, signup } = useAuth();
  const navigate = useNavigate();

  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  // Which field a validation error belongs to ("password" |
  // "confirmPassword"), so it's shown and announced on that field; null for
  // form-level errors.
  const [errorField, setErrorField] = useState(null);
  const [isDuplicateEmailError, setIsDuplicateEmailError] = useState(false);
  const [status, setStatus] = useState("idle"); // idle | submitting | success

  useEffect(() => {
    if (isAuthenticated) navigate("/app", { replace: true });
  }, [isAuthenticated, navigate]);

  async function handleSubmit(e) {
    e.preventDefault();

    const trimmedName = fullName.trim();
    const trimmedEmail = email.trim();

    if (status === "submitting") return;
    setError("");
    setErrorField(null);
    setIsDuplicateEmailError(false);

    if (!trimmedName || !trimmedEmail || !password || !confirmPassword) {
      setError("Please fill in all fields.");
      return;
    }
    if (password.length < 8) {
      setError("Password must be at least 8 characters.");
      setErrorField("password");
      return;
    }
    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      setErrorField("confirmPassword");
      return;
    }

    setStatus("submitting");
    try {
      const data = await signup(trimmedName, trimmedEmail, password);
      // When email-enumeration protection is active, Supabase doesn't throw
      // for an already-registered email - it returns a fabricated user with
      // no identities instead, so this has to be checked before treating the
      // call as a fresh signup.
      if (data.user && data.user.identities?.length === 0) {
        setStatus("idle");
        setIsDuplicateEmailError(true);
        return;
      }
      // If email confirmation is disabled, signUp returns a session
      // immediately and the isAuthenticated effect above will redirect.
      if (!data.session) setStatus("success");
    } catch (err) {
      if (
        err.code === "user_already_exists" ||
        err.code === "identity_already_exists"
      ) {
        setStatus("idle");
        setIsDuplicateEmailError(true);
        return;
      }
      setStatus("idle");
      setError(getSignupErrorMessage(err));
    }
  }

  if (status === "success") {
    return (
      <main className={styles.page}>
        <PageNav />
        <div className={styles.form} role="status">
          <h1 className={styles.title}>Check your email</h1>
          <p className={styles.body}>
            If {email.trim()} isn&apos;t already registered, we&apos;ve sent
            a confirmation link to it. Click the link to verify your account,
            then log in.
          </p>
          <p className={styles.switch}>
            <Link to="/login">Go to log in</Link>
          </p>
        </div>
      </main>
    );
  }

  return (
    <main className={styles.page}>
      <PageNav />
      <form className={styles.form} onSubmit={handleSubmit} aria-labelledby="signup-title">
        <div className={styles.header}>
          <h1 id="signup-title" className={styles.title}>
            Create an account
          </h1>
          <p className={styles.subtitle}>Start mapping the places you&apos;ve been.</p>
        </div>

        <Field id="fullName" label="Full name">
          <input
            type="text"
            id="fullName"
            name="fullName"
            autoComplete="name"
            onChange={(e) => setFullName(e.target.value)}
            value={fullName}
          />
        </Field>

        <Field id="email" label="Email address">
          <input
            type="email"
            id="email"
            name="email"
            autoComplete="email"
            inputMode="email"
            onChange={(e) => setEmail(e.target.value)}
            value={email}
          />
        </Field>

        <Field
          id="password"
          label="Password"
          hint="At least 8 characters."
          error={errorField === "password" ? error : undefined}
        >
          <PasswordInput
            id="password"
            name="password"
            autoComplete="new-password"
            onChange={(e) => setPassword(e.target.value)}
            value={password}
          />
        </Field>

        <Field
          id="confirmPassword"
          label="Confirm password"
          error={errorField === "confirmPassword" ? error : undefined}
        >
          <PasswordInput
            id="confirmPassword"
            name="confirmPassword"
            autoComplete="new-password"
            onChange={(e) => setConfirmPassword(e.target.value)}
            value={confirmPassword}
          />
        </Field>

        {isDuplicateEmailError && (
          <div className={styles.errorBox}>
            <FormMessage>
              This email is already registered. Please{" "}
              <Link to="/login">log in</Link> instead.
            </FormMessage>
          </div>
        )}
        {error && !errorField && (
          <div className={styles.errorBox}>
            <FormMessage>{error}</FormMessage>
          </div>
        )}

        <Button
          type="primary"
          htmlType="submit"
          className={styles.submit}
          disabled={status === "submitting"}
        >
          {status === "submitting" ? "Creating account…" : "Sign up"}
        </Button>

        <p className={styles.switch}>
          Already have an account? <Link to="/login">Log in</Link>
        </p>
      </form>
    </main>
  );
}
