import supabase from "./supabaseClient";

export async function getProfile() {
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError) throw new Error(userError.message);
  if (!user) throw new Error("User is not authenticated.");

  const { data, error } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .single();

  if (error) throw new Error(error.message);

  return data;
}

export async function getAllProfiles() {
  const { data, error } = await supabase
    .from("profiles")
    .select("id, full_name, role")
    .order("full_name", { ascending: true });

  if (error) throw new Error(error.message);

  return data;
}

// Name and role of one user, or null when RLS hides their profile (e.g. an
// admin asking about a super_admin).
export async function getProfileSummary(userId) {
  const { data, error } = await supabase
    .from("profiles")
    .select("id, full_name, role")
    .eq("id", userId)
    .maybeSingle();

  if (error) throw new Error(error.message);

  return data;
}

// Admin/super_admin only - backed by the get_admin_users() SECURITY DEFINER
// RPC (scripts/get-admin-users-function.sql), the one controlled path to
// email, which lives in auth.users and is never queried directly from the
// browser. The RPC itself enforces the same admin/super_admin visibility
// rule as the "Admins can view all profiles" RLS policy, so a non-admin
// caller simply gets an empty list back rather than an error.
export async function getAdminUsers() {
  const { data, error } = await supabase.rpc("get_admin_users");

  if (error) throw new Error(error.message);

  return data.map((row) => ({
    id: row.id,
    fullName: row.full_name,
    email: row.email,
    avatarPath: row.avatar_path,
    role: row.role,
    createdAt: row.created_at,
  }));
}

export async function updateProfile({ full_name, avatar_path }) {
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError) throw new Error(userError.message);
  if (!user) throw new Error("User is not authenticated.");

  const { data, error } = await supabase
    .from("profiles")
    .update({ full_name, avatar_path })
    .eq("id", user.id)
    .select()
    .single();

  if (error) throw new Error(error.message);

  return data;
}
