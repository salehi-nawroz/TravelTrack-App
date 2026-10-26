import { useEffect, useMemo, useRef, useState } from "react";
import { Link, Navigate, useSearchParams } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import { getAllProfiles, getAdminUsers } from "../services/profileService";
import { getCities, deleteCity as deleteCityApi } from "../services/cityService";
import { getAllTrips } from "../services/tripService";
import { getContinent } from "../utils/continent";
import { compareDates } from "../utils/compareDates";
import { usePagination } from "../hooks/usePagination";
import Spinner from "../components/Spinner";
import EmptyState from "../components/EmptyState";
import ConfirmDialog from "../components/ConfirmDialog";
import FlagBox from "../components/FlagBox";
import Pagination from "../components/Pagination";
import AdminUsers from "../components/AdminUsers";
import AdminTrips from "../components/AdminTrips";
import styles from "./Admin.module.css";
import Button from "../components/Button";
import Card from "../components/Card";
import Field, { FormMessage } from "../components/Field";
import PageHeader from "../components/PageHeader";
import CollapsibleFilters from "../components/CollapsibleFilters";
import { buttonClassName } from "../components/buttonClassName";

const CITIES_PAGE_SIZE = 10;

const SORT_OPTIONS = [
  { value: "default", label: "Default" },
  { value: "cityNameAsc", label: "City name A-Z" },
  { value: "cityNameDesc", label: "City name Z-A" },
  { value: "countryAsc", label: "Country A-Z" },
  { value: "countryDesc", label: "Country Z-A" },
  { value: "visitDateNewest", label: "Visit date newest first" },
  { value: "visitDateOldest", label: "Visit date oldest first" },
  { value: "createdNewest", label: "Created date newest first" },
  { value: "createdOldest", label: "Created date oldest first" },
];

const ROLE_LABELS = {
  user: "User",
  admin: "Admin",
  super_admin: "Super Admin",
};

const TABS = [
  { id: "users", label: "Users" },
  { id: "cities", label: "Cities" },
  { id: "trips", label: "Trips" },
];

function groupByCountry(cities) {
  return cities.reduce((acc, city) => {
    (acc[city.country] ??= []).push(city);
    return acc;
  }, {});
}

