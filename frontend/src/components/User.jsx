import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import styles from "./User.module.css";

// variant "floating": the desktop/tablet card over the map (hidden on phones).
// variant "inline": the same identity + logout row inside the mobile bottom
// sheet (shown on phones only), so logout stays reachable there.
function User({ variant = "floating" }) {
  const { user, profile, avatarUrl, logout } = useAuth();
  const navigate = useNavigate();

  async function handleClick() {
    try {
      await logout();
      navigate("/");
    } catch (err) {
      console.error("Failed to log out:", err.message);
    }
  }

  if (!user) return null;

  const displayName = profile?.full_name || user.email;

  return (
    <div className={variant === "inline" ? styles.inline : styles.user}>
      <Link to="/app/profile" className={styles.identity}>
        <img src={avatarUrl || "/default-avatar.svg"} alt={user.email} />
        <span>{displayName}</span>
      </Link>
      <button
        type="button"
        className={styles.logoutBtn}
        onClick={handleClick}
      >
        Logout
      </button>
    </div>
  );
}

export default User;
