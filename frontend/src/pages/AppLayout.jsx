import Map from "../components/Map";
import Sidebar from "../components/Sidebar";
import User from "../components/User";
import {
  useResizableSidebar,
  SIDEBAR_MIN_WIDTH,
} from "../hooks/useResizableSidebar";
import styles from "./AppLayout.module.css";

function AppLayout() {
  const { width, isResizing, sidebarRef, handleProps } = useResizableSidebar();

  return (
    <div className={styles.app}>
      <Sidebar ref={sidebarRef} width={width} isResizing={isResizing} />

      <div
        className={`${styles.resizeHandle} ${isResizing ? styles.resizing : ""}`}
        role="separator"
        aria-orientation="vertical"
        aria-label="Resize sidebar"
        aria-valuenow={width}
        aria-valuemin={SIDEBAR_MIN_WIDTH}
        tabIndex={0}
        title="Drag to resize, double-click to reset"
        {...handleProps}
      />

      <Map />
      <User />
    </div>
  );
}

export default AppLayout;
