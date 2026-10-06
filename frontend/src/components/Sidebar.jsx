import styles from "./Sidebar.module.css";
import AppNav from "./AppNav";
import Footer from "./Footer";
import GlobalSearch from "./GlobalSearch";
import Logo from "./Logo";
import { Outlet } from "react-router-dom";
function Sidebar() {
  return (
    <div className={styles.sidebar}>
      <Logo />
      <AppNav />
      <GlobalSearch />

      <div className={styles.outlet}>
        <Outlet />
      </div>
      <Footer />
    </div>
  );
}

export default Sidebar;
