import { Link } from "react-router-dom";
import PageNav from "../components/PageNav";
import { buttonClassName } from "../components/buttonClassName";
import styles from "./StatusPage.module.css";
import { useDocumentTitle } from "../hooks/useDocumentTitle";

export default function PageNotFound() {
  useDocumentTitle("Page not found");
  return (
    <main className={styles.page}>
      <PageNav />
      <section className={styles.content}>
        <p className={styles.eyebrow}>Error 404</p>
        <h1>This page doesn&apos;t exist</h1>
        <p className={styles.lead}>
          The link may be old or mistyped. Your cities and trips are safe.
        </p>
        <div className={styles.actions}>
          <Link to="/" className={buttonClassName()}>
            Go to the home page
          </Link>
          <Link to="/app" className={buttonClassName({ variant: "secondary" })}>
            Open your map
          </Link>
        </div>
      </section>
    </main>
  );
}
