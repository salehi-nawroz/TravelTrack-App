// This component is used in the Admin page to list all trips that the current admin can see. It supports searching, filtering, sorting, and pagination. Admins can also delete trips they have permission to manage.
import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import adminStyles from "../pages/Admin.module.css";
import styles from "./AdminTrips.module.css";
import Button from "./Button";
import Card from "./Card";
import ConfirmDialog from "./ConfirmDialog";
import EmptyState from "./EmptyState";
import Field, { FormMessage } from "./Field";
import CollapsibleFilters from "./CollapsibleFilters";
import Pagination from "./Pagination";
import Spinner from "./Spinner";
import TripStatusBadge from "./TripStatusBadge";
import { buttonClassName } from "./buttonClassName";
import { usePagination } from "../hooks/usePagination";
import { deleteTrip } from "../services/tripService";
import { compareIsoDates, formatTripRange } from "../utils/tripDates";
import { canManageTrip } from "../utils/tripPermissions";

const TRIPS_PAGE_SIZE = 10;

const ROLE_LABELS = {
  user: "User",
  admin: "Admin",
  super_admin: "Super Admin",
};

const SORT_OPTIONS = [
  { value: "startNewest", label: "Start date newest first" },
  { value: "startOldest", label: "Start date oldest first" },
  { value: "titleAsc", label: "Title A-Z" },
  { value: "ownerAsc", label: "Owner A-Z" },
  { value: "updatedNewest", label: "Recently updated" },
];

const plural = (count, word, words = `${word}s`) =>
  `${count} ${count === 1 ? word : words}`;

