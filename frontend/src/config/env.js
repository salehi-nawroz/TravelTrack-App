// Browser configuration, read once from Vite's VITE_* variables (see
// .env.example). Everything here ends up in the public JavaScript bundle, so
// it may only ever hold the project URL and the publishable (anon) key.

export const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL ?? "";
export const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY ?? "";

// The JWT "role" claim of a legacy Supabase key, or "" when it isn't a JWT.
function jwtRole(key) {
  try {
    const payload = key.split(".")[1];
    if (!payload) return "";
    const json = atob(payload.replace(/-/g, "+").replace(/_/g, "/"));
    return JSON.parse(json).role ?? "";
  } catch {
    return "";
  }
}

// Problems that stop the app from starting, as messages that name variables
// but never print their values. An empty list means the config is usable.
export function getConfigProblems({ url, anonKey }) {
  const problems = [];

  if (!url) {
    problems.push("VITE_SUPABASE_URL is not set.");
  } else {
    let parsed = null;
    try {
      parsed = new URL(url);
    } catch {
      // Reported below.
    }
    if (!parsed || !/^https?:$/.test(parsed.protocol)) {
      problems.push("VITE_SUPABASE_URL is not a valid http(s) URL.");
    }
  }

  if (!anonKey) {
    problems.push("VITE_SUPABASE_ANON_KEY is not set.");
  } else if (anonKey.startsWith("sb_secret_") || jwtRole(anonKey) === "service_role") {
    // Fail closed: a secret key in the bundle would bypass Row Level Security
    // for anyone who opens the site.
    problems.push(
      "VITE_SUPABASE_ANON_KEY holds a secret (service-role) key. Use the project's publishable / anon key instead, and rotate the secret key.",
    );
  }

  return problems;
}

export const CONFIG_PROBLEMS = getConfigProblems({
  url: SUPABASE_URL,
  anonKey: SUPABASE_ANON_KEY,
});
