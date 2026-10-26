import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import { useCities } from "../contexts/CitiesContext";
import { getCities } from "../services/cityService";
import { getAllProfiles } from "../services/profileService";
import { getContinent } from "../utils/continent";
import CollapsibleFilters from "./CollapsibleFilters";
import FlagBox from "./FlagBox";
import styles from "./GlobalSearch.module.css";

const ROLE_LABELS = {
  user: "User",
  admin: "Admin",
  super_admin: "Super Admin",
};

const CATEGORY_ORDER = ["navigation", "continent", "country", "city", "user"];
const CATEGORY_LABELS = {
  navigation: "Navigation",
  continent: "Continents",
  country: "Countries",
  city: "Cities",
  user: "Users",
};
const RESULTS_PER_CATEGORY = 8;

function getIcon(item) {
  if (item.type === "continent") return "\u{1F30D}"; // globe
  if (item.type === "user") return "\u{1F464}"; // person
  if (item.type === "navigation") {
    return item.title === "Admin Dashboard" ? "\u{1F6E1}" : "\u{1F9ED}"; // shield / compass
  }
  return null;
}

function itemMatches(item, query) {
  return [item.title, item.subtitle, item.countryCode].some(
    (field) => typeof field === "string" && field.toLowerCase().includes(query),
  );
}

