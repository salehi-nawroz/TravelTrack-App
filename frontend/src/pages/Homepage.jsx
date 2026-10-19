import { Link } from "react-router-dom";
import styles from "./Homepage.module.css";
import PageNav from "../components/PageNav";
import Footer from "../components/Footer";
import FlagBox from "../components/FlagBox";
import NavIcon from "../components/NavIcon";
import SampleTripMap from "../components/SampleTripMap";
import TripStatusBadge from "../components/TripStatusBadge";
import { buttonClassName } from "../components/buttonClassName";
import { SAMPLE_CITIES, SAMPLE_TRIPS, getSampleStats } from "../data/exploreSample";
import { formatTripDate, formatTripRange, toIsoDate, tripLengthDays } from "../utils/tripDates";

const FEATURES = [
  {
    icon: "countries",
    title: "Your world map",
    text: "Every city you've visited pinned on one interactive map, with the countries you've explored highlighted.",
  },
  {
    icon: "cities",
    title: "Cities and memories",
    text: "Log each place with its date and notes, search the map to add new ones, and keep a Trash for second thoughts.",
  },
  {
    icon: "trips",
    title: "Trips with routes",
    text: "Start a trip, add stops as you go and see the route drawn on the map. Private photo galleries keep the moments together.",
  },
  {
    icon: "stats",
    title: "Travel statistics",
    text: "Countries, cities, visits per year, your longest trip and how much of the world you've seen - all calculated for you.",
  },
];

const STEPS = [
  { title: "Pin the places", text: "Click the map or search for a city, add the date and a note." },
  { title: "Group them into trips", text: "Start a trip, add destinations in order, upload photos and end it when you're home." },
  { title: "Watch your map grow", text: "Your countries, routes and statistics update as you travel." },
];

const previewTrip = SAMPLE_TRIPS[0];
const previewCities = [...SAMPLE_CITIES].sort((a, b) => b.date - a.date).slice(0, 4);
const stats = getSampleStats();
const maxYearVisits = Math.max(...stats.visitsPerYear.map((y) => y.visits));

