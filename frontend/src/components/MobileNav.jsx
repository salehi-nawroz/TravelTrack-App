import { NavLink, useLocation } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import { getNavItems, isItemActive } from "./navItems";
import NavIcon from "./NavIcon";
import styles from "./MobileNav.module.css";

// Phone-only bottom bar (shown below 768px by its CSS). Picking a section
// also opens the bottom sheet, via onNavigate, so its content is visible.
function MobileNav({ onNavigate }) {
  const { isAdmin, isSuperAdmin } = useAuth();
  const { pathname } = useLocation();
  const items = getNavItems({
    showAdmin: isAdmin || isSuperAdmin,
    includeProfile: true,
  });

  return (
    <nav className={styles.mobileNav} aria-label="Sections">
      <ul>
        {items.map((item) => (
          <li key={item.id}>
            <NavLink
              to={item.to}
              onClick={onNavigate}
              className={({ isActive }) =>
                `${styles.item} ${
                  isItemActive(item, isActive, pathname) ? styles.active : ""
                }`
              }
            >
              <NavIcon id={item.id} className={styles.icon} />
              <span className={styles.label}>{item.label}</span>
            </NavLink>
          </li>
        ))}
      </ul>
    </nav>
  );
}

export default MobileNav;
