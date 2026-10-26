import { useEffect, useRef, useState } from "react";
import { NavLink, useLocation, useSearchParams } from "react-router-dom";
import Map from "../components/Map";
import MobileNav from "../components/MobileNav";
import Sidebar from "../components/Sidebar";
import { isCitiesSection } from "../components/navItems";
import User from "../components/User";
import { useTripMap } from "../contexts/tripMapContext";
import {
  useResizableSidebar,
  SIDEBAR_MIN_WIDTH,
} from "../hooks/useResizableSidebar";
import styles from "./AppLayout.module.css";

// Layout by screen width (see AppLayout/Sidebar/MobileNav CSS):
// - desktop >= 1100px and tablet 768-1099px: resizable sidebar + map, with
//   the floating user card over the map;
// - phones < 768px: full-height map, the sidebar as a bottom sheet, a
//   bottom nav bar and a floating Add city button. The sheet state below is
//   only used by that phone layout.
function AppLayout() {
  const { width, isResizing, sidebarRef, handleProps } = useResizableSidebar();
  const { pathname } = useLocation();
  const [searchParams] = useSearchParams();
  const isSelectingLocation = searchParams.get("selectLocation") === "true";
  const pickedLat = searchParams.get("lat");

  // Starts collapsed so the map is the first thing seen on a phone.
  const [isSheetExpanded, setIsSheetExpanded] = useState(false);
  const lastRef = useRef({ pathname, pickedLat });

  useEffect(() => {
    // "Pick on map" (from the city form): get the sheet out of the way until
    // a point is tapped, then bring the form back with it filled in.
    if (isSelectingLocation) {
      setIsSheetExpanded(Boolean(pickedLat));
      return;
    }

    // Any other move to a new page (map click, popup link, search result),
    // or a new point picked while already on the form, shows the content.
    // "/app" itself only redirects to the default tab, which shouldn't open
    // the sheet on first load.
    const last = lastRef.current;
    lastRef.current = { pathname, pickedLat };
    const isInitialRedirect = last.pathname === "/app";
    const hasMoved =
      last.pathname !== pathname ||
      (pickedLat !== null && pickedLat !== last.pickedLat);
    if (hasMoved && !isInitialRedirect) setIsSheetExpanded(true);
  }, [pathname, isSelectingLocation, pickedLat]);

  // Trip itinerary <-> map (phones): showing a stop or the route on the map
  // gets the sheet out of the way; "Show in itinerary" from a map popup
  // brings it back. Larger screens show both side by side already.
  const { focusRequest, revealRequest } = useTripMap();
  useEffect(() => {
    if (focusRequest && window.matchMedia?.("(max-width: 767.98px)").matches) {
      setIsSheetExpanded(false);
    }
  }, [focusRequest]);
  useEffect(() => {
    if (revealRequest) setIsSheetExpanded(true);
  }, [revealRequest]);

  const expandSheet = () => setIsSheetExpanded(true);

  // The add-city form and the edit-city form (including "pick on map").
  const isCityForm =
    pathname.startsWith("/app/form") ||
    /^\/app\/cities\/[^/]+\/edit/.test(pathname);

  return (
    <div className={styles.app}>
      <Sidebar
        ref={sidebarRef}
        width={width}
        isResizing={isResizing}
        isSheetExpanded={isSheetExpanded}
        onToggleSheet={() => setIsSheetExpanded((expanded) => !expanded)}
      />

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

      {/* Phones only: same /app/form route as the sidebar's Add city button,
          and like it only in the Cities section. Sits above the map's zoom
          buttons while the sheet is collapsed and at the sheet's
          bottom-right while it's open (CSS). Not shown on the add/edit form
          itself, where it would only reset the form. */}
      {isCitiesSection(pathname) && (
        <NavLink
          to="form"
          onClick={expandSheet}
          className={[
            styles.fab,
            isSheetExpanded ? styles.fabOverSheet : "",
            isCityForm ? styles.fabHidden : "",
          ].join(" ")}
          aria-label="Add city"
          title="Add city"
        >
          <svg
            viewBox="0 0 24 24"
            aria-hidden="true"
            focusable="false"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.6"
            strokeLinecap="round"
          >
            <path d="M12 5v14M5 12h14" />
          </svg>
        </NavLink>
      )}

      <MobileNav onNavigate={expandSheet} />
    </div>
  );
}

export default AppLayout;
