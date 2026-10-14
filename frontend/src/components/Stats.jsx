import { Link } from "react-router-dom";

import styles from "./Stats.module.css";
import Spinner from "./Spinner";
import EmptyState from "./EmptyState";
import StatsMap from "./StatsMap";
import { useCities } from "../contexts/CitiesContext";
import { getTravelStats, WORLD_COUNTRY_COUNT } from "../utils/travelStats";
import { TRIP_GAP_DAYS } from "../utils/groupCitiesIntoTrips";

const formatDate = (date) =>
  new Intl.DateTimeFormat("en", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(new Date(date));

const plural = (count, word, words = `${word}s`) =>
  `${count} ${count === 1 ? word : words}`;

// Everything here is derived from the signed-in user's own cities, already
// loaded by CitiesContext (getMyCities filters by user_id, RLS enforces it).
// No extra queries, nothing about other users.
function Stats() {
  const { cities, isLoading } = useCities();

  if (isLoading) return <Spinner />;

  if (!cities.length) {
    return (
      <EmptyState
        icon="stats"
        title="No stats yet"
        message="Add your first city to see your travel stats."
      />
    );
  }

  const stats = getTravelStats(cities);

  return (
    <div className={styles.stats}>
      <section className={styles.cards} aria-label="Summary">
        <div className={styles.card}>
          <span className={styles.value}>{stats.countriesVisited}</span>
          <span className={styles.label}>Countries visited</span>
        </div>
        <div className={styles.card}>
          <span className={styles.value}>{stats.citiesVisited}</span>
          <span className={styles.label}>Cities visited</span>
        </div>
        <div className={styles.card}>
          <span className={styles.value}>
            {stats.worldPercent.toFixed(1)}%
          </span>
          <span className={styles.label}>Of the world</span>
        </div>
      </section>
      <p className={styles.note}>
        World explored = countries visited out of {WORLD_COUNTRY_COUNT} (193
        UN members plus 2 observer states). Territories such as Greenland or
        Hong Kong count as their own country here.
      </p>

      <section className={styles.section}>
        <h3 className={styles.heading}>Visits per year</h3>
        <VisitsChart visitsPerYear={stats.visitsPerYear} />
      </section>

      <section className={styles.section}>
        <h3 className={styles.heading}>Longest trip</h3>
        <LongestTrip trip={stats.longestTrip} />
      </section>

      <section className={styles.section}>
        <h3 className={styles.heading}>Countries on the map</h3>
        <StatsMap
          countryCodes={stats.countryCodes}
          cityCountByCode={stats.cityCountByCode}
        />
      </section>
    </div>
  );
}

// Single-series bar chart in plain HTML: bar height is the share of the
// busiest year. Each bar is focusable and shows its exact count on hover or
// focus; the busiest year is also labelled directly.
function VisitsChart({ visitsPerYear }) {
  if (!visitsPerYear.length) {
    return <p className={styles.note}>No visit dates recorded yet.</p>;
  }

  const max = Math.max(...visitsPerYear.map((d) => d.visits));
  // Keep year labels readable in the narrow sidebar: label at most ~8 years.
  const labelEvery = Math.ceil(visitsPerYear.length / 8);

  return (
    <>
      <div className={styles.chart}>
        {visitsPerYear.map(({ year, visits }, i) => {
          const showLabel =
            i % labelEvery === 0 || i === visitsPerYear.length - 1;
          const text = `${year}: ${plural(visits, "visit")}`;

          return (
            <div key={year} className={styles.column}>
              <div
                className={styles.barArea}
                tabIndex={0}
                aria-label={text}
                data-tooltip={text}
              >
                {visits === max && (
                  <span className={styles.barValue}>{visits}</span>
                )}
                <div
                  className={styles.bar}
                  style={{ height: `${(visits / max) * 100}%` }}
                />
              </div>
              <span className={styles.year}>{showLabel ? year : ""}</span>
            </div>
          );
        })}
      </div>

      <details className={styles.tableToggle}>
        <summary>Show as table</summary>
        <table className={styles.table}>
          <thead>
            <tr>
              <th scope="col">Year</th>
              <th scope="col">Visits</th>
            </tr>
          </thead>
          <tbody>
            {visitsPerYear.map(({ year, visits }) => (
              <tr key={year}>
                <td>{year}</td>
                <td>{visits}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </>
  );
}

function LongestTrip({ trip }) {
  if (!trip) {
    return <p className={styles.note}>No dated visits to group into trips.</p>;
  }

  const dates =
    trip.days === 1
      ? formatDate(trip.startDate)
      : `${formatDate(trip.startDate)} – ${formatDate(trip.endDate)}`;

  return (
    <div className={styles.trip}>
      <div className={styles.tripHeader}>
        <span className={styles.tripDays}>{plural(trip.days, "day")}</span>
        <time className={styles.tripDates}>{dates}</time>
      </div>
      <p className={styles.tripPlaces}>
        {plural(trip.cities.length, "city", "cities")} in{" "}
        {trip.countries.join(", ")}
      </p>
      <p className={styles.note}>
        Your cities store one visit date each, not trip start and end dates.
        Visits within {TRIP_GAP_DAYS} days of each other are grouped into one
        trip, and its length runs from the first to the last recorded visit,
        so the real trip may have been longer. <Link to="/app/trips">See all
        trips</Link>
      </p>
    </div>
  );
}

export default Stats;