function GlobalSearch() {
  const navigate = useNavigate();
  const { isAdmin, isSuperAdmin } = useAuth();
  const canSeeAll = isAdmin || isSuperAdmin;
  const { cities: myCities } = useCities();

  const [allCities, setAllCities] = useState([]);
  const [allProfiles, setAllProfiles] = useState([]);

  // Admin/super_admin see all cities and users everywhere search is used, not
  // just on the Admin dashboard, so this is fetched once here rather than
  // relying on Admin.jsx's own (separate) fetch of the same data.
  useEffect(() => {
    if (!canSeeAll) return;
    let isMounted = true;

    getCities()
      .then((data) => {
        if (isMounted) setAllCities(data);
      })
      .catch((err) =>
        console.error("Failed to load cities for search:", err.message),
      );

    getAllProfiles()
      .then((data) => {
        if (isMounted) setAllProfiles(data);
      })
      .catch((err) =>
        console.error("Failed to load users for search:", err.message),
      );

    return () => {
      isMounted = false;
    };
  }, [canSeeAll]);

  const cities = canSeeAll ? allCities : myCities;

  const [query, setQuery] = useState("");
  const [isOpen, setIsOpen] = useState(false);
  // The box itself, on a narrow sidebar (CollapsibleFilters); isOpen above
  // is the results list.
  const [isSearchShown, setIsSearchShown] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(0);
  const containerRef = useRef(null);

  useEffect(() => {
    function handleClickOutside(e) {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const index = useMemo(() => {
    const items = [
      { type: "navigation", title: "Countries", path: "/app/countries" },
      { type: "navigation", title: "Cities", path: "/app/cities" },
      { type: "navigation", title: "Map", path: "/app/countries" },
      { type: "navigation", title: "Profile", path: "/app/profile" },
    ];

    if (canSeeAll) {
      items.push({
        type: "navigation",
        title: "Admin Dashboard",
        path: "/app/admin",
      });
    }

    const continentSeen = new Set();
    const countrySeen = new Set();

    cities.forEach((city) => {
      const continent = getContinent(city.countryCode);
      if (!continentSeen.has(continent)) {
        continentSeen.add(continent);
        items.push({
          type: "continent",
          title: continent,
          path: "/app/countries",
        });
      }

      if (!countrySeen.has(city.country)) {
        countrySeen.add(city.country);
        items.push({
          type: "country",
          title: city.country,
          countryCode: city.countryCode,
          path: `/app/countries?lat=${city.position.lat}&lng=${city.position.lng}`,
        });
      }

      items.push({
        type: "city",
        title: city.cityName,
        subtitle: city.country,
        countryCode: city.countryCode,
        path: `/app/cities/${city.id}?lat=${city.position.lat}&lng=${city.position.lng}`,
      });
    });

    if (canSeeAll) {
      allProfiles.forEach((profile) => {
        items.push({
          type: "user",
          title: profile.full_name || "(no name)",
          subtitle: ROLE_LABELS[profile.role] || profile.role,
          path: "/app/admin",
        });
      });
    }

    return items;
  }, [cities, canSeeAll, allProfiles]);

  const trimmedQuery = query.trim().toLowerCase();
  const hasQuery = Boolean(trimmedQuery);

  const grouped = useMemo(() => {
    if (!hasQuery) return [];

    const filtered = index.filter((item) => itemMatches(item, trimmedQuery));

    return CATEGORY_ORDER.map((type) => ({
      type,
      label: CATEGORY_LABELS[type],
      items: filtered
        .filter((item) => item.type === type)
        .slice(0, RESULTS_PER_CATEGORY),
    })).filter((group) => group.items.length > 0);
  }, [index, trimmedQuery, hasQuery]);

  const flatResults = useMemo(
    () => grouped.flatMap((group) => group.items),
    [grouped],
  );

  useEffect(() => {
    setHighlightedIndex(0);
  }, [query]);

  function handleSelect(item) {
    navigate(item.path);
    setQuery("");
    setIsOpen(false);
    // A picked result is a finished search: fold the box away again where
    // it's collapsible (narrow sidebar).
    setIsSearchShown(false);
  }

  function handleClear() {
    setQuery("");
    setIsOpen(false);
  }

  function handleKeyDown(e) {
    if (e.key === "Escape") {
      setIsOpen(false);
      return;
    }

    if (!isOpen || !flatResults.length) return;

    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlightedIndex((i) => (i + 1) % flatResults.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlightedIndex((i) => (i - 1 + flatResults.length) % flatResults.length);
    } else if (e.key === "Enter") {
      e.preventDefault();
      const item = flatResults[highlightedIndex];
      if (item) handleSelect(item);
    }
  }

  return (
    <CollapsibleFilters
      label="Search"
      activeCount={hasQuery ? 1 : 0}
      toggleClassName={styles.toggle}
      open={isSearchShown}
      onOpenChange={setIsSearchShown}
    >
      <div className={styles.container} ref={containerRef}>
        <div className={styles.searchBox}>
          <span className={styles.searchIcon} aria-hidden="true">
            &#128269;
          </span>

          <input
            type="text"
            placeholder="Search cities, countries, continents, users..."
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setIsOpen(true);
            }}
            onFocus={() => setIsOpen(true)}
            onKeyDown={handleKeyDown}
            aria-label="Global search"
          />

          {hasQuery && (
            <button
              type="button"
              className={styles.clearButton}
              onClick={handleClear}
              aria-label="Clear search"
            >
              &times;
            </button>
          )}
        </div>

        {isOpen && hasQuery && (
          <div className={styles.resultsPanel} role="listbox">
            {!grouped.length ? (
              <p className={styles.emptyState}>
                No results for &quot;{query.trim()}&quot;.
              </p>
            ) : (
              grouped.map((group) => (
                <div key={group.type} className={styles.group}>
                  <h3 className={styles.groupLabel}>{group.label}</h3>
                  <ul>
                    {group.items.map((item) => {
                      const flatIndex = flatResults.indexOf(item);
                      const icon = getIcon(item);

                      return (
                        <li
                          key={`${item.type}-${item.title}-${item.subtitle || ""}`}
                        >
                          <button
                            type="button"
                            className={`${styles.resultItem} ${
                              flatIndex === highlightedIndex
                                ? styles.resultItemActive
                                : ""
                            }`}
                            onClick={() => handleSelect(item)}
                            onMouseEnter={() => setHighlightedIndex(flatIndex)}
                          >
                            {icon && (
                              <span className={styles.resultIcon} aria-hidden="true">
                                {icon}
                              </span>
                            )}
                            {(item.type === "country" || item.type === "city") && (
                              <FlagBox
                                countryCode={item.countryCode}
                                country={item.title}
                                position="left"
                              />
                            )}
                            <span className={styles.resultText}>
                              <span className={styles.resultTitle}>
                                {item.title}
                              </span>
                              {item.subtitle && (
                                <span className={styles.resultSubtitle}>
                                  {item.subtitle}
                                </span>
                              )}
                            </span>
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              ))
            )}
          </div>
        )}
      </div>
    </CollapsibleFilters>
  );
}

export default GlobalSearch;
