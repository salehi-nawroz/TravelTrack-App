// Portfolio extras: the public demo account and the source code link.
//
// VITE_DEMO_EMAIL / VITE_DEMO_PASSWORD are bundled into the public JavaScript
// like every VITE_* variable, so they are intentionally public credentials.
// They must belong to a dedicated demo account with the regular `user` role -
// never an admin, super_admin or personal account (README, "Portfolio demo
// account"). Leave them unset and the demo section is simply not shown.

const demoEmail = (import.meta.env.VITE_DEMO_EMAIL ?? "").trim();
const demoPassword = import.meta.env.VITE_DEMO_PASSWORD ?? "";

// { email, password } when both are configured, otherwise null.
export const DEMO_ACCOUNT =
  demoEmail && demoPassword ? { email: demoEmail, password: demoPassword } : null;

// True when `email` is the shared demo account's (case-insensitive).
export function isDemoAccount(email) {
  return Boolean(DEMO_ACCOUNT && email && email.trim().toLowerCase() === DEMO_ACCOUNT.email.toLowerCase());
}

// Verified against `git remote get-url origin`.
export const SOURCE_REPO_URL = "https://github.com/salehi-nawroz/TravelTrack-App";
