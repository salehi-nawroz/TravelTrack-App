import styles from "./Footer.module.css";

// `showCredits` adds the technology / AI-assistance line; only the public
// pages show it, not the app sidebar.
function Footer({ showCredits = false }) {
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