export default function Homepage() {
  return (
    <main className={styles.homepage}>
      <section className={styles.hero}>
        <PageNav />
        <div className={styles.heroContent}>
          <p className={styles.eyebrow}>Your personal travel journal</p>
          <h1>
            Every city you&apos;ve visited.
            <br />
            <span className={styles.highlight}>One map.</span>
          </h1>
          <p className={styles.lead}>
            TravelTrack maps your footsteps into every city you&apos;ve explored, turns them into
            trips with routes and photos, and shows you how far you&apos;ve wandered.
          </p>
          <div className={styles.actions}>
            <Link to="/login" className={`${buttonClassName({ variant: "primary" })} ${styles.bigButton}`}>
              Start tracking
            </Link>
            <Link to="/explore" className={`${buttonClassName({ variant: "outline" })} ${styles.bigButton}`}>
              Explore the demo
            </Link>
          </div>
          <ul className={styles.assurances}>
            <li>Private to your account</li>
            <li>Works on phone, tablet and desktop</li>
            <li>Built with React, Leaflet and Supabase</li>
          </ul>
        </div>
      </section>

      <section className={styles.section} aria-labelledby="features-title">
        <p className={styles.sectionEyebrow}>What you get</p>
        <h2 id="features-title">Everything about your travels, in one place</h2>
        <ul className={styles.features}>
          {FEATURES.map((feature) => (
            <li key={feature.title} className={styles.feature}>
              <span className={styles.featureIcon}>
                <NavIcon id={feature.icon} className={styles.icon} />
              </span>
              <h3>{feature.title}</h3>
              <p>{feature.text}</p>
            </li>
          ))}
        </ul>
      </section>

      <section className={styles.section} aria-labelledby="preview-title">
        <p className={styles.sectionEyebrow}>A look inside</p>
        <h2 id="preview-title">See it before you sign in</h2>
        <p className={styles.sectionLead}>
          These previews use sample data from a fictional traveller - the same data you can browse
          in the interactive demo.
        </p>

        <div className={styles.previewGrid}>
          <figure className={`${styles.previewCard} ${styles.mapPreview}`}>
            <SampleTripMap
              trip={previewTrip}
              cities={SAMPLE_CITIES}
              interactive={false}
              className={styles.previewMap}
              label={`Preview map of the sample ${previewTrip.title} trip`}
            />
            <figcaption>
              <strong>Map &amp; routes</strong> - {previewTrip.title}, {previewTrip.destinations.length} stops
              in order
            </figcaption>
          </figure>

          <figure className={styles.previewCard}>
            <figcaption className={styles.previewTitle}>
              <NavIcon id="cities" className={styles.previewIcon} /> Recent cities
            </figcaption>
            <ul className={styles.cityRows}>
              {previewCities.map((city) => (
                <li key={city.id} className={styles.cityRow}>
                  <FlagBox countryCode={city.countryCode} country={city.country} position="left" />
                  <span className={styles.cityName}>{city.cityName}</span>
                  <time dateTime={toIsoDate(city.date)}>{formatTripDate(toIsoDate(city.date))}</time>
                </li>
              ))}
            </ul>
          </figure>

          <figure className={styles.previewCard}>
            <figcaption className={styles.previewTitle}>
              <NavIcon id="trips" className={styles.previewIcon} /> Trips
            </figcaption>
            <div className={styles.tripCard}>
              <div className={styles.tripCardHeader}>
                <TripStatusBadge status={previewTrip.status} />
                <span className={styles.days}>
                  {tripLengthDays(previewTrip.startDate, previewTrip.endDate)} days
                </span>
              </div>
              <strong className={styles.tripTitle}>{previewTrip.title}</strong>
              <span className={styles.tripDates}>{formatTripRange(previewTrip.startDate, previewTrip.endDate)}</span>
              <ol className={styles.tripStops}>
                {previewTrip.destinations.map((d, i) => (
                  <li key={d.id}>
                    <span aria-hidden="true">{i + 1}</span>
                    {d.cityName}
                  </li>
                ))}
              </ol>
            </div>
          </figure>

          <figure className={styles.previewCard}>
            <figcaption className={styles.previewTitle}>
              <NavIcon id="stats" className={styles.previewIcon} /> Statistics
            </figcaption>
            <dl className={styles.statTiles}>
              <div>
                <dt>Countries</dt>
                <dd>{stats.countriesVisited}</dd>
              </div>
              <div>
                <dt>Cities</dt>
                <dd>{stats.citiesVisited}</dd>
              </div>
              <div>
                <dt>Trips</dt>
                <dd>{stats.tripCount}</dd>
              </div>
            </dl>
            <div className={styles.bars} role="img" aria-label="Visits per year in the sample data">
              {stats.visitsPerYear.map((y) => (
                <div key={y.year} className={styles.bar}>
                  <span style={{ height: `${(y.visits / maxYearVisits) * 100}%` }} />
                  <small>{y.year}</small>
                </div>
              ))}
            </div>
          </figure>
        </div>

        <Link to="/explore" className={styles.textLink}>
          Open the interactive demo &rarr;
        </Link>
      </section>

      <section className={styles.section} aria-labelledby="steps-title">
        <p className={styles.sectionEyebrow}>How it works</p>
        <h2 id="steps-title">Three steps to your travel map</h2>
        <ol className={styles.steps}>
          {STEPS.map((step, i) => (
            <li key={step.title} className={styles.step}>
              <span className={styles.stepNumber} aria-hidden="true">{i + 1}</span>
              <h3>{step.title}</h3>
              <p>{step.text}</p>
            </li>
          ))}
        </ol>
      </section>

      <section className={styles.cta} aria-labelledby="cta-title">
        <h2 id="cta-title">Start your travel map today</h2>
        <p>Log in to pin your first city - or take the demo for a spin first.</p>
        <div className={styles.actions}>
          <Link to="/login" className={`${buttonClassName({ variant: "primary" })} ${styles.bigButton}`}>
            Log in
          </Link>
          <Link to="/explore" className={`${buttonClassName({ variant: "outline" })} ${styles.bigButton}`}>
            Explore the demo
          </Link>
        </div>
      </section>

      <div className={styles.footer}>
        <Footer />
      </div>
    </main>
  );
}
