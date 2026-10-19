import styles from "./StatusPage.module.css";

// Shown by main.jsx instead of the app when the Supabase configuration is
// missing or unsafe. Names the variables, never their values. No router or
// Supabase here: neither can work without the configuration.
export default function ConfigError({ problems }) {
  return (
    <main className={styles.page}>
      <section className={styles.content} aria-labelledby="config-error-title">
        <p className={styles.eyebrow}>Setup needed</p>
        <h1 id="config-error-title">TravelTrack isn&apos;t configured yet</h1>
        <p className={styles.lead}>
          This deployment is missing its Supabase settings, so the app can&apos;t
          start.
        </p>
        <ul className={styles.problems}>
          {problems.map((problem) => (
            <li key={problem}>{problem}</li>
          ))}
        </ul>
        <p className={styles.lead}>
          Set <code>VITE_SUPABASE_URL</code> and{" "}
          <code>VITE_SUPABASE_ANON_KEY</code> (see <code>.env.example</code>),
          then rebuild and redeploy.
        </p>
      </section>
    </main>
  );
}
