// UI-side mirror of public.admin_delete_user()
// (scripts/admin-ownership-deletion.sql). The database function is what
// actually decides; this only decides whether to offer "Delete account":
// only to a super admin, and never for their own account. A plain admin
// can't delete any account.
//
//   user:   { id, role } of the account shown
//   viewer: { id, role } of the signed-in user
export function canDeleteUser(user, viewer) {
  if (!user || !viewer?.id || user.id === viewer.id) return false;
  return viewer.role === "super_admin";
}
