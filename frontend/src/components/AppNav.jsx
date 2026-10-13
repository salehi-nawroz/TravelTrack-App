import { NavLink, useLocation } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import { getNavItems, isItemActive } from "./navItems";
import styles from "./AppNav.module.css";

// Desktop/tablet section tabs. On phones the same sections are offered by
// MobileNav instead (see navItems.js for the shared list).
function AppNav() {
  const { isAdmin, isSuperAdmin } = useAuth();
  const { pathname } = useLocation();
  const items = getNavItems({ showAdmin: isAdmin || isSuperAdmin });

  return (
    <nav className={styles.nav} aria-label="Sections">
      <ul>
        {items.map((item) => (
          <li key={item.id}>
            <NavLink
              to={item.to}
              className={({ isActive }) =>
                isItemActive(item, isActive, pathname) ? "active" : ""
              }
            >
              {item.label}
            </NavLink>
          </li>
        ))}
      </ul>

      {/* Primary action: outside the scrolling content area, so it stays in
          view however long the current list is. */}
      <NavLink to="form" className={styles.addCity}>
        <svg
          className={styles.addCityIcon}
          viewBox="0 0 24 24"
          aria-hidden="true"
          focusable="false"
        >
          <path
            d="M12 5v14M5 12h14"
            stroke="currentColor"
            strokeWidth="2.6"
            strokeLinecap="round"
          />
        </svg>
        Add city
      </NavLink>
    </nav>
  );
}

export default AppNav;
