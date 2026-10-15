import { useId } from "react";
import { Link, useSearchParams } from "react-router-dom";
import Button from "./Button";
import EmptyState from "./EmptyState";
import FlagBox from "./FlagBox";
import PageHeader from "./PageHeader";
import TripStatusBadge from "./TripStatusBadge";
import { buttonClassName } from "./buttonClassName";
import { useTrips } from "../contexts/tripsContext";
import { useTripPhotoUrls } from "../hooks/useTripPhotoUrls";
import { getCoverPhoto } from "../services/tripService";
import { formatTripRange, tripLengthDays } from "../utils/tripDates";
import styles from "./Trips.module.css";

const FILTERS = [
  { id: "all", label: "All" },
  { id: "active", label: "Active" },
  { id: "completed", label: "Completed" },
];

const plural = (count, word, words = `${word}s`) =>
  `${count} ${count === 1 ? word : words}`;

// /app/trips: the user's trips, newest first, with an Active/Completed
// filter kept in the URL (?status=) so Back returns to the same view.
function Trips() {
  const { trips, isLoading, error, activeTrip, reload } = useTrips();
  const [searchParams, setSearchParams] = useSearchParams();
  const startHintId = useId();

  const filter = FILTERS.some((f) => f.id === searchParams.get("status"))
    ? searchParams.get("status")
    : "all";

  const coverPaths = trips
    .map((trip) => getCoverPhoto(trip)?.storagePath)
    .filter(Boolean);
  const { urls } = useTripPhotoUrls(coverPaths);

  const startAction = activeTrip ? (
    <>
      <Button
        variant="primary"
        size="sm"
        htmlType="button"
        disabled
        aria-describedby={startHintId}
      >
        + Start a Trip
      </Button>
      <span id={startHintId} className={styles.srOnly}>
        End your current trip before starting a new one.
      </span>
    </>
  ) : (
    <Link
      to="/app/trips/new"
      className={buttonClassName({ variant: "primary", size: "sm" })}
    >
      + Start a Trip
    </Link>
  );

  if (isLoading) return <TripsSkeleton />;

  if (error) {
    return (
      <EmptyState
        tone="error"
        title="Couldn't load your trips"
        message={error}
        action={
          <Button variant="outline" size="sm" htmlType="button" onClick={reload}>
            Try again
          </Button>
        }
      />
    );
  }

  if (!trips.length) {
    return (
      <EmptyState
        icon="trips"
        title="No trips yet"
        message="Start a trip when you set off, add each city you visit, and keep your photos together."
        action={startAction}
      />
    );
  }

  const counts = {
    all: trips.length,
    active: trips.filter((t) => t.status === "active").length,
    completed: trips.filter((t) => t.status === "completed").length,
  };
  const visibleTrips =
    filter === "all" ? trips : trips.filter((trip) => trip.status === filter);

  function selectFilter(id) {
    setSearchParams(id === "all" ? {} : { status: id }, { replace: true });
  }

  return (
    <div className={styles.trips}>
      <PageHeader
        title="Your trips"
        summary={`${plural(counts.active, "active trip")} · ${plural(
          counts.completed,
          "completed trip",
        )}`}
        note={activeTrip ? "End your current trip before starting a new one." : null}
        actions={startAction}
      />

      <div className={styles.filters} role="group" aria-label="Show trips">
        {FILTERS.map((f) => (
          <button
            key={f.id}
            type="button"
            className={`${styles.filter} ${filter === f.id ? styles.filterActive : ""}`}
            aria-pressed={filter === f.id}
            onClick={() => selectFilter(f.id)}
          >
            {f.label}
            <span className={styles.filterCount}>{counts[f.id]}</span>
          </button>
        ))}
      </div>

      {!visibleTrips.length ? (
        <EmptyState
          compact
          icon="trips"
          title={filter === "active" ? "No active trip" : "No completed trips yet"}
          message={
            filter === "active"
              ? "Start a trip when you set off on your next journey."
              : "Trips you end will show up here."
          }
        />
      ) : (
        <ul className={styles.list}>
          {visibleTrips.map((trip) => (
            <TripCard
              key={trip.id}
              trip={trip}
              coverUrl={urls[getCoverPhoto(trip)?.storagePath]}
            />
          ))}
        </ul>
      )}
    </div>
  );
}

function TripCard({ trip, coverUrl }) {
  const countries = [
    ...new Map(trip.destinations.map((d) => [d.countryCode, d])).values(),
  ];
  const days = tripLengthDays(trip.startDate, trip.endDate);

  return (
    <li className={`${styles.card} ${trip.status === "active" ? styles.activeCard : ""}`}>
      <div className={styles.cover}>
        {coverUrl ? (
          <img src={coverUrl} alt="" loading="lazy" />
        ) : (
          <span className={styles.coverPlaceholder} aria-hidden="true" />
        )}
      </div>

      <div className={styles.body}>
        <div className={styles.cardHeader}>
          <TripStatusBadge status={trip.status} />
          <span className={styles.duration}>{plural(days, "day")}</span>
        </div>

        <h3 className={styles.title}>
          {/* The whole card is clickable through this link (CSS). */}
          <Link to={`/app/trips/${trip.id}`} className={styles.titleLink}>
            {trip.title}
          </Link>
        </h3>

        <p className={styles.dates}>{formatTripRange(trip.startDate, trip.endDate)}</p>

        <p className={styles.meta}>
          {plural(trip.destinations.length, "destination")}
          <span aria-hidden="true">·</span>
          {plural(trip.photos.length, "photo")}
        </p>

        {countries.length > 0 && (
          <ul className={styles.flags} aria-label="Countries">
            {countries.slice(0, 6).map((d) => (
              <li key={d.countryCode}>
                <FlagBox countryCode={d.countryCode} country={d.country} position="left" />
              </li>
            ))}
            {countries.length > 6 && (
              <li className={styles.moreFlags}>+{countries.length - 6}</li>
            )}
          </ul>
        )}
      </div>
    </li>
  );
}

function TripsSkeleton() {
  return (
    <div className={styles.trips} aria-busy="true">
      <span className={styles.srOnly} role="status">
        Loading trips…
      </span>
      <ul className={styles.list} aria-hidden="true">
        {[0, 1, 2].map((i) => (
          <li key={i} className={`${styles.card} ${styles.skeleton}`}>
            <div className={styles.cover} />
            <div className={styles.body}>
              <span className={styles.skeletonLine} style={{ width: "35%" }} />
              <span className={styles.skeletonLine} style={{ width: "70%" }} />
              <span className={styles.skeletonLine} style={{ width: "50%" }} />
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

export default Trips;
