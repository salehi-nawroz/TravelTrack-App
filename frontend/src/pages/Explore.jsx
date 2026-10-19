import { useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import PageNav from "../components/PageNav";
import Footer from "../components/Footer";
import FlagBox from "../components/FlagBox";
import SampleTripMap from "../components/SampleTripMap";
import StatsMap from "../components/StatsMap";
import TripStatusBadge from "../components/TripStatusBadge";
import { buttonClassName } from "../components/buttonClassName";
import { SAMPLE_CITIES, SAMPLE_TRAVELLER, SAMPLE_TRIPS, getSampleStats } from "../data/exploreSample";
import { formatStay, formatTripRange, tripLengthDays } from "../utils/tripDates";
import styles from "./Explore.module.css";
import { useDocumentTitle } from "../hooks/useDocumentTitle";

const plural = (count, word, words = `${word}s`) => `${count} ${count === 1 ? word : words}`;
const ALL = "all";

const isNarrow = () => window.matchMedia?.("(max-width: 899.98px)").matches;
const prefersReducedMotion = () => window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

// /explore: a public, read-only demo of TravelTrack with a fictional
// traveller's sample data (data/exploreSample.js). Nothing here talks to
// Supabase - there's no account, and nothing a visitor does is saved.
export default function Explore() {
  useDocumentTitle("Explore");
  const stats = useMemo(getSampleStats, []);
  const [selectedId, setSelectedId] = useState(SAMPLE_TRIPS[0].id);
  const [activeDestinationId, setActiveDestinationId] = useState(null);
  const [focusRequest, setFocusRequest] = useState(null);
  const counter = useRef(0);
  const mapRef = useRef(null);
  const listRef = useRef(null);

  const trip = SAMPLE_TRIPS.find((t) => t.id === selectedId) ?? null;

  const countries = useMemo(() => {
    const byCountry = new Map();
    for (const city of SAMPLE_CITIES) {
      const entry = byCountry.get(city.countryCode) ?? { code: city.countryCode, name: city.country, cities: [] };
      entry.cities.push(city);
      byCountry.set(city.countryCode, entry);
    }
    return [...byCountry.values()].sort((a, b) => a.name.localeCompare(b.name));
  }, []);

  function selectTrip(id) {
    setSelectedId(id);
    setActiveDestinationId(null);
    setFocusRequest(null);
  }

  // Show a stop on the map (switching to its trip first if needed). On
  // narrow screens the map sits above the list, so scroll it into view.
  function focusStop(tripId, destinationId) {
    if (tripId !== selectedId) setSelectedId(tripId);
    setActiveDestinationId(destinationId);
    setFocusRequest({ destinationId, n: ++counter.current });
    if (isNarrow()) {
      mapRef.current?.scrollIntoView({ block: "center", behavior: prefersReducedMotion() ? "auto" : "smooth" });
    }
  }

  // "Show in itinerary" from a map popup.
  function showInList(destinationId) {
    setActiveDestinationId(destinationId);
    requestAnimationFrame(() => {
      const button = listRef.current?.querySelector(`[data-stop="${destinationId}"] button`);
      button?.focus({ preventScroll: true });
      button?.scrollIntoView({ block: "center", behavior: prefersReducedMotion() ? "auto" : "smooth" });
    });
  }

  const statTiles = [
    { value: stats.countriesVisited, label: "Countries" },
    { value: stats.citiesVisited, label: "Cities" },
    { value: stats.tripCount, label: "Trips" },
    { value: stats.daysTravelling, label: "Days on the road" },
    { value: stats.continents, label: "Continents" },
    { value: `${Math.round(stats.worldPercent)}%`, label: "Of the world" },
  ];

  return (
    <main className={styles.explore}>
      <PageNav />

      <header className={styles.intro}>
        <p className={styles.eyebrow}>Interactive demo</p>
        <h1>Explore a traveller&apos;s world</h1>
        <p className={styles.lead}>
          Browse the trips, cities and statistics of {SAMPLE_TRAVELLER}. Pick a trip to see
          its route on the map, or tap any stop for the details.
        </p>
        <p className={styles.demoNote}>
          <span aria-hidden="true">●</span> Sample data only. No real accounts are shown and
          nothing you do here is saved.
        </p>
        <div className={styles.introActions}>
          <Link to="/login" className={buttonClassName({ variant: "primary" })}>
            Log in to track your own
          </Link>
        </div>
      </header>

      <section aria-label="Travel statistics" className={styles.stats}>
        {statTiles.map((tile) => (
          <div key={tile.label} className={styles.stat}>
            <span className={styles.statValue}>{tile.value}</span>
            <span className={styles.statLabel}>{tile.label}</span>
          </div>
        ))}
      </section>

      <section className={styles.demo} aria-label="Trips and map">
        <div className={styles.mapColumn} ref={mapRef}>
          <SampleTripMap
            trip={trip}
            cities={SAMPLE_CITIES}
            activeDestinationId={activeDestinationId}
            focusRequest={focusRequest}
            onSelectDestination={setActiveDestinationId}
            onShowInItinerary={showInList}
            onSelectTrip={selectTrip}
            className={styles.map}
            label={trip ? `Map of the ${trip.title} trip` : "Map of all sample places"}
          />
          <p className={styles.mapCaption} role="status">
            {trip
              ? `${trip.title}: ${plural(trip.destinations.length, "stop")}, ${formatTripRange(trip.startDate, trip.endDate)}`
              : `All places: ${plural(SAMPLE_CITIES.length, "city", "cities")} in ${plural(countries.length, "country", "countries")}`}
          </p>
        </div>

        <div className={styles.panel} ref={listRef}>
          <div className={styles.tripPicker} role="group" aria-label="Choose what to show on the map">
            <button
              type="button"
              className={`${styles.tripOption} ${selectedId === ALL ? styles.selected : ""}`}
              aria-pressed={selectedId === ALL}
              onClick={() => selectTrip(ALL)}
            >
              <span className={styles.tripOptionTitle}>All places</span>
              <span className={styles.tripOptionMeta}>
                {plural(SAMPLE_CITIES.length, "city", "cities")} · {plural(countries.length, "country", "countries")}
              </span>
            </button>
            {SAMPLE_TRIPS.map((t) => (
              <button
                key={t.id}
                type="button"
                className={`${styles.tripOption} ${selectedId === t.id ? styles.selected : ""}`}
                aria-pressed={selectedId === t.id}
                onClick={() => selectTrip(t.id)}
              >
                <span className={styles.tripOptionTitle}>{t.title}</span>
                <span className={styles.tripOptionMeta}>
                  {formatTripRange(t.startDate, t.endDate)} · {plural(t.destinations.length, "stop")}
                </span>
              </button>
            ))}
          </div>

          {trip ? (
            <article className={styles.details} aria-labelledby="explore-trip-title">
              <div className={styles.detailsHeader}>
                <TripStatusBadge status={trip.status} />
                <span className={styles.days}>{plural(tripLengthDays(trip.startDate, trip.endDate), "day")}</span>
              </div>
              <h2 id="explore-trip-title">{trip.title}</h2>
              <p className={styles.dates}>{formatTripRange(trip.startDate, trip.endDate)}</p>
              <p className={styles.description}>{trip.description}</p>

              <h3 className={styles.subheading}>Itinerary</h3>
              <ol className={styles.stops}>
                {trip.destinations.map((d, i) => (
                  <li
                    key={d.id}
                    data-stop={d.id}
                    className={`${styles.stop} ${d.id === activeDestinationId ? styles.activeStop : ""}`}
                  >
                    <span className={styles.stopNumber} aria-hidden="true">{i + 1}</span>
                    <div className={styles.stopBody}>
                      <button
                        type="button"
                        className={styles.stopButton}
                        onClick={() => focusStop(trip.id, d.id)}
                        aria-label={`Show ${d.cityName}, stop ${i + 1}, on the map`}
                      >
                        <FlagBox countryCode={d.countryCode} country={d.country} position="left" />
                        <strong>{d.cityName}</strong>
                        <span className={styles.stopCountry}>{d.country}</span>
                      </button>
                      <span className={styles.stay}>{formatStay(d)}</span>
                      {d.notes && <p className={styles.notes}>{d.notes}</p>}
                    </div>
                  </li>
                ))}
              </ol>
            </article>
          ) : (
            <article className={styles.details} aria-labelledby="explore-all-title">
              <h2 id="explore-all-title">Every place visited</h2>
              <p className={styles.description}>
                Grouped by country. Pick a city to see it on its trip&apos;s route.
              </p>
              <ul className={styles.countries}>
                {countries.map((country) => (
                  <li key={country.code}>
                    <h3 className={styles.countryName}>
                      <FlagBox countryCode={country.code} country={country.name} position="left" />
                      {country.name}
                      <span className={styles.count}>{country.cities.length}</span>
                    </h3>
                    <ul className={styles.cityList}>
                      {country.cities.map((city) => (
                        <li key={city.id} data-stop={city.id}>
                          <button
                            type="button"
                            className={styles.cityButton}
                            onClick={() => focusStop(city.tripId, city.id)}
                            aria-label={`Show ${city.cityName} on the ${city.tripTitle} route`}
                          >
                            {city.cityName}
                            <span className={styles.cityTrip}>{city.tripTitle}</span>
                          </button>
                        </li>
                      ))}
                    </ul>
                  </li>
                ))}
              </ul>
            </article>
          )}
        </div>
      </section>

      <section className={styles.countriesSection} aria-labelledby="explore-countries-title">
        <h2 id="explore-countries-title">Countries on the map</h2>
        <p className={styles.description}>
          {plural(stats.countriesVisited, "country", "countries")} visited - about{" "}
          {Math.round(stats.worldPercent)}% of the world. Hover or tap a country for its city count.
        </p>
        <StatsMap countryCodes={stats.countryCodes} cityCountByCode={stats.cityCountByCode} />
      </section>

      <section className={styles.cta}>
        <h2>Ready to map your own travels?</h2>
        <p>Your cities, trips and photos stay private to your account.</p>
        <div className={styles.ctaActions}>
          <Link to="/login" className={buttonClassName({ variant: "primary" })}>
            Log in to TravelTrack
          </Link>
          <Link to="/signup" className={styles.textLink}>
            New here? Create an account
          </Link>
        </div>
      </section>

      <Footer showCredits />
    </main>
  );
}
