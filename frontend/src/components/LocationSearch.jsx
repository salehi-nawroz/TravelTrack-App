import { useEffect, useState } from "react";
import { searchLocations } from "../services/geocodingService";
import styles from "./LocationSearch.module.css";

function LocationSearch({ onSelect, variant = "form", placeholder = "Search city or country" }) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const trimmedQuery = query.trim();

    if (trimmedQuery.length < 2) {
      setResults([]);
      setError("");
      return;
    }

    const timeoutId = setTimeout(async () => {
      try {
        setIsLoading(true);
        setError("");
        const locations = await searchLocations(trimmedQuery);
        setResults(locations);

        if (!locations.length) setError("No matching cities found.");
      } catch {
        setResults([]);
        setError("Unable to search for locations. Please try again.");
      } finally {
        setIsLoading(false);
      }
    }, 1000);

    return () => clearTimeout(timeoutId);
  }, [query]);

  function handleSelect(location) {
    onSelect(location);
    setQuery("");
    setResults([]);
    setError("");
  }

  return (
    <div className={`${styles.search} ${styles[variant]}`}>
      <label className={styles.label} htmlFor={`${variant}-location-search`}>
        Search for a city or country
      </label>
      <input
        id={`${variant}-location-search`}
        type="search"
        placeholder={placeholder}
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />

      {(isLoading || error || results.length > 0) && (
        <div className={styles.results} role="status">
          {isLoading && <p>Searching locations...</p>}
          {error && <p>{error}</p>}
          {!isLoading &&
            results.map((location) => (
              <button
                type="button"
                className={styles.result}
                key={`${location.cityName}-${location.country}-${location.position.lat}-${location.position.lng}`}
                onClick={() => handleSelect(location)}
              >
                <span>{location.cityName}</span>{" "}
                <small>
                  {" "}
                  {[location.region, location.country]
                    .filter(Boolean)
                    .join(", ")}{" "}
                </small>
              </button>
            ))}
        </div>
      )}
    </div>
  );
}

export default LocationSearch;
