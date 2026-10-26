// UI-side mirror of public.admin_delete_user()
// (scripts/admin-deletion-permissions.sql). The database function is what
// actually decides; this only decides whether to offer "Delete account":
// never for your own account, and an admin never for a super admin's.
//
//   user:   { id, role } of the account shown
//   viewer: { id, role } of the signed-in user
export function canDeleteUser(user, viewer) {
  if (!user || !viewer?.id || user.id === viewer.id) return false;
  if (viewer.role === "super_admin") return true;
  return viewer.role === "admin" && user.role !== "super_admin";
}
