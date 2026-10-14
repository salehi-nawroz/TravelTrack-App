import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";

import styles from "./CountryItem.module.css";
import FlagBox from "./FlagBox";

// One country card. The card itself is a plain container: the country name
// is a real button (moves the map to the country), and each city is its own
// link, so no control is nested inside another one.
function CountryItem({ country, cities }) {
  const navigate = useNavigate();
  const [isExpanded, setIsExpanded] = useState(false);

  const countryCode = cities[0]?.countryCode;
  const { lat: countryLat, lng: countryLng } = cities[0].position;

  const visibleCities = isExpanded ? cities : cities.slice(0, 3);
  const remainingCount = cities.length - 3;

  function handleCountryClick() {
    navigate(`/app/countries?lat=${countryLat}&lng=${countryLng}`);
  }

  return (
    <div className={styles.countryItem}>
      <button
        type="button"
        className={styles.countryHeader}
        onClick={handleCountryClick}
        aria-label={`Show ${country} on the map`}
      >
        <FlagBox countryCode={countryCode} country={country} position="left" />

        <span className={styles.countryName}>{country}</span>

        <span className={styles.cityCount}>
          {cities.length} {cities.length === 1 ? "city" : "cities"}
        </span>
      </button>

      <ul className={styles.cityList}>
        {visibleCities.map((city) => (
          <li key={city.id}>
            <Link
              to={`/app/cities/${city.id}?lat=${city.position.lat}&lng=${city.position.lng}`}
            >
              {city.cityName}
            </Link>
          </li>
        ))}
      </ul>

      {cities.length > 3 && (
        <button
          type="button"
          className={styles.moreButton}
          onClick={() => setIsExpanded((expanded) => !expanded)}
          aria-expanded={isExpanded}
        >
          {isExpanded ? "Show less" : `+ ${remainingCount} more`}
        </button>
      )}
    </div>
  );
}

export default CountryItem;
