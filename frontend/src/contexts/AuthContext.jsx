import { createContext, useContext, useEffect, useState } from "react";
import supabase from "../services/supabaseClient";
import {
  getProfile,
  updateProfile as updateProfileApi,
} from "../services/profileService";
import {
  uploadAvatar as uploadAvatarApi,
  removeAvatar as removeAvatarApi,
  getAvatarSignedUrl,
} from "../services/avatarService";
import { deleteAccount as deleteAccountApi } from "../services/accountService";

const AuthContext = createContext();

function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [profile, setProfile] = useState(null);
  // The user id whose profile request has settled (success or failure).
  // Derived below into isProfileLoading, so there is no render where a new
  // user's profile counts as loaded before its request has even started.
  const [profileSettledFor, setProfileSettledFor] = useState(null);
  const [avatarUrl, setAvatarUrl] = useState(null);

  useEffect(function () {
    let isMounted = true;
    let initialSessionHandled = false;

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!isMounted) return;
      setUser(session?.user ?? null);
      initialSessionHandled = true;
      setIsLoading(false);
    });

    async function loadInitialSession() {
      try {
        const {
          data: { session },
          error,
        } = await supabase.auth.getSession();
        if (error) throw error;
        if (!isMounted || initialSessionHandled) return;
        setUser(session?.user ?? null);
      } catch (error) {
        console.error("Failed to load session:", error.message);
      } finally {
        if (isMounted) setIsLoading(false);
      }
    }

    loadInitialSession();

    return function () {
      isMounted = false;
      subscription.unsubscribe();
    };
  }, []);

  const userId = user?.id;

  useEffect(
    function () {
      let isMounted = true;

      if (!userId) {
        setProfile(null);
        return;
      }

      setProfile(null);

      getProfile()
        .then((data) => {
          if (isMounted) setProfile(data);
        })
        .catch((error) => {
          console.error("Failed to load profile:", error.message);
        })
        .finally(() => {
          if (isMounted) setProfileSettledFor(userId);
        });

      return function () {
        isMounted = false;
      };
    },
    [userId],
  );

  const avatarPath = profile?.avatar_path;

  useEffect(
    function () {
      let isMounted = true;

      if (!avatarPath) {
        setAvatarUrl(null);
        return;
      }

      getAvatarSignedUrl(avatarPath)
        .then((url) => {
          if (isMounted) setAvatarUrl(url);
        })
        .catch((error) => {
          console.error("Failed to load avatar:", error.message);
        });

      return function () {
        isMounted = false;
      };
    },
    [avatarPath],
  );

  async function login(email, password) {
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    if (error) throw error;
  }

  async function signup(fullName, email, password) {
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { full_name: fullName },
        emailRedirectTo: `${window.location.origin}/login`,
      },
    });
    if (error) throw error;
    return data;
  }

  async function logout() {
    const { error } = await supabase.auth.signOut();
    if (error) throw error;
  }

  async function changePassword(currentPassword, newPassword) {
    if (profile?.role === "admin") {
      throw new Error("Contact your super admin for change of password.");
    }

    const { error: signInError } = await supabase.auth.signInWithPassword({
      email: user.email,
      password: currentPassword,
    });
    if (signInError) throw new Error("Current password is incorrect.");

    const { error } = await supabase.auth.updateUser({
      password: newPassword,
    });
    if (error) throw error;
  }

  async function updateProfile(updates) {
    if (profile?.role === "admin" && "full_name" in updates) {
      throw new Error("Contact your super admin for change of name.");
    }

    const data = await updateProfileApi(updates);
    setProfile(data);
    return data;
  }

  async function uploadAvatar(file) {
    const previousPath = profile?.avatar_path;

    const path = await uploadAvatarApi(file);
    const data = await updateProfileApi({ avatar_path: path });
    setProfile(data);

    if (previousPath && previousPath !== path) {
      try {
        await removeAvatarApi(previousPath);
      } catch (error) {
        console.error("Failed to remove previous avatar:", error.message);
      }
    }

    return data;
  }

  async function deleteAccount(currentPassword) {
    if (profile?.role === "admin") {
      throw new Error("Contact your super admin to delete this account.");
    }

    const { error: signInError } = await supabase.auth.signInWithPassword({
      email: user.email,
      password: currentPassword,
    });
    if (signInError) throw new Error("Current password is incorrect.");

    await deleteAccountApi();
    await supabase.auth.signOut();
  }

  async function removeAvatar() {
    const previousPath = profile?.avatar_path;

    const data = await updateProfileApi({ avatar_path: null });
    setProfile(data);

    if (previousPath) {
      try {
        await removeAvatarApi(previousPath);
      } catch (error) {
        console.error("Failed to remove avatar file:", error.message);
      }
    }

    return data;
  }

  return (
    <AuthContext.Provider
      value={{
        user,
        isAuthenticated: !!user,
        isLoading,
        profile,
        isProfileLoading: Boolean(userId) && profileSettledFor !== userId,
        isAdmin: profile?.role === "admin",
        isSuperAdmin: profile?.role === "super_admin",
        avatarUrl,
        login,
        signup,
        logout,
        changePassword,
        updateProfile,
        uploadAvatar,
        removeAvatar,
        deleteAccount,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined)
    throw new Error("AuthContext was used outside AuthProvider");
  return context;
}

export { AuthProvider, useAuth };
