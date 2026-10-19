// Sign-in failures that aren't about the password get their own message;
// anything else stays the deliberately vague credentials message, so the
// form never reveals whether an email address has an account.
export function getLoginErrorMessage(err) {
  const message = err?.message ?? "";
  if (err?.name === "AuthRetryableFetchError" || /failed to fetch|network/i.test(message))
    return "We couldn't reach the server. Check your connection and try again.";
  if (err?.code === "email_not_confirmed" || /email not confirmed/i.test(message))
    return "Please confirm your email address first, using the link we sent you.";
  if (err?.status === 429 || err?.code === "over_request_rate_limit")
    return "Too many attempts. Please wait a minute and try again.";
  return "Invalid email or password.";
}
