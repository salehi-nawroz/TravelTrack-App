import { NavLink, useLocation } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import { getNavItems, isItemActive } from "./navItems";
import styles from "./MobileNav.module.css";

// 24px line icons, drawn with currentColor so they follow the active state.
const ICON_PATHS = {
  countries: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18" />
    </>
  ),
  cities: (
    <>
      <path d="M12 21s-7-6.2-7-11.5a7 7 0 0 1 14 0C19 14.8 12 21 12 21Z" />
      <circle cx="12" cy="9.5" r="2.5" />
    </>
  ),
  trips: (
    <>
      <circle cx="6" cy="18" r="2.5" />
      <circle cx="18" cy="6" r="2.5" />
      <path d="M8.5 18H15a3 3 0 0 0 0-6H9a3 3 0 0 1 0-6h6.5" />
    </>
  ),
  stats: <path d="M5 20V11M12 20V4M19 20v-6" />,
  admin: (
    <>
      <path d="M12 3 4.5 6v5.5c0 4.6 3.2 8.4 7.5 9.5 4.3-1.1 7.5-4.9 7.5-9.5V6L12 3Z" />
      <path d="m9 12 2 2 4-4" />
    </>
  ),
  profile: (
    <>
      <circle cx="12" cy="8" r="4" />
      <path d="M4 21a8 8 0 0 1 16 0" />
    </>
  ),
};

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
              <svg
                className={styles.icon}
                viewBox="0 0 24 24"
                aria-hidden="true"
                focusable="false"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                {ICON_PATHS[item.id]}
              </svg>
              <span className={styles.label}>{item.label}</span>
            </NavLink>
          </li>
        ))}
      </ul>
    </nav>
  );
}

export default MobileNav;
