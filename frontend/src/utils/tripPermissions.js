// UI-side mirror of public.can_manage_trips_of() (scripts/trips-schema.sql).
// The database and Storage policies are what actually enforce access; this
// only decides which controls to show, so a hidden button is never the
// only protection.
//
//   viewer:    { id, role } of the signed-in user
//   ownerRole: the trip owner's role, when known (admins see it via the
//              profiles they're allowed to read)
export function canManageTrip(trip, viewer, ownerRole) {
  if (!trip || !viewer?.id) return false;
  if (trip.userId === viewer.id) return true;
  if (viewer.role === "super_admin") return true;
  return (
    viewer.role === "admin" && Boolean(ownerRole) && ownerRole !== "super_admin"
  );
}

// Only the owner adds photos (the storage upload policy requires the
// owner's own folder).
export const canUploadTripPhotos = (trip, viewer) =>
  Boolean(trip && viewer?.id && trip.userId === viewer.id);
