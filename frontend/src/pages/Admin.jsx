import { useEffect, useMemo, useState } from "react";
import { Link, Navigate } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import { getAllProfiles } from "../services/profileService";
import { getCities, deleteCity as deleteCityApi } from "../services/cityService";
import { getContinent } from "../utils/continent";
import { usePagination } from "../hooks/usePagination";
import Spinner from "../components/Spinner";
import Message from "../components/Message";
import ConfirmDialog from "../components/ConfirmDialog";
import FlagBox from "../components/FlagBox";
import Pagination from "../components/Pagination";
import styles from "./Admin.module.css";

const CITIES_PAGE_SIZE = 10;
const USERS_PAGE_SIZE = 10;

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

// Compares two dates safely, treating missing/invalid values as "oldest" so
// they sort last regardless of direction, rather than breaking the sort.
function compareDates(a, b) {
  const timeA = a ? new Date(a).getTime() : NaN;
  const timeB = b ? new Date(b).getTime() : NaN;
  const validA = !Number.isNaN(timeA);
  const validB = !Number.isNaN(timeB);

  if (!validA && !validB) return 0;
  if (!validA) return 1;
  if (!validB) return -1;

  return timeA - timeB;
}

const ROLE_LABELS = {
  user: "User",
  admin: "Admin",
  super_admin: "Super Admin",
};

function groupByCountry(cities) {
  return cities.reduce((acc, city) => {
    (acc[city.country] ??= []).push(city);
    return acc;
  }, {});
}

