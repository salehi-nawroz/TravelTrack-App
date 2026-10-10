import { NavLink, useLocation } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import styles from "./AppNav.module.css";
function AppNav() {
  const { isAdmin, isSuperAdmin } = useAuth();
  const location = useLocation();
  // Adding a city lives on its own "form" route (not under /app/cities), but
  // it's conceptually part of the Cities section, so that tab should still
  // read as selected while the add-city flow is open.
  const isAddCityFlow = location.pathname.startsWith("/app/form");

  return (
    <nav className={styles.nav}>
      <ul>
        <li>
          <NavLink to="countries"> Countries</NavLink>
        </li>
        <li>
          <NavLink
            to="cities"
            className={({ isActive }) =>
              isActive || isAddCityFlow ? "active" : ""
            }
          >
            {" "}
            Cities
          </NavLink>
        </li>
        <li>
          <NavLink to="trips"> Trips</NavLink>
        </li>
        <li>
          <NavLink to="stats"> Stats</NavLink>
        </li>
        {(isAdmin || isSuperAdmin) && (
          <li>
            <NavLink to="admin"> Admin</NavLink>
          </li>
        )}
      </ul>

      <NavLink to="form" className={styles.addCity}>
        + Add city
      </NavLink>
    </nav>
  );
}

export default AppNav;
