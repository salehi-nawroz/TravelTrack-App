import { forwardRef } from "react";
import { Outlet, useLocation } from "react-router-dom";
import styles from "./Sidebar.module.css";
import AppNav from "./AppNav";
import Footer from "./Footer";
import GlobalSearch from "./GlobalSearch";
import Logo from "./Logo";
import User from "./User";
import { getSectionTitle } from "./navItems";
import { useDocumentTitle } from "../hooks/useDocumentTitle";

// Desktop/tablet: the resizable panel beside the map (width from AppLayout).
// Phones (< 768px, Sidebar.module.css): the same panel becomes a bottom
// sheet above MobileNav. Its header button expands/collapses it; collapsed,
// only the header shows and the map above stays fully usable. The content
// stays mounted either way, so forms keep their state.
const Sidebar = forwardRef(function Sidebar(
  { width, isResizing, isSheetExpanded, onToggleSheet },
  ref,
) {
  const { pathname } = useLocation();
  const isProfile = pathname.startsWith("/app/profile");
  const sectionTitle = getSectionTitle(pathname);
  useDocumentTitle(sectionTitle);

  return (
    <div
      ref={ref}
      className={[
        styles.sidebar,
        isResizing ? styles.resizing : "",
        isSheetExpanded ? styles.sheetExpanded : styles.sheetCollapsed,
      ].join(" ")}
      style={{ "--sidebar-width": `${width}px` }}
    >
      {/* The page's one h1, for screen-reader navigation; the visible
          section names are in the nav and the phone sheet header. Outside
          #sidebar-content so a collapsed sheet doesn't hide it. */}
      <h1 className={styles.srOnly}>{sectionTitle}</h1>

      {/* Phones only (hidden by CSS on larger screens). */}
      <button
        type="button"
        className={styles.sheetHeader}
        onClick={onToggleSheet}
        aria-expanded={isSheetExpanded}
        aria-controls="sidebar-content"
      >
        <span className={styles.grabber} aria-hidden="true" />
        <span className={styles.sheetTitle}>{sectionTitle}</span>
        <span className={styles.sheetHint}>
          {isSheetExpanded ? "Hide" : "Show"}
          <svg
            className={styles.chevron}
            viewBox="0 0 24 24"
            aria-hidden="true"
            focusable="false"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.4"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="m6 15 6-6 6 6" />
          </svg>
        </span>
      </button>

      <div id="sidebar-content" className={styles.inner}>
        {/* Logo and section tabs: desktop/tablet only; on phones the bottom
            bar and floating Add city button replace them. */}
        <div className={styles.desktopOnly}>
          <Logo />
          <AppNav />
        </div>

        {/* Profile/logout on phones, where the floating user card over the
            map is hidden. */}
        {isProfile && <User variant="inline" />}

        <GlobalSearch />

        <div className={styles.outlet}>
          <Outlet />
        </div>

        <div className={styles.desktopOnly}>
          <Footer />
        </div>
      </div>
    </div>
  );
});

export default Sidebar;
