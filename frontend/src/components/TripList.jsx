import { Link } from "react-router-dom";

import styles from "./TripList.module.css";
import Spinner from "./Spinner";
import Message from "./Message";
import FlagBox from "./FlagBox";
import { useCities } from "../contexts/CitiesContext";
import {
  groupCitiesIntoTrips,
  TRIP_GAP_DAYS,
} from "../utils/groupCitiesIntoTrips";

const formatDate = (date) =>
  new Intl.DateTimeFormat("en", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(new Date(date));

function formatDateRange(startDate, endDate) {
  const start = formatDate(startDate);
  const end = formatDate(endDate);
  return start === end ? start : `${start} – ${end}`;
}

// First step toward Trips: read-only, derived from the already-loaded cities
// (no trips table yet). See utils/groupCitiesIntoTrips.js for the rule.
function TripList() {
  const { cities, isLoading } = useCities();

  if (isLoading) return <Spinner />;

  const trips = groupCitiesIntoTrips(cities);

  if (!trips.length) {
    return (
      <Message message="Add cities to see them grouped into trips here" />
    );
  }

  return (
    <div className={styles.tripListWrapper}>
      <p className={styles.note}>
        Trips are grouped automatically from your cities: visits within{" "}
        {TRIP_GAP_DAYS} days of each other count as one trip.
      </p>

      <ul className={styles.tripList}>
        {trips.map((trip) => {
          const countries = [...new Set(trip.cities.map((c) => c.country))];

          return (
            <li key={trip.id} className={styles.trip}>
              <div className={styles.header}>
                <h3 className={styles.title}>{countries.join(", ")}</h3>
                <time className={styles.dates}>
                  {formatDateRange(trip.startDate, trip.endDate)}
                </time>
              </div>

              <ul className={styles.cities}>
                {trip.cities.map((city) => (
                  <li key={city.id}>
                    <Link
                      className={styles.city}
                      to={`/app/cities/${city.id}?lat=${city.position.lat}&lng=${city.position.lng}`}
                    >
                      <FlagBox
                        countryCode={city.countryCode}
                        country={city.country}
                        position="left"
                      />
                      {city.cityName}
                    </Link>
                  </li>
                ))}
              </ul>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

export default TripList;