// Admin -> Trips. `trips` holds every trip RLS lets this admin see (a plain
// admin never receives a super admin's trips at all); `profiles` supplies
// owner names and roles. Opening a trip goes to its own page, where the
// same itinerary and photo tools are available to permitted admins.
function AdminTrips({
  trips,
  isLoading,
  error,
  onRetry,
  onTripDeleted,
  profiles,
  viewer,
}) {
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [ownerFilter, setOwnerFilter] = useState("");
  const [countryFilter, setCountryFilter] = useState("");
  const [sortOption, setSortOption] = useState("startNewest");

  const [pendingDelete, setPendingDelete] = useState(null);
  const [deletingId, setDeletingId] = useState(null);
  const [deleteError, setDeleteError] = useState("");
  const [announcement, setAnnouncement] = useState("");

  const profileById = useMemo(
    () => Object.fromEntries(profiles.map((p) => [p.id, p])),
    [profiles],
  );
  const ownerName = (userId) =>
    profileById[userId]?.full_name || "Unknown user";

  const ownerOptions = useMemo(() => {
    const ids = [...new Set(trips.map((trip) => trip.userId))];
    return ids
      .map((id) => ({ id, name: profileById[id]?.full_name || "Unknown user" }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [trips, profileById]);

  const countryOptions = useMemo(
    () =>
      [
        ...new Set(
          trips.flatMap((trip) => trip.destinations.map((d) => d.country)),
        ),
      ].sort((a, b) => a.localeCompare(b)),
    [trips],
  );

  const activeControlCount = [
    searchQuery.trim(),
    statusFilter,
    ownerFilter,
    countryFilter,
    sortOption !== "startNewest",
  ].filter(Boolean).length;
  const hasActiveControls = activeControlCount > 0;

  // Pipeline: raw trips -> search -> filters -> sort; pagination slices the
  // result. The raw `trips` prop is never mutated.
  const processedTrips = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();

    const result = trips.filter((trip) => {
      if (statusFilter && trip.status !== statusFilter) return false;
      if (ownerFilter && trip.userId !== ownerFilter) return false;
      if (
        countryFilter &&
        !trip.destinations.some((d) => d.country === countryFilter)
      )
        return false;
      if (!query) return true;

      return [
        trip.title,
        trip.description,
        profileById[trip.userId]?.full_name ?? "",
        ...trip.destinations.flatMap((d) => [d.cityName, d.country]),
      ].some((field) => field.toLowerCase().includes(query));
    });

    const name = (trip) =>
      profileById[trip.userId]?.full_name || "Unknown user";
    return result.sort((a, b) => {
      switch (sortOption) {
        case "startOldest":
          return compareIsoDates(a.startDate, b.startDate);
        case "titleAsc":
          return a.title.localeCompare(b.title);
        case "ownerAsc":
          return (
            name(a).localeCompare(name(b)) || a.title.localeCompare(b.title)
          );
        case "updatedNewest":
          return compareIsoDates(b.updatedAt, a.updatedAt);
        default:
          return compareIsoDates(b.startDate, a.startDate);
      }
    });
  }, [
    trips,
    searchQuery,
    statusFilter,
    ownerFilter,
    countryFilter,
    sortOption,
    profileById,
  ]);

  const { currentPage, totalPages, startIndex, endIndex, goToPage, resetPage } =
    usePagination(processedTrips.length, TRIPS_PAGE_SIZE);

  useEffect(() => {
    resetPage();
  }, [
    searchQuery,
    statusFilter,
    ownerFilter,
    countryFilter,
    sortOption,
    resetPage,
  ]);

  function handleClearFilters() {
    setSearchQuery("");
    setStatusFilter("");
    setOwnerFilter("");
    setCountryFilter("");
    setSortOption("startNewest");
  }

  async function handleConfirmDelete() {
    const trip = pendingDelete;
    setPendingDelete(null);
    setDeleteError("");
    setDeletingId(trip.id);
    try {
      await deleteTrip(trip, viewer.id);
      onTripDeleted(trip.id);
      setAnnouncement(`Deleted "${trip.title}".`);
    } catch (err) {
      setDeleteError(`Couldn't delete "${trip.title}": ${err.message}`);
      // Some photos may already be gone; reload so the list is accurate.
      onRetry();
    } finally {
      setDeletingId(null);
    }
  }

  const pageTrips = processedTrips.slice(startIndex, endIndex);

  return (
    <Card
      as="section"
      className={adminStyles.section}
      id="admin-panel-trips"
      role="tabpanel"
      aria-labelledby="admin-tab-trips"
    >
      <h3 className={adminStyles.sectionTitle}>
        Trips
        {!isLoading && !error && (
          <span className={adminStyles.count}>({trips.length})</span>
        )}
      </h3>

      {deleteError && <FormMessage>{deleteError}</FormMessage>}
      <p className={styles.srOnly} role="status">
        {announcement}
      </p>

      {isLoading ? (
        <Spinner label="Loading trips…" />
      ) : error ? (
        <EmptyState
          tone="error"
          title="Couldn't load trips"
          message={error}
          action={
            <Button
              variant="outline"
              size="sm"
              htmlType="button"
              onClick={onRetry}
            >
              Try again
            </Button>
          }
        />
      ) : !trips.length ? (
        <EmptyState icon="trips" title="No trips yet" />
      ) : (
        <>
          <div className={adminStyles.toolbar}>
            <CollapsibleFilters activeCount={activeControlCount}>
              <Field variant="toolbar" id="adminTripSearch" label="Search">
                <input
                  id="adminTripSearch"
                  type="text"
                  placeholder="Search titles, owners, cities or countries..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
              </Field>

              <Field variant="toolbar" id="adminTripStatus" label="Status">
                <select
                  id="adminTripStatus"
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value)}
                >
                  <option value="">All statuses</option>
                  <option value="active">Active</option>
                  <option value="completed">Completed</option>
                </select>
              </Field>

              <Field variant="toolbar" id="adminTripOwner" label="Owner">
                <select
                  id="adminTripOwner"
                  value={ownerFilter}
                  onChange={(e) => setOwnerFilter(e.target.value)}
                >
                  <option value="">All owners</option>
                  {ownerOptions.map((option) => (
                    <option key={option.id} value={option.id}>
                      {option.name}
                    </option>
                  ))}
                </select>
              </Field>

              <Field variant="toolbar" id="adminTripCountry" label="Country">
                <select
                  id="adminTripCountry"
                  value={countryFilter}
                  onChange={(e) => setCountryFilter(e.target.value)}
                >
                  <option value="">All countries</option>
                  {countryOptions.map((country) => (
                    <option key={country} value={country}>
                      {country}
                    </option>
                  ))}
                </select>
              </Field>

              <Field variant="toolbar" id="adminTripSort" label="Sort">
                <select
                  id="adminTripSort"
                  value={sortOption}
                  onChange={(e) => setSortOption(e.target.value)}
                >
                  {SORT_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </Field>
            </CollapsibleFilters>

            <div className={adminStyles.toolbarResult}>
              <span className={adminStyles.toolbarCount}>
                {hasActiveControls
                  ? `${processedTrips.length} of ${trips.length} trips`
                  : plural(trips.length, "trip")}
              </span>
              {hasActiveControls && (
                <Button
                  variant="outline"
                  size="sm"
                  htmlType="button"
                  onClick={handleClearFilters}
                >
                  Clear
                </Button>
              )}
            </div>
          </div>

          {!processedTrips.length ? (
            <EmptyState
              compact
              title="No trips match your filters."
              action={
                <Button
                  variant="outline"
                  size="sm"
                  htmlType="button"
                  onClick={handleClearFilters}
                >
                  Clear filters
                </Button>
              }
            />
          ) : (
            <ul className={styles.list}>
              {pageTrips.map((trip) => {
                const ownerRole = profileById[trip.userId]?.role;
                const canManage = canManageTrip(trip, viewer, ownerRole);
                const isDeleting = deletingId === trip.id;

                return (
                  <li key={trip.id} className={styles.row}>
                    <div className={styles.rowMain}>
                      <div className={styles.rowTitle}>
                        <Link
                          to={`/app/trips/${trip.id}`}
                          state={{ from: "/app/admin?tab=trips" }}
                          className={styles.titleLink}
                        >
                          {trip.title}
                        </Link>
                        <TripStatusBadge status={trip.status} />
                      </div>
                      <p className={styles.rowMeta}>
                        <span>
                          {ownerName(trip.userId)}
                          {ownerRole && (
                            <span
                              className={`${adminStyles.role} ${adminStyles[`role-${ownerRole}`] || ""}`}
                            >
                              {" "}
                              {ROLE_LABELS[ownerRole] ?? ownerRole}
                            </span>
                          )}
                        </span>
                        <span aria-hidden="true">·</span>
                        <span>
                          {formatTripRange(trip.startDate, trip.endDate)}
                        </span>
                      </p>
                      <p className={styles.rowMeta}>
                        {plural(trip.destinations.length, "destination")}
                        <span aria-hidden="true">·</span>
                        {plural(trip.photos.length, "photo")}
                      </p>
                    </div>

                    <div className={adminStyles.actions}>
                      <Link
                        to={`/app/trips/${trip.id}`}
                        state={{ from: "/app/admin?tab=trips" }}
                        className={buttonClassName({
                          variant: "ghost",
                          size: "sm",
                        })}
                        aria-label={`Open ${trip.title}`}
                      >
                        {canManage ? "Open / edit" : "Open"}
                      </Link>
                      {canManage && (
                        <Button
                          variant="ghost"
                          size="sm"
                          htmlType="button"
                          className={styles.delete}
                          onClick={() => setPendingDelete(trip)}
                          disabled={Boolean(deletingId)}
                          aria-label={`Delete ${trip.title}, owned by ${ownerName(trip.userId)}`}
                        >
                          {isDeleting ? "Deleting…" : "Delete"}
                        </Button>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}

          {totalPages > 1 && (
            <div className={adminStyles.paginationWrapper}>
              <p className={adminStyles.pageInfo}>
                Page {currentPage} of {totalPages}
              </p>
              <Pagination
                currentPage={currentPage}
                totalPages={totalPages}
                totalItems={processedTrips.length}
                onPageChange={goToPage}
              />
            </div>
          )}
        </>
      )}

      {pendingDelete && (
        <ConfirmDialog
          title="Delete trip?"
          message={
            <>
              Permanently delete <strong>{pendingDelete.title}</strong> (
              {formatTripRange(pendingDelete.startDate, pendingDelete.endDate)}
              ), owned by <strong>{ownerName(pendingDelete.userId)}</strong>?
              Its {plural(pendingDelete.destinations.length, "destination")} and{" "}
              {plural(pendingDelete.photos.length, "photo")} are deleted too.
            </>
          }
          warning="This can't be undone. The owner's Cities aren't affected."
          confirmLabel="Delete trip"
          onConfirm={handleConfirmDelete}
          onCancel={() => setPendingDelete(null)}
        />
      )}
    </Card>
  );
}

export default AdminTrips;
