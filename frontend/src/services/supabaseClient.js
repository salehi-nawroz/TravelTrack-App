import { createClient } from "@supabase/supabase-js";
import { CONFIG_PROBLEMS, SUPABASE_ANON_KEY, SUPABASE_URL } from "../config/env";

// With missing or unsafe configuration main.jsx shows a setup message and
// never renders the app, so nothing talks to this client. The placeholders
// only keep createClient from throwing while the modules load.
const isConfigured = CONFIG_PROBLEMS.length === 0;

// sessionStorage instead of the default localStorage: the session survives a
// reload but is cleared when the tab is closed, which logs the user out.
const supabase = createClient(
  isConfigured ? SUPABASE_URL : "https://not-configured.invalid",
  isConfigured ? SUPABASE_ANON_KEY : "not-configured",
  { auth: { storage: window.sessionStorage } },
);

export default supabase;
