import { createContext } from "react";

// Kept apart from AuthContext.jsx, which imports the Supabase client, so the
// public pages (e.g. via Footer) can read the auth state without loading it.
export const AuthContext = createContext();
