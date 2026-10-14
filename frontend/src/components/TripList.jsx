import { useState } from "react";
import { Link } from "react-router-dom";

import styles from "./TripList.module.css";
import FlagBox from "./FlagBox";
import EmptyState from "./EmptyState";
import { buttonClassName } from "./buttonClassName";
import { useCities } from "../contexts/CitiesContext";
import {
  groupCitiesIntoTrips,
  TRIP_GAP_DAYS,
} from "../utils/groupCitiesIntoTrips";

const MS_PER_DAY = 24 * 60 * 60 * 1000;

// Longer trips show this many stops until "Show all" is pressed.
const VISIBLE_STOPS = 5;

const formatDate = (date, options) =>
  new Intl.DateTimeFormat("en", options).format(new Date(date));

const FULL_DATE = { day: "numeric", month: "short", year: "numeric" };
const SHORT_DATE = { day: "numeric", month: "short" };

// "3 – 9 Mar 2025", "28 Feb – 4 Mar 2025" or "30 Dec 2024 – 2 Jan 2025".
function formatDateRange(startDate, endDate) {
  const start = new Date(startDate);
  const end = new Date(endDate);

  if (start.getTime() === end.getTime()) return formatDate(start, FULL_DATE);
  if (start.getFullYear() !== end.getFullYear()) {
    return `${formatDate(start, FULL_DATE)} – ${formatDate(end, FULL_DATE)}`;
  }
  if (start.getMonth() !== end.getMonth()) {
    return `${formatDate(start, SHORT_DATE)} – ${formatDate(end, FULL_DATE)}`;
  }
  return `${start.getDate()} – ${formatDate(end, FULL_DATE)}`;
}

// Calendar days from the first to the last recorded visit, both included.
const tripDays = (trip) =>
  Math.round((new Date(trip.endDate) - new Date(trip.startDate)) / MS_PER_DAY) +
  1;

const plural = (count, word, words = `${word}s`) =>
  `${count} ${count === 1 ? word : words}`;

function RouteIcon({ className }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      aria-hidden="true"
      focusable="false"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
    >
      <circle cx="6" cy="18" r="2.5" />
      <circle cx="18" cy="6" r="2.5" />
      <path d="M8.5 18H15a3 3 0 0 0 0-6H9a3 3 0 0 1 0-6h6.5" />
    </svg>
  );
}

// Read-only, derived from the already-loaded cities (no trips table yet).
// See utils/groupCitiesIntoTrips.js for the grouping rule.
function TripList() {
  const { cities, isLoading } = useCities();

  if (isLoading) return <TripListSkeleton />;

  const trips = groupCitiesIntoTrips(cities);

  if (!trips.length) {
    return (
      <EmptyState
        icon="trips"
        title="No trips yet"
        message="Add the cities you've visited and they'll be grouped into trips here automatically."
        action={
          <Link
            to="/app/form"
            className={buttonClassName({ variant: "primary", size: "sm" })}
          >
            + Add a city
          </Link>
        }
      />
    );
  }

  const countryCount = new Set(
    trips.flatMap((trip) => trip.cities.map((city) => city.country)),
  ).size;

  return (
    <div className={styles.tripListWrapper}>
      <header className={styles.pageHeader}>
        <h2 className={styles.pageTitle}>Your trips</h2>
        <p className={styles.pageSummary}>
          {plural(trips.length, "trip")} across{" "}
          {plural(countryCount, "country", "countries")}
        </p>
        <p className={styles.note}>
          Grouped automatically: visits within {TRIP_GAP_DAYS} days of each
          other count as one trip.
        </p>
      </header>

      <ul className={styles.tripList}>
        {trips.map((trip) => (
          <TripCard key={trip.id} trip={trip} />
        ))}
      </ul>
    </div>
  );
}

function TripCard({ trip }) {
  const [isExpanded, setIsExpanded] = useState(false);

  const countries = [...new Set(trip.cities.map((city) => city.country))];
  const days = tripDays(trip);
  const hiddenCount = trip.cities.length - VISIBLE_STOPS;
  const stops =
    isExpanded || hiddenCount <= 0
      ? trip.cities
      : trip.cities.slice(0, VISIBLE_STOPS);

  return (
    <li className={styles.trip}>
      <div className={styles.header}>
        <time className={styles.dates}>
          {formatDateRange(trip.startDate, trip.endDate)}
        </time>
        <span className={styles.duration}>{plural(days, "day")}</span>
      </div>

      <h3 className={styles.title}>
        {countries.join(" · ")}
      </h3>

      <p className={styles.meta}>
        <RouteIcon className={styles.metaIcon} />
        {plural(trip.cities.length, "city", "cities")}
        <span aria-hidden="true">·</span>
        {plural(countries.length, "country", "countries")}
      </p>

      <ol className={styles.route} aria-label="Cities in visit order">
        {stops.map((city, i) => (
          <li
            key={city.id}
            className={`${styles.stop} ${
              i === 0 || city === trip.cities.at(-1) ? styles.endpoint : ""
            }`}
          >
            <Link
              className={styles.city}
              to={`/app/cities/${city.id}?lat=${city.position.lat}&lng=${city.position.lng}`}
              title={`${city.cityName}, ${city.country}`}
            >
              <span className={styles.flag}>
                <FlagBox
                  countryCode={city.countryCode}
                  country={city.country}
                  position="left"
                />
              </span>
              <span className={styles.cityName}>{city.cityName}</span>
              <time className={styles.stopDate}>
                {formatDate(city.date, SHORT_DATE)}
              </time>
            </Link>
          </li>
        ))}
      </ol>

      {hiddenCount > 0 && (
        <button
          type="button"
          className={styles.moreButton}
          onClick={() => setIsExpanded((expanded) => !expanded)}
          aria-expanded={isExpanded}
        >
          {isExpanded
            ? "Show fewer cities"
            : `Show ${plural(hiddenCount, "more city", "more cities")}`}
        </button>
      )}
    </li>
  );
}

function TripListSkeleton() {
  return (
    <div className={styles.tripListWrapper} aria-busy="true">
      <span className={styles.srOnly}>Loading trips…</span>
      <ul className={styles.tripList} aria-hidden="true">
        {[0, 1, 2].map((i) => (
          <li key={i} className={`${styles.trip} ${styles.skeleton}`}>
            <span className={styles.skeletonLine} style={{ width: "40%" }} />
            <span className={styles.skeletonLine} style={{ width: "65%" }} />
            <span className={styles.skeletonLine} style={{ width: "85%" }} />
          </li>
        ))}
      </ul>
    </div>
  );
}

export default TripList;
