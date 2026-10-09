import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import styles from "./User.module.css";

function User() {
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
    <div className={styles.user}>
      <Link to="/app/profile" className={styles.identity}>
        <img src={avatarUrl || "/default-avatar.svg"} alt={user.email} />
        <span>{displayName}</span>
      </Link>
      <button className={styles.logoutBtn} onClick={handleClick}>
        Logout
      </button>
    </div>
  );
}

export default User;
