import { useContext } from "react";
import { AuthContext } from "../contexts/authContextObject";
import styles from "./Footer.module.css";

// `showCredits` adds the technology / AI-assistance line on the public
// pages. Hidden for signed-in users. Reads the context directly rather than
// through useAuth so it also renders outside AuthProvider (signed out).
function Footer({ showCredits = false }) {
  const auth = useContext(AuthContext);
  if (auth?.isAuthenticated) return null;

  return (
    <footer className={styles.footer}>
      <p className={styles.copyright}>
        &copy; Copyright {new Date().getUTCFullYear()} by TravelTrack Inc.
      </p>
      {showCredits && (
        <p className={styles.credits}>
          Built with React, Supabase and Leaflet, with AI-assisted development
          using Claude Code.
        </p>
      )}
    </footer>
  );
}

export default Footer;