function Admin() {
  const { user, profile, isLoading, isProfileLoading, isAdmin, isSuperAdmin } =
    useAuth();

  // Used only to derive name/role lookups for the Cities tab below - its own
  // loading/error state is never displayed, so it isn't tracked here.
  const [profiles, setProfiles] = useState([]);

  const [users, setUsers] = useState([]);
  const [isLoadingUsers, setIsLoadingUsers] = useState(true);
  const [usersError, setUsersError] = useState("");

  const [cities, setCities] = useState([]);
  const [isLoadingCities, setIsLoadingCities] = useState(true);
  const [citiesError, setCitiesError] = useState("");

  const [cityPendingDelete, setCityPendingDelete] = useState(null);
  const [deleteError, setDeleteError] = useState("");

  const [trips, setTrips] = useState([]);
  const [isLoadingTrips, setIsLoadingTrips] = useState(true);
  const [tripsError, setTripsError] = useState("");

  // Bumped by "Try again" to re-run the matching (read-only) load below.
  const [usersReloadKey, setUsersReloadKey] = useState(0);
  const [citiesReloadKey, setCitiesReloadKey] = useState(0);
  const [tripsReloadKey, setTripsReloadKey] = useState(0);

  // The selected tab lives in the URL (?tab=), so returning from a trip
  // opened here lands back on the Trips tab.
  const [searchParams, setSearchParams] = useSearchParams();
  const activeTab = TABS.some((tab) => tab.id === searchParams.get("tab"))
    ? searchParams.get("tab")
    : "users";
  const setActiveTab = (id) =>
    setSearchParams(id === "users" ? {} : { tab: id }, { replace: true });
  const tabRefs = useRef({});

  const [searchQuery, setSearchQuery] = useState("");
  const [filterCountry, setFilterCountry] = useState("");
  const [filterContinent, setFilterContinent] = useState("");
  const [filterUserId, setFilterUserId] = useState("");
  const [sortOption, setSortOption] = useState("default");

  // Users and cities are fetched independently so that one failing doesn't
  // prevent the other section from loading and displaying normally.
  useEffect(() => {
    let isMounted = true;

    async function loadProfiles() {
      try {
        const data = await getAllProfiles();
        if (isMounted) setProfiles(data);
      } catch (err) {
        console.error("Failed to load profiles:", err.message);
      }
    }

    loadProfiles();

    return () => {
      isMounted = false;
    };
  }, []);

  // Separate from `profiles` above (which the Cities tab's grouping/filter
  // lookups still use, unchanged) - this feeds only the Users tab, via the
  // get_admin_users() RPC, which additionally exposes email.
  useEffect(() => {
    let isMounted = true;

    async function loadUsers() {
      setIsLoadingUsers(true);
      setUsersError("");
      try {
        const data = await getAdminUsers();
        if (isMounted) setUsers(data);
      } catch (err) {
        console.error("Failed to load admin users:", err.message);
        if (isMounted) {
          setUsersError("Could not load users. Please try again.");
        }
      } finally {
        if (isMounted) setIsLoadingUsers(false);
      }
    }

    loadUsers();

    return () => {
      isMounted = false;
    };
  }, [usersReloadKey]);

  useEffect(() => {
    let isMounted = true;

    async function loadCities() {
      setIsLoadingCities(true);
      setCitiesError("");
      try {
        const data = await getCities();
        if (isMounted) setCities(data);
      } catch (err) {
        console.error("Failed to load cities:", err.message);
        if (isMounted) {
          setCitiesError("Could not load cities. Please try again.");
        }
      } finally {
        if (isMounted) setIsLoadingCities(false);
      }
    }

    loadCities();

    return () => {
      isMounted = false;
    };
  }, [citiesReloadKey]);

  // Every trip RLS lets this admin see (never a super admin's, for a plain
  // admin).
  useEffect(() => {
    let isMounted = true;

    async function loadTrips() {
      setIsLoadingTrips(true);
      setTripsError("");
      try {
        const data = await getAllTrips();
        if (isMounted) setTrips(data);
      } catch (err) {
        if (isMounted) setTripsError(err.message);
      } finally {
        if (isMounted) setIsLoadingTrips(false);
      }
    }

    loadTrips();

    return () => {
      isMounted = false;
    };
  }, [tripsReloadKey]);

  const nameById = Object.fromEntries(
    profiles.map((profile) => [profile.id, profile.full_name]),
  );
  const roleById = Object.fromEntries(
    profiles.map((profile) => [profile.id, profile.role]),
  );

  const countryOptions = useMemo(
    () =>
      [...new Set(cities.map((city) => city.country))].sort((a, b) =>
        a.localeCompare(b),
      ),
    [cities],
  );

  const continentOptions = useMemo(
    () =>
      [...new Set(cities.map((city) => getContinent(city.countryCode)))].sort(
        (a, b) => a.localeCompare(b),
      ),
    [cities],
  );

  const userOptions = useMemo(() => {
    const seenUserIds = new Set();
    const options = [];

    cities.forEach((city) => {
      if (seenUserIds.has(city.userId)) return;
      seenUserIds.add(city.userId);
      options.push({
        id: city.userId,
        name: nameById[city.userId] || "Unknown user",
      });
    });

    return options.sort((a, b) => a.name.localeCompare(b.name));
  }, [cities, nameById]);

  const activeControlCount = [
    searchQuery.trim(),
    filterCountry,
    filterContinent,
    filterUserId,
    sortOption !== "default",
  ].filter(Boolean).length;
  const hasActiveControls = activeControlCount > 0;

  // Pipeline: raw cities -> search -> country filter -> continent filter ->
  // user filter -> sort. The existing user/country grouping below then
  // consumes this derived array instead of the raw `cities` state, which is
  // never mutated.
  const processedCities = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();

    let result = cities.filter((city) => {
      if (!query) return true;

      const continent = getContinent(city.countryCode);
      const userName = nameById[city.userId] || "";

      return [city.cityName, city.country, continent, userName].some(
        (field) => field.toLowerCase().includes(query),
      );
    });

    if (filterCountry) {
      result = result.filter((city) => city.country === filterCountry);
    }

    if (filterContinent) {
      result = result.filter(
        (city) => getContinent(city.countryCode) === filterContinent,
      );
    }

    if (filterUserId) {
      result = result.filter((city) => city.userId === filterUserId);
    }

    return [...result].sort((a, b) => {
      switch (sortOption) {
        case "cityNameAsc":
          return a.cityName.localeCompare(b.cityName);
        case "cityNameDesc":
          return b.cityName.localeCompare(a.cityName);
        case "countryAsc":
          return (
            a.country.localeCompare(b.country) ||
            a.cityName.localeCompare(b.cityName)
          );
        case "countryDesc":
          return (
            b.country.localeCompare(a.country) ||
            a.cityName.localeCompare(b.cityName)
          );
        case "visitDateNewest":
          return (
            compareDates(b.date, a.date) ||
            a.cityName.localeCompare(b.cityName)
          );
        case "visitDateOldest":
          return (
            compareDates(a.date, b.date) ||
            a.cityName.localeCompare(b.cityName)
          );
        case "createdNewest":
          return (
            compareDates(b.createdAt, a.createdAt) ||
            a.cityName.localeCompare(b.cityName)
          );
        case "createdOldest":
          return (
            compareDates(a.createdAt, b.createdAt) ||
            a.cityName.localeCompare(b.cityName)
          );
        default:
          return 0;
      }
    });
  }, [
    cities,
    searchQuery,
    filterCountry,
    filterContinent,
    filterUserId,
    sortOption,
    nameById,
  ]);

  function handleClearFilters() {
    setSearchQuery("");
    setFilterCountry("");
    setFilterContinent("");
    setFilterUserId("");
    setSortOption("default");
  }

  // Grouping happens on the already searched/filtered/sorted cities, before
  // pagination - pagination then slices the resulting user groups, never the
  // flat city array, so a user's cities/countries are never split across
  // pages. Group order is alphabetical by user name (existing behavior,
  // unchanged), which is what makes slicing it page-by-page deterministic.
  const citiesByUserId = processedCities.reduce((acc, city) => {
    (acc[city.userId] ??= []).push(city);
    return acc;
  }, {});

  const userIdsWithCities = Object.keys(citiesByUserId).sort((a, b) =>
    (nameById[a] || "Unknown user").localeCompare(nameById[b] || "Unknown user"),
  );

  const {
    currentPage,
    totalPages,
    startIndex,
    endIndex,
    goToPage,
    resetPage,
  } = usePagination(userIdsWithCities.length, CITIES_PAGE_SIZE);

  // A single effect covers every way the visible user groups can change
  // (search, any filter, sort, or Clear resetting all of them at once)
  // rather than wiring a resetPage() call into five separate handlers.
  useEffect(() => {
    resetPage();
  }, [
    searchQuery,
    filterCountry,
    filterContinent,
    filterUserId,
    sortOption,
    resetPage,
  ]);

  // Wait until the role is known: redirecting on the still-empty profile
  // bounced real admins away on a direct reload. A failed profile load ends
  // the wait with no role, so it still redirects (unknown never counts as
  // admin).
  if (isLoading || isProfileLoading)
    return <Spinner label="Loading admin access…" />;
  if (!isAdmin && !isSuperAdmin) return <Navigate replace to="/app" />;

  const paginatedUserIds = userIdsWithCities.slice(startIndex, endIndex);

  // Tabs follow the WAI-ARIA tabs pattern: only the selected tab is in the
  // Tab order, and the arrow keys (plus Home/End) move between tabs.
  function handleTabKeyDown(e) {
    const index = TABS.findIndex((tab) => tab.id === activeTab);
    const nextIndex = {
      ArrowRight: (index + 1) % TABS.length,
      ArrowLeft: (index - 1 + TABS.length) % TABS.length,
      Home: 0,
      End: TABS.length - 1,
    }[e.key];

    if (nextIndex === undefined) return;
    e.preventDefault();
    const nextId = TABS[nextIndex].id;
    setActiveTab(nextId);
    tabRefs.current[nextId]?.focus();
  }

  const tabCounts = {
    users: !isLoadingUsers && !usersError ? users.length : null,
    cities: !isLoadingCities && !citiesError ? cities.length : null,
    trips: !isLoadingTrips && !tripsError ? trips.length : null,
  };

  async function handleConfirmDeleteCity() {
    const city = cityPendingDelete;
    setCityPendingDelete(null);
    setDeleteError("");
    try {
      await deleteCityApi(city.id);
      setCities((current) => current.filter((c) => c.id !== city.id));
    } catch (err) {
      console.error("Failed to delete city:", err.message);
      setDeleteError(`Could not delete ${city.cityName}. ${err.message}`);
    }
  }

  // After the server confirmed it: everything of that user leaves the lists.
  function handleUserDeleted(userId) {
    setUsers((current) => current.filter((u) => u.id !== userId));
    setProfiles((current) => current.filter((p) => p.id !== userId));
    setCities((current) => current.filter((c) => c.userId !== userId));
    setTrips((current) => current.filter((trip) => trip.userId !== userId));
  }

  return (
    <div className={styles.admin}>
      <PageHeader
        title="Admin dashboard"
        summary={
          isSuperAdmin
            ? "Super admin"
            : "Admin · read and edit; can delete only your own data"
        }
      />

      <div className={styles.tabs} role="tablist" aria-label="Admin sections">
        {TABS.map((tab) => {
          const isSelected = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              ref={(el) => (tabRefs.current[tab.id] = el)}
              type="button"
              role="tab"
              id={`admin-tab-${tab.id}`}
              aria-selected={isSelected}
              aria-controls={`admin-panel-${tab.id}`}
              tabIndex={isSelected ? 0 : -1}
              className={`${styles.tabButton} ${isSelected ? styles.tabButtonActive : ""}`}
              onClick={() => setActiveTab(tab.id)}
              onKeyDown={handleTabKeyDown}
            >
              {tab.label}
              {tabCounts[tab.id] !== null && (
                <span className={styles.tabCount}>{tabCounts[tab.id]}</span>
              )}
            </button>
          );
        })}
      </div>

      {activeTab === "users" && (
        <AdminUsers
          users={users}
          isLoadingUsers={isLoadingUsers}
          usersError={usersError}
          onRetry={() => setUsersReloadKey((key) => key + 1)}
          cities={cities}
          viewer={{ id: user?.id, role: profile?.role }}
          onUserDeleted={handleUserDeleted}
        />
      )}

      {activeTab === "cities" && (
        <Card
          as="section"
          className={styles.section}
          id="admin-panel-cities"
          role="tabpanel"
          aria-labelledby="admin-tab-cities"
        >
          <h3 className={styles.sectionTitle}>
            Cities
            {tabCounts.cities !== null && (
              <span className={styles.count}>({cities.length})</span>
            )}
          </h3>

          {deleteError && <FormMessage>{deleteError}</FormMessage>}

          {isLoadingCities ? (
            <Spinner label="Loading cities…" />
          ) : citiesError ? (
            <EmptyState
              tone="error"
              title="Couldn't load cities"
              message={citiesError}
              action={
                <Button
                  variant="outline"
                  size="sm"
                  htmlType="button"
                  onClick={() => setCitiesReloadKey((key) => key + 1)}
                >
                  Try again
                </Button>
              }
            />
          ) : !cities.length ? (
            <EmptyState title="No cities found" />
          ) : (
            <>
              <div className={styles.toolbar}>
                <CollapsibleFilters activeCount={activeControlCount} toggleable>
                  <Field variant="toolbar" id="adminCitySearch" label="Search">
                    <input
                      id="adminCitySearch"
                      type="text"
                      placeholder="Search cities, countries, continents, or users..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                    />
                  </Field>

                  <Field variant="toolbar" id="adminCountryFilter" label="Country">
                    <select
                      id="adminCountryFilter"
                      value={filterCountry}
                      onChange={(e) => setFilterCountry(e.target.value)}
                    >
                      <option value="">All Countries</option>
                      {countryOptions.map((country) => (
                        <option key={country} value={country}>
                          {country}
                        </option>
                      ))}
                    </select>
                  </Field>

                  <Field variant="toolbar" id="adminContinentFilter" label="Continent">
                    <select
                      id="adminContinentFilter"
                      value={filterContinent}
                      onChange={(e) => setFilterContinent(e.target.value)}
                    >
                      <option value="">All Continents</option>
                      {continentOptions.map((continent) => (
                        <option key={continent} value={continent}>
                          {continent}
                        </option>
                      ))}
                    </select>
                  </Field>

                  <Field variant="toolbar" id="adminUserFilter" label="User">
                    <select
                      id="adminUserFilter"
                      value={filterUserId}
                      onChange={(e) => setFilterUserId(e.target.value)}
                    >
                      <option value="">All Users</option>
                      {userOptions.map((option) => (
                        <option key={option.id} value={option.id}>
                          {option.name}
                        </option>
                      ))}
                    </select>
                  </Field>

                  <Field variant="toolbar" id="adminCitySort" label="Sort">
                    <select
                      id="adminCitySort"
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

                <div className={styles.toolbarResult}>
                  <span className={styles.toolbarCount}>
                    {hasActiveControls
                      ? `${processedCities.length} of ${cities.length} cities · ${userIdsWithCities.length} of ${userOptions.length} users`
                      : `${cities.length} cities · ${userOptions.length} users`}
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

              {!processedCities.length ? (
                <EmptyState
                  compact
                  title="No cities match your filters."
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
                <ul className={styles.userGroups}>
                  {paginatedUserIds.map((userId) => {
                    const userCities = citiesByUserId[userId];
                    const countries = groupByCountry(userCities);
                    const role = roleById[userId];

                    return (
                      <li key={userId} className={styles.userGroup}>
                        <div className={styles.userGroupHeading}>
                          <span>{nameById[userId] || "Unknown user"}</span>
                          {role && (
                            <span
                              className={`${styles.role} ${styles[`role-${role}`] || ""}`}
                            >
                              {ROLE_LABELS[role] || role}
                            </span>
                          )}
                        </div>

                        {Object.entries(countries).map(
                          ([country, countryCities]) => (
                            <div key={country} className={styles.countryItem}>
                              <div className={styles.countryHeader}>
                                <FlagBox
                                  countryCode={countryCities[0]?.countryCode}
                                  country={country}
                                  position="left"
                                />
                                <span>{country}</span>
                              </div>

                              <ul className={styles.cityList}>
                                {countryCities.map((city) => (
                                  <li key={city.id} className={styles.cityRow}>
                                    <Link
                                      to={`/app/cities/${city.id}?lat=${city.position.lat}&lng=${city.position.lng}`}
                                    >
                                      {city.cityName}
                                    </Link>
                                    <span className={styles.actions}>
                                      <Link
                                        to={`/app/cities/${city.id}/edit`}
                                        className={buttonClassName({
                                          variant: "ghost",
                                          size: "sm",
                                        })}
                                        aria-label={`Edit ${city.cityName}`}
                                      >
                                        Edit
                                      </Link>
                                      {/* Super admins delete any city; a plain admin only
                                          their own (the database enforces the same). */}
                                      {(isSuperAdmin || city.userId === user?.id) && (
                                        <Button
                                          variant="ghost"
                                          size="sm"
                                          iconOnly
                                          htmlType="button"
                                          className={styles.deleteBtn}
                                          onClick={() =>
                                            setCityPendingDelete(city)
                                          }
                                          aria-label={`Delete ${city.cityName} permanently`}
                                          title="Delete permanently"
                                        >
                                          &times;
                                        </Button>
                                      )}
                                    </span>
                                  </li>
                                ))}
                              </ul>
                            </div>
                          ),
                        )}
                      </li>
                    );
                  })}
                </ul>
              )}

              {totalPages > 1 && (
                <div className={styles.paginationWrapper}>
                  <p className={styles.pageInfo}>
                    Page {currentPage} of {totalPages}
                  </p>
                  <Pagination
                    currentPage={currentPage}
                    totalPages={totalPages}
                    totalItems={userIdsWithCities.length}
                    onPageChange={goToPage}
                  />
                </div>
              )}
            </>
          )}
        </Card>
      )}

      {activeTab === "trips" && (
        <AdminTrips
          trips={trips}
          isLoading={isLoadingTrips}
          error={tripsError}
          onRetry={() => setTripsReloadKey((key) => key + 1)}
          onTripDeleted={(id) =>
            setTrips((current) => current.filter((trip) => trip.id !== id))
          }
          profiles={profiles}
          viewer={{ id: user?.id, role: profile?.role }}
        />
      )}

      {cityPendingDelete && (
        <ConfirmDialog
          title="Delete city permanently?"
          message={
            <>
              Permanently delete <strong>{cityPendingDelete.cityName}</strong>
              {cityPendingDelete.country && `, ${cityPendingDelete.country}`},
              owned by{" "}
              <strong>
                {nameById[cityPendingDelete.userId] || "Unknown user"}
              </strong>
              ? It won&apos;t go to their Trash.
            </>
          }
          confirmLabel="Delete forever"
          onConfirm={handleConfirmDeleteCity}
          onCancel={() => setCityPendingDelete(null)}
        />
      )}
    </div>
  );
}

export default Admin;
