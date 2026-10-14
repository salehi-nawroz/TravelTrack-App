import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import Button from "./Button";
import Card from "./Card";
import Field, { FormMessage } from "./Field";
import Spinner from "./Spinner";
import ConfirmDialog from "./ConfirmDialog";
import styles from "./Profile.module.css";

function Profile() {
  const {
    user,
    profile,
    updateProfile,
    avatarUrl,
    uploadAvatar,
    removeAvatar,
    changePassword,
    deleteAccount,
  } = useAuth();
  const navigate = useNavigate();

  const [fullName, setFullName] = useState(profile?.full_name || "");
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState("");
  const [successMessage, setSuccessMessage] = useState("");

  const [isUploadingAvatar, setIsUploadingAvatar] = useState(false);
  const [avatarError, setAvatarError] = useState("");

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [isChangingPassword, setIsChangingPassword] = useState(false);
  const [passwordError, setPasswordError] = useState("");
  const [passwordSuccess, setPasswordSuccess] = useState("");

  const [deletePassword, setDeletePassword] = useState("");
  const [isDeletingAccount, setIsDeletingAccount] = useState(false);
  const [deleteAccountError, setDeleteAccountError] = useState("");
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  useEffect(() => {
    setFullName(profile?.full_name || "");
  }, [profile]);

  async function handleSubmit(e) {
    e.preventDefault();
    if (isSaving) return;

    setError("");
    setSuccessMessage("");
    setIsSaving(true);
    try {
      await updateProfile({ full_name: fullName });
      setSuccessMessage("Profile updated.");
      setTimeout(() => navigate("/app"), 1200);
    } catch (err) {
      setError(err.message);
    } finally {
      setIsSaving(false);
    }
  }

  function handleCancel(e) {
    e.preventDefault();
    navigate("/app");
  }

  async function handleAvatarChange(e) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file || isUploadingAvatar) return;

    setAvatarError("");
    setIsUploadingAvatar(true);
    try {
      await uploadAvatar(file);
    } catch (err) {
      setAvatarError(err.message);
    } finally {
      setIsUploadingAvatar(false);
    }
  }

  async function handleRemoveAvatar(e) {
    e.preventDefault();
    if (isUploadingAvatar) return;

    setAvatarError("");
    setIsUploadingAvatar(true);
    try {
      await removeAvatar();
    } catch (err) {
      setAvatarError(err.message);
    } finally {
      setIsUploadingAvatar(false);
    }
  }

  async function handleChangePassword(e) {
    e.preventDefault();
    if (isChangingPassword) return;

    setPasswordError("");
    setPasswordSuccess("");

    if (newPassword.length < 6) {
      setPasswordError("New password must be at least 6 characters.");
      return;
    }
    if (newPassword !== confirmPassword) {
      setPasswordError("New passwords do not match.");
      return;
    }

    setIsChangingPassword(true);
    try {
      await changePassword(currentPassword, newPassword);
      setPasswordSuccess("Password updated.");
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      setTimeout(() => navigate("/app"), 1200);
    } catch (err) {
      setPasswordError(err.message);
    } finally {
      setIsChangingPassword(false);
    }
  }

  function handleDeleteAccountClick() {
    setDeleteAccountError("");
    if (!deletePassword) {
      setDeleteAccountError("Please enter your password to confirm.");
      return;
    }
    setShowDeleteConfirm(true);
  }

  async function handleConfirmDeleteAccount() {
    setShowDeleteConfirm(false);
    setIsDeletingAccount(true);
    setDeleteAccountError("");
    try {
      await deleteAccount(deletePassword);
      navigate("/");
    } catch (err) {
      setDeleteAccountError(err.message);
      setIsDeletingAccount(false);
    }
  }

  if (!user) return null;

  const displayName = profile?.full_name || user.email;
  const isAdmin = profile?.role === "admin";

  return (
    <div className={styles.profile}>
      <Card as="form" className={styles.form} onSubmit={handleSubmit}>
        <h2>Your profile</h2>

        <div className={styles.avatarRow}>
          <img
            src={avatarUrl || "/default-avatar.svg"}
            alt={user.email}
            className={styles.avatar}
          />
          <div>
            <p className={styles.name}>{displayName}</p>
            <p className={styles.email}>{user.email}</p>
            <div className={styles.avatarActions}>
              <label className={styles.avatarUpload}>
                {isUploadingAvatar ? "Uploading..." : "Change photo"}
                <input
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  onChange={handleAvatarChange}
                  disabled={isUploadingAvatar}
                  hidden
                />
              </label>
              {avatarUrl && (
                <Button
                  type="back"
                  onClick={handleRemoveAvatar}
                  disabled={isUploadingAvatar}
                >
                  Remove photo
                </Button>
              )}
            </div>
          </div>
        </div>

        {avatarError && (
          <FormMessage>{avatarError}</FormMessage>
        )}

        {!profile ? (
          <Spinner />
        ) : (
          <Field
            id="fullName"
            label="Full name"
            className={styles.row}
            hint={
              isAdmin ? "Contact your super admin for change of name." : null
            }
          >
            <input
              id="fullName"
              onChange={(e) => setFullName(e.target.value)}
              value={fullName}
              disabled={isAdmin}
            />
          </Field>
        )}

        {error && <FormMessage>{error}</FormMessage>}
        {successMessage && (
          <FormMessage tone="success">{successMessage}</FormMessage>
        )}

        <div className={styles.buttons}>
          <Button
            type="primary"
            disabled={isSaving || !!successMessage || isAdmin}
          >
            {isSaving ? "Saving..." : "Save"}
          </Button>
          <Button
            type="back"
            onClick={handleCancel}
            disabled={isSaving || !!successMessage}
          >
            Cancel
          </Button>
        </div>
      </Card>

      {profile?.role === "admin" ? (
        <Card className={styles.form}>
          <h2>Change password</h2>
          <p>Contact your super admin for change of password.</p>
        </Card>
      ) : (
        <Card as="form" className={styles.form} onSubmit={handleChangePassword}>
          <h2>Change password</h2>

          <Field id="currentPassword" label="Current password" className={styles.row}>
            <input
              type="password"
              id="currentPassword"
              autoComplete="current-password"
              onChange={(e) => setCurrentPassword(e.target.value)}
              value={currentPassword}
            />
          </Field>

          <Field id="newPassword" label="New password" className={styles.row}>
            <input
              type="password"
              id="newPassword"
              autoComplete="new-password"
              onChange={(e) => setNewPassword(e.target.value)}
              value={newPassword}
            />
          </Field>

          <Field id="confirmPassword" label="Confirm new password" className={styles.row}>
            <input
              type="password"
              id="confirmPassword"
              autoComplete="new-password"
              onChange={(e) => setConfirmPassword(e.target.value)}
              value={confirmPassword}
            />
          </Field>

          {passwordError && (
            <FormMessage>{passwordError}</FormMessage>
          )}
          {passwordSuccess && (
            <FormMessage tone="success">{passwordSuccess}</FormMessage>
          )}

          <div className={styles.buttons}>
            <Button
              type="primary"
              disabled={isChangingPassword || !!passwordSuccess}
            >
              {isChangingPassword ? "Updating..." : "Update password"}
            </Button>
          </div>
        </Card>
      )}

      {isAdmin ? (
        <Card className={`${styles.form} ${styles.dangerZone}`}>
          <h2>Danger zone</h2>
          <p>Contact your super admin to delete this account.</p>
        </Card>
      ) : (
        <Card className={`${styles.form} ${styles.dangerZone}`}>
          <h2>Danger zone</h2>
          <p className={styles.dangerText}>
            Permanently delete your account, including your cities and
            profile data. This cannot be undone.
          </p>

          <Field id="deletePassword" label="Confirm your password" className={styles.row}>
            <input
              type="password"
              id="deletePassword"
              autoComplete="current-password"
              onChange={(e) => setDeletePassword(e.target.value)}
              value={deletePassword}
              disabled={isDeletingAccount}
            />
          </Field>

          {deleteAccountError && (
            <FormMessage>{deleteAccountError}</FormMessage>
          )}

          <div>
            <Button
              type="back"
              onClick={handleDeleteAccountClick}
              disabled={isDeletingAccount}
            >
              {isDeletingAccount ? "Deleting..." : "Delete my account"}
            </Button>
          </div>
        </Card>
      )}

      {showDeleteConfirm && (
        <ConfirmDialog
          title="Delete your account?"
          message="Are you sure you want to permanently delete your account? All your cities and profile data will be deleted."
          confirmLabel="Delete account"
          onConfirm={handleConfirmDeleteAccount}
          onCancel={() => setShowDeleteConfirm(false)}
        />
      )}
    </div>
  );
}

export default Profile;
