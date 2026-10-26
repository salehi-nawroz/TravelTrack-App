import { useEffect, useState } from "react";
import { NavLink, useLocation } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import { getNavItems, isItemActive } from "./navItems";
import NavIcon from "./NavIcon";
import styles from "./AppNav.module.css";

// Collapsed/expanded preference: per browser only, so blocked storage just
// means it starts expanded.
const COLLAPSED_KEY = "traveltrack:navCollapsed";

function readCollapsed() {
  try {
    return localStorage.getItem(COLLAPSED_KEY) === "true";
  } catch {
    return false;
  }
}

// Desktop/tablet sidebar navigation: a vertical list of the main sections,
// then (admins only) a separate "Management" group. It can be collapsed to a
// single row of icon-only links (labels become tooltips) to give the content
// below more height. The state survives moving between sections - AppNav
// stays mounted - and reloads. On phones the same sections are offered by
// MobileNav instead (see navItems.js).
function AppNav() {
  const { isAdmin, isSuperAdmin } = useAuth();
  const { pathname } = useLocation();
  const [isCollapsed, setIsCollapsed] = useState(readCollapsed);
  const items = getNavItems({ showAdmin: isAdmin || isSuperAdmin });
  const mainItems = items.filter((item) => !item.group);
  const managementItems = items.filter((item) => item.group === "management");

  useEffect(() => {
    try {
      localStorage.setItem(COLLAPSED_KEY, String(isCollapsed));
    } catch {
      // ignore
    }
  }, [isCollapsed]);

  function renderItems(list) {
    return list.map((item) => (
      <li key={item.id}>
        <NavLink
          to={item.to}
          className={({ isActive }) =>
            `${styles.link} ${
              isItemActive(item, isActive, pathname) ? "active" : ""
            }`
          }
        >
          <NavIcon id={item.id} className={styles.icon} />
          {/* Visible label when expanded; when collapsed it becomes the
              hover/focus tooltip and still gives the link its name. */}
          <span className={styles.label}>{item.label}</span>
        </NavLink>
      </li>
    ));
  }

  return (
    <nav
      className={`${styles.nav} ${isCollapsed ? styles.collapsed : ""}`}
      aria-label="Sections"
    >
      <button
        type="button"
        className={styles.toggle}
        onClick={() => setIsCollapsed((collapsed) => !collapsed)}
        aria-expanded={!isCollapsed}
        aria-controls="app-nav-sections"
      >
        <span>Sections</span>
        <svg
          className={styles.chevron}
          viewBox="0 0 24 24"
          aria-hidden="true"
          focusable="false"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="m6 9 6 6 6-6" />
        </svg>
        <span className={styles.srOnly}>
          {isCollapsed ? "(show labels)" : "(icons only)"}
        </span>
      </button>

      <div id="app-nav-sections" className={styles.sections}>
        <ul className={styles.list}>{renderItems(mainItems)}</ul>

        {managementItems.length > 0 && (
          <div className={styles.group}>
            <p className={styles.groupLabel} id="nav-management-label">
              Management
            </p>
            <ul
              className={styles.list}
              aria-labelledby="nav-management-label"
            >
              {renderItems(managementItems)}
            </ul>
          </div>
        )}
      </div>
    </nav>
  );
}

export default AppNav;
