import { Link } from "react-router-dom";
import styles from "./Logo.module.css";

function Logo() {
  return (
    <Link to="/" className={styles.link}>
      <span className={styles.logo} aria-label="TravelTrack home">
        <img src="/logo-mark.svg" alt="" className={styles.icon} />
        <span className={styles.wordmark}>
          Travel<span className={styles.accent}>Track</span>
        </span>
      </span>
    </Link>
  );
}

export default Logo;
