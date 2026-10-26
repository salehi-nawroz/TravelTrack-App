import supabase from "./supabaseClient";

export async function deleteAccount() {
  const { error } = await supabase.rpc("delete_own_account");
  if (error) throw new Error(error.message);
}

// Admin -> Users: deletes another user's account through the
// admin-delete-user Edge Function (supabase/functions/admin-delete-user),
// which checks the caller's role in the database, removes the user's photo
// files with the service role and deletes every row in one transaction.
// Resolves with { warnings } only when the account really is gone.
export async function adminDeleteUser(userId) {
  const { data, error } = await supabase.functions.invoke("admin-delete-user", {
    body: { userId },
  });

  if (error) {
    // Non-2xx responses carry { error: "<message>" } in the body.
    let message = "";
    try {
      message = (await error.context?.json())?.error ?? "";
    } catch {
      message = "";
    }
    throw new Error(message || "Couldn't delete this account. Please try again.");
  }

  if (!data?.deleted) throw new Error("Couldn't confirm that the account was deleted. Please reload and check.");
  return { warnings: data.warnings ?? [] };
}