function Admin() {
  const { isAdmin, isSuperAdmin } = useAuth();

  const [profiles, setProfiles] = useState([]);
  const [isLoadingProfiles, setIsLoadingProfiles] = useState(true);
  const [profilesError, setProfilesError] = useState("");

  const [cities, setCities] = useState([]);
  const [isLoadingCities, setIsLoadingCities] = useState(true);
  const [citiesError, setCitiesError] = useState("");

  const [cityPendingDelete, setCityPendingDelete] = useState(null);
  const [deleteError, setDeleteError] = useState("");

  const [activeTab, setActiveTab] = useState("users");

  const [userSearchQuery, setUserSearchQuery] = useState("");
  const [userRoleFilter, setUserRoleFilter] = useState("");

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
      setIsLoadingProfiles(true);
      setProfilesError("");
      try {
        const data = await getAllProfiles();
        if (isMounted) setProfiles(data);
      } catch (err) {
        console.error("Failed to load users:", err.message);
        if (isMounted) {
          setProfilesError("Could not load users. Please try again.");
        }
      } finally {
        if (isMounted) setIsLoadingProfiles(false);
      }
    }

    loadProfiles();

    return () => {
      isMounted = false;
    };
  }, []);

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
  }, []);

  const nameById = Object.fromEntries(
    profiles.map((profile) => [profile.id, profile.full_name]),
  );
  const roleById = Object.fromEntries(
    profiles.map((profile) => [profile.id, profile.role]),
  );

  const hasActiveUserControls = Boolean(
    userSearchQuery.trim() || userRoleFilter,
  );

  const userNameOptions = useMemo(
    () =>
      [...new Set(profiles.map((profile) => profile.full_name).filter(Boolean))].sort(
        (a, b) => a.localeCompare(b),
      ),
    [profiles],
  );

  // Pipeline: raw profiles -> search (by name) -> role filter. Pagination
  // below then operates on this derived array, never the raw `profiles`
  // state, which is never mutated.
  const processedProfiles = useMemo(() => {
    const query = userSearchQuery.trim().toLowerCase();

    let result = profiles.filter((profile) => {
      if (!query) return true;
      return (profile.full_name || "").toLowerCase().includes(query);
    });

    if (userRoleFilter) {
      result = result.filter((profile) => profile.role === userRoleFilter);
    }

    return result;
  }, [profiles, userSearchQuery, userRoleFilter]);

  function handleClearUserFilters() {
    setUserSearchQuery("");
    setUserRoleFilter("");
  }

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

  const hasActiveControls = Boolean(
    searchQuery.trim() ||
      filterCountry ||
      filterContinent ||
      filterUserId ||
      sortOption !== "default",
  );

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

  const {
    currentPage: usersCurrentPage,
    totalPages: usersTotalPages,
    startIndex: usersStartIndex,
    endIndex: usersEndIndex,
    goToPage: usersGoToPage,
    resetPage: usersResetPage,
  } = usePagination(processedProfiles.length, USERS_PAGE_SIZE);

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

  useEffect(() => {
    usersResetPage();
  }, [userSearchQuery, userRoleFilter, usersResetPage]);

  if (!isAdmin && !isSuperAdmin) return <Navigate replace to="/app" />;

  const paginatedUserIds = userIdsWithCities.slice(startIndex, endIndex);
  const paginatedProfiles = processedProfiles.slice(
    usersStartIndex,
    usersEndIndex,
  );

  async function handleConfirmDeleteCity() {
    const city = cityPendingDelete;
    setCityPendingDelete(null);
    setDeleteError("");
    try {
      await deleteCityApi(city.id);
      setCities((current) => current.filter((c) => c.id !== city.id));
    } catch (err) {
      console.error("Failed to delete city:", err.message);
      setDeleteError("Could not delete this city. Please try again.");
    }
  }

  return (
    <div className={styles.admin}>
      <h1 className={styles.title}>Admin Dashboard</h1>

      <div className={styles.tabs}>
        <button
          className={`${styles.tabButton} ${activeTab === "users" ? styles.tabButtonActive : ""}`}
          onClick={() => setActiveTab("users")}
        >
          Users
          {!isLoadingProfiles && !profilesError && ` (${profiles.length})`}
        </button>
        <button
          className={`${styles.tabButton} ${activeTab === "cities" ? styles.tabButtonActive : ""}`}
          onClick={() => setActiveTab("cities")}
        >
          Cities
          {!isLoadingCities && !citiesError && ` (${cities.length})`}
        </button>
      </div>

      {activeTab === "users" && (
        <div className={styles.section}>
          <h2 className={styles.sectionTitle}>
            Users
            {!isLoadingProfiles && !profilesError && (
              <span className={styles.count}>({profiles.length})</span>
            )}
          </h2>

          {isLoadingProfiles ? (
            <Spinner />
          ) : profilesError ? (
            <p className={styles.error}>{profilesError}</p>
          ) : !profiles.length ? (
            <Message message="No users found." />
          ) : (
            <>
              <div className={`${styles.toolbar} ${styles.userToolbar}`}>
                <div className={styles.toolbarField}>
                  <label htmlFor="adminUserSearch" className={styles.toolbarLabel}>
                    Search
                  </label>
                  <input
                    id="adminUserSearch"
                    type="text"
                    className={`${styles.toolbarInput} ${styles.toolbarCombo}`}
                    placeholder="Search by name..."
                    list="adminUserNames"
                    value={userSearchQuery}
                    onChange={(e) => setUserSearchQuery(e.target.value)}
                  />
                  <datalist id="adminUserNames">
                    {userNameOptions.map((name) => (
                      <option key={name} value={name} />
                    ))}
                  </datalist>
                </div>

                <div className={styles.toolbarField}>
                  <label htmlFor="adminRoleFilter" className={styles.toolbarLabel}>
                    Role
                  </label>
                  <select
                    id="adminRoleFilter"
                    className={styles.toolbarSelect}
                    value={userRoleFilter}
                    onChange={(e) => setUserRoleFilter(e.target.value)}
                  >
                    <option value="">All Roles</option>
                    {Object.entries(ROLE_LABELS).map(([value, label]) => (
                      <option key={value} value={value}>
                        {label}
                      </option>
                    ))}
                  </select>
                </div>

                <div className={styles.toolbarResult}>
                  <span className={styles.toolbarCount}>
                    {hasActiveUserControls
                      ? `${processedProfiles.length} of ${profiles.length} users`
                      : `${profiles.length} users`}
                  </span>

                  {hasActiveUserControls && (
                    <button
                      type="button"
                      className={styles.toolbarClear}
                      onClick={handleClearUserFilters}
                    >
                      Clear
                    </button>
                  )}
                </div>
              </div>

              {!processedProfiles.length ? (
                <div className={styles.filteredEmpty}>
                  <Message message="No users match your filters." />
                  <button
                    type="button"
                    className={styles.toolbarClear}
                    onClick={handleClearUserFilters}
                  >
                    Clear filters
                  </button>
                </div>
              ) : (
                <ul className={styles.list}>
                  <li className={`${styles.listRow} ${styles.listHeaderRow}`}>
                    <span>Name</span>
                    <span>Role</span>
                  </li>
                  {paginatedProfiles.map((profile) => (
                    <li key={profile.id} className={styles.listRow}>
                      <span>{profile.full_name || "(no name)"}</span>
                      <span
                        className={`${styles.role} ${styles[`role-${profile.role}`] || ""}`}
                      >
                        {ROLE_LABELS[profile.role] || profile.role}
                      </span>
                    </li>
                  ))}
                </ul>
              )}

              {usersTotalPages > 1 && (
                <div className={styles.paginationWrapper}>
                  <p className={styles.pageInfo}>
                    Page {usersCurrentPage} of {usersTotalPages}
                  </p>
                  <Pagination
                    currentPage={usersCurrentPage}
                    totalPages={usersTotalPages}
                    totalItems={processedProfiles.length}
                    onPageChange={usersGoToPage}
                  />
                </div>
              )}
            </>
          )}
        </div>
      )}

      {activeTab === "cities" && (
        <div className={styles.section}>
          <h2 className={styles.sectionTitle}>
            Cities
            {!isLoadingCities && !citiesError && (
              <span className={styles.count}>({cities.length})</span>
            )}
          </h2>

          {deleteError && <p className={styles.error}>{deleteError}</p>}

          {isLoadingCities ? (
            <Spinner />
          ) : citiesError ? (
            <p className={styles.error}>{citiesError}</p>
          ) : !cities.length ? (
            <Message message="No cities found." />
          ) : (
            <>
              <div className={styles.toolbar}>
                <div className={styles.toolbarField}>
                  <label htmlFor="adminCitySearch" className={styles.toolbarLabel}>
                    Search
                  </label>
                  <input
                    id="adminCitySearch"
                    type="text"
                    className={styles.toolbarInput}
                    placeholder="Search cities, countries, continents, or users..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                  />
                </div>

                <div className={styles.toolbarField}>
                  <label htmlFor="adminCountryFilter" className={styles.toolbarLabel}>
                    Country
                  </label>
                  <select
                    id="adminCountryFilter"
                    className={styles.toolbarSelect}
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
                </div>

                <div className={styles.toolbarField}>
                  <label htmlFor="adminContinentFilter" className={styles.toolbarLabel}>
                    Continent
                  </label>
                  <select
                    id="adminContinentFilter"
                    className={styles.toolbarSelect}
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
                </div>

                <div className={styles.toolbarField}>
                  <label htmlFor="adminUserFilter" className={styles.toolbarLabel}>
                    User
                  </label>
                  <select
                    id="adminUserFilter"
                    className={styles.toolbarSelect}
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
                </div>

                <div className={styles.toolbarField}>
                  <label htmlFor="adminCitySort" className={styles.toolbarLabel}>
                    Sort
                  </label>
                  <select
                    id="adminCitySort"
                    className={styles.toolbarSelect}
                    value={sortOption}
                    onChange={(e) => setSortOption(e.target.value)}
                  >
                    {SORT_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </div>

                <div className={styles.toolbarResult}>
                  <span className={styles.toolbarCount}>
                    {hasActiveControls
                      ? `${processedCities.length} of ${cities.length} cities · ${userIdsWithCities.length} of ${userOptions.length} users`
                      : `${cities.length} cities · ${userOptions.length} users`}
                  </span>

                  {hasActiveControls && (
                    <button
                      type="button"
                      className={styles.toolbarClear}
                      onClick={handleClearFilters}
                    >
                      Clear
                    </button>
                  )}
                </div>
              </div>

              {!processedCities.length ? (
                <div className={styles.filteredEmpty}>
                  <Message message="No cities match your filters." />
                  <button
                    type="button"
                    className={styles.toolbarClear}
                    onClick={handleClearFilters}
                  >
                    Clear filters
                  </button>
                </div>
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
                                      <Link to={`/app/cities/${city.id}/edit`}>
                                        Edit
                                      </Link>
                                      {isSuperAdmin && (
                                        <button
                                          className={styles.deleteBtn}
                                          onClick={() =>
                                            setCityPendingDelete(city)
                                          }
                                          aria-label={`Delete ${city.cityName}`}
                                        >
                                          &times;
                                        </button>
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
        </div>
      )}

      {cityPendingDelete && (
        <ConfirmDialog
          title="Delete city?"
          message={`Are you sure you want to delete ${cityPendingDelete.cityName}?`}
          onConfirm={handleConfirmDeleteCity}
          onCancel={() => setCityPendingDelete(null)}
        />
      )}
    </div>
  );
}

export default Admin;
