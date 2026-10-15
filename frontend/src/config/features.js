// Trip tracking needs the trips schema and the trip-photos bucket
// (scripts/trips-schema.sql and friends). Until those are applied to the
// Supabase project, leave VITE_TRIPS_ENABLED unset: the app then keeps the
// previous, read-only Trips page and never queries the trip tables.
export const TRIPS_ENABLED = import.meta.env.VITE_TRIPS_ENABLED === "true";
