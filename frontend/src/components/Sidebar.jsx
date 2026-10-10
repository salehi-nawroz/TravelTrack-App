import { forwardRef } from "react";
import styles from "./Sidebar.module.css";
import AppNav from "./AppNav";
import Footer from "./Footer";
import GlobalSearch from "./GlobalSearch";
import Logo from "./Logo";
import { Outlet } from "react-router-dom";

// Width comes from AppLayout (user-resizable, always visible).
const Sidebar = forwardRef(function Sidebar({ width, isResizing }, ref) {
  return (
    <div
      ref={ref}
      className={`${styles.sidebar} ${isResizing ? styles.resizing : ""}`}
      style={{ "--sidebar-width": `${width}px` }}
    >
      <div className={styles.inner}>
        <Logo />
        <AppNav />
        <GlobalSearch />

        <div className={styles.outlet}>
          <Outlet />
        </div>
        <Footer />
      </div>
    </div>
  );
});

export default Sidebar;
