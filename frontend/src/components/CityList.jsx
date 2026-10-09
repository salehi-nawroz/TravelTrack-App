import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import Spinner from "./Spinner";
import adminStyles from "../pages/Admin.module.css";
import styles from "./CityList.module.css";
import CityItem from "./CityItem";
import Message from "./Message";
import Pagination from "./Pagination";
import { useCities } from "../contexts/CitiesContext";
import { usePagination } from "../hooks/usePagination";
import { compareDates } from "../utils/compareDates";
import { downloadCitiesCsv } from "../utils/exportCitiesCsv";
import CityImport from "./CityImport";

const CITY_LIST_PAGE_SIZE = 10;

const SORT_OPTIONS = [
  { value: "default", label: "Default" },
  { value: "newest", label: "Newest visit" },
  { value: "oldest", label: "Oldest visit" },
  { value: "cityNameAsc", label: "City name A-Z" },
  { value: "countryAsc", label: "Country A-Z" },
];

const getVisitYear = (city) =>
  city.date ? String(new Date(city.date).getFullYear()) : "";

function CityList() {
  const { cities, isLoading } = useCities();

  const [searchQuery, setSearchQuery] = useState("");
  const [filterCountry, setFilterCountry] = useState("");
  const [filterYear, setFilterYear] = useState("");
  const [sortOption, setSortOption] = useState("default");
  // Keeps the empty state (and the import dialog opened from it) mounted
  // until that dialog is closed, so its result summary isn't lost when the
  // first imported cities arrive.
  const [isEmptyStateImportOpen, setIsEmptyStateImportOpen] = useState(false);

  const countryOptions = useMemo(
    () =>
      [...new Set(cities.map((city) => city.country))].sort((a, b) =>
        a.localeCompare(b),
      ),
    [cities],
  );

  const yearOptions = useMemo(
    () =>
      [...new Set(cities.map(getVisitYear).filter(Boolean))].sort(
        (a, b) => b - a,
      ),
    [cities],
  );

  const hasActiveControls = Boolean(
    searchQuery.trim() || filterCountry || filterYear || sortOption !== "default",
  );

  // Pipeline: the user's own (already-loaded) cities -> search -> country
  // filter -> visit year filter -> sort. `cities` itself is never mutated,
  // and no extra request is made.
  const processedCities = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();

    let result = cities.filter((city) => {
      if (!query) return true;
      return [city.cityName, city.country].some((field) =>
        (field || "").toLowerCase().includes(query),
      );
    });

    if (filterCountry) {
      result = result.filter((city) => city.country === filterCountry);
    }

    if (filterYear) {
      result = result.filter((city) => getVisitYear(city) === filterYear);
    }

    return [...result].sort((a, b) => {
      switch (sortOption) {
        case "newest":
          return (
            compareDates(b.date, a.date) ||
            a.cityName.localeCompare(b.cityName)
          );
        case "oldest":
          return (
            compareDates(a.date, b.date) ||
            a.cityName.localeCompare(b.cityName)
          );
        case "cityNameAsc":
          return a.cityName.localeCompare(b.cityName);
        case "countryAsc":
          return (
            a.country.localeCompare(b.country) ||
            a.cityName.localeCompare(b.cityName)
          );
        default:
          return 0;
      }
    });
  }, [cities, searchQuery, filterCountry, filterYear, sortOption]);

  const { currentPage, totalPages, startIndex, endIndex, goToPage, resetPage } =
    usePagination(processedCities.length, CITY_LIST_PAGE_SIZE);

  useEffect(() => {
    resetPage();
  }, [searchQuery, filterCountry, filterYear, sortOption, resetPage]);

  function handleClearFilters() {
    setSearchQuery("");
    setFilterCountry("");
    setFilterYear("");
    setSortOption("default");
  }

  if (isLoading) return <Spinner />;

  if (!cities.length || isEmptyStateImportOpen) {
    return (
      <>
        <Message message="Enter your first city by clicking on a city on the map" />
        <div className={styles.emptyActions}>
          <CityImport
            buttonClassName={adminStyles.toolbarClear}
            onDialogOpenChange={setIsEmptyStateImportOpen}
          />
          <Link to="/app/trash" className={adminStyles.toolbarClear}>
            Trash
          </Link>
        </div>
      </>
    );
  }

  const paginatedCities = processedCities.slice(startIndex, endIndex);

  return (
    <>
      <div className={`${adminStyles.toolbar} ${styles.toolbar}`}>
        <div className={adminStyles.toolbarField}>
          <label htmlFor="citySearch" className={adminStyles.toolbarLabel}>
            Search
          </label>
          <input
            id="citySearch"
            type="text"
            className={adminStyles.toolbarInput}
            placeholder="Search by city or country..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>

        <div className={adminStyles.toolbarField}>
          <label htmlFor="cityCountryFilter" className={adminStyles.toolbarLabel}>
            Country
          </label>
          <select
            id="cityCountryFilter"
            className={adminStyles.toolbarSelect}
            value={filterCountry}
            onChange={(e) => setFilterCountry(e.target.value)}
          >
            <option value="">All countries</option>
            {countryOptions.map((country) => (
              <option key={country} value={country}>
                {country}
              </option>
            ))}
          </select>
        </div>

        <div className={adminStyles.toolbarField}>
          <label htmlFor="cityYearFilter" className={adminStyles.toolbarLabel}>
            Visited
          </label>
          <select
            id="cityYearFilter"
            className={adminStyles.toolbarSelect}
            value={filterYear}
            onChange={(e) => setFilterYear(e.target.value)}
          >
            <option value="">Any year</option>
            {yearOptions.map((year) => (
              <option key={year} value={year}>
                {year}
              </option>
            ))}
          </select>
        </div>

        <div className={adminStyles.toolbarField}>
          <label htmlFor="citySort" className={adminStyles.toolbarLabel}>
            Sort
          </label>
          <select
            id="citySort"
            className={adminStyles.toolbarSelect}
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

        <div className={adminStyles.toolbarResult}>
          <span className={adminStyles.toolbarCount}>
            {hasActiveControls
              ? `${processedCities.length} of ${cities.length} cities`
              : `${cities.length} cities`}
          </span>

          <div className={styles.toolbarActions}>
            {hasActiveControls && (
              <button
                type="button"
                className={adminStyles.toolbarClear}
                onClick={handleClearFilters}
              >
                Clear
              </button>
            )}

            <CityImport buttonClassName={adminStyles.toolbarClear} />

            {/* Always the full list of the user's own cities (from
                CitiesContext / getMyCities), regardless of filters. */}
            <button
              type="button"
              className={adminStyles.toolbarClear}
              onClick={() => downloadCitiesCsv(cities)}
            >
              Export CSV
            </button>

            <Link to="/app/trash" className={adminStyles.toolbarClear}>
              Trash
            </Link>
          </div>
        </div>
      </div>

      {!processedCities.length ? (
        <div className={adminStyles.filteredEmpty}>
          <Message message="No cities match your filters." />
          <button
            type="button"
            className={adminStyles.toolbarClear}
            onClick={handleClearFilters}
          >
            Clear filters
          </button>
        </div>
      ) : (
        <ul className={styles.cityList}>
          {paginatedCities.map((city) => (
            <CityItem city={city} key={city.id} />
          ))}
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
            totalItems={processedCities.length}
            onPageChange={goToPage}
          />
        </div>
      )}
    </>
  );
}

export default CityList;
