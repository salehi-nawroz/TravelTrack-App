import styles from "./PageHeader.module.css";

// Shared heading for each sidebar page.
//   title:   page title (rendered as an h2; the sidebar has no h1)
//   summary: optional one-line figure under the title (e.g. "3 trips")
//   note:    optional smaller explanatory line
//   actions: optional element(s) shown on the right - e.g. a Back button
function PageHeader({ title, summary, note, actions }) {
  return (
    <header className={styles.header}>
      <div className={styles.text}>
        <h2 className={styles.title}>{title}</h2>
        {summary && <p className={styles.summary}>{summary}</p>}
        {note && <p className={styles.note}>{note}</p>}
      </div>
      {actions && <div className={styles.actions}>{actions}</div>}
    </header>
  );
}

export default PageHeader;
