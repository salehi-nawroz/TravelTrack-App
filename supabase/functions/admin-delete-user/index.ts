// Supabase Edge Function entry point (Deno). The logic is in handler.js.
//
// Deploy (needs the Supabase CLI and access to the project):
//   supabase functions deploy admin-delete-user --project-ref <project ref>
// Supabase provides SUPABASE_URL, SUPABASE_ANON_KEY and
// SUPABASE_SERVICE_ROLE_KEY to every function; nothing has to be set. The
// service-role key stays on the server and never reaches the browser.

import { createClient } from "npm:@supabase/supabase-js@2.116.0";
import { handleRequest } from "./handler.js";

Deno.serve((request) =>
  handleRequest(request, {
    env: {
      SUPABASE_URL: Deno.env.get("SUPABASE_URL"),
      SUPABASE_ANON_KEY: Deno.env.get("SUPABASE_ANON_KEY"),
      SUPABASE_SERVICE_ROLE_KEY: Deno.env.get("SUPABASE_SERVICE_ROLE_KEY"),
    },
    createClient,
  }),
);
