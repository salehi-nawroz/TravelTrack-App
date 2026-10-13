// Main app sections, shared by the desktop tab bar (AppNav) and the mobile
// bottom bar (MobileNav) so both always offer the same routes. Paths are
// relative to /app.
export function getNavItems({ showAdmin = false, includeProfile = false }) {
  return [
    { id: "countries", to: "countries", label: "Countries" },
    // Adding a city lives on its own "form" route (not under /app/cities),
    // but it's conceptually part of the Cities section, so that item should
    // still read as selected while the add-city flow is open.
    { id: "cities", to: "cities", label: "Cities", alsoActiveOn: ["/app/form"] },
    { id: "trips", to: "trips", label: "Trips" },
    { id: "stats", to: "stats", label: "Stats" },
    showAdmin && { id: "admin", to: "admin", label: "Admin" },
    includeProfile && { id: "profile", to: "profile", label: "Profile" },
  ].filter(Boolean);
}

export function isItemActive(item, isActive, pathname) {
  return (
    isActive ||
    (item.alsoActiveOn ?? []).some((path) => pathname.startsWith(path))
  );
}

// Title for the mobile bottom sheet's header: the section the current route
// belongs to.
const SECTION_TITLES = [
  ["/app/form", "Add city"],
  ["/app/cities", "Cities"],
  ["/app/countries", "Countries"],
  ["/app/trips", "Trips"],
  ["/app/stats", "Stats"],
  ["/app/trash", "Trash"],
  ["/app/profile", "Profile"],
  ["/app/admin", "Admin"],
];

export function getSectionTitle(pathname) {
  return (
    SECTION_TITLES.find(([path]) => pathname.startsWith(path))?.[1] ??
    "TravelTrack"
  );
}
