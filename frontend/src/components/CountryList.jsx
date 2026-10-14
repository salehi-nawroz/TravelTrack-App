import Spinner from "./Spinner";
import styles from "./CountryList.module.css";
import CountryItem from "./CountryItem";
import EmptyState from "./EmptyState";
import PageHeader from "./PageHeader";
import { useCities } from "../contexts/CitiesContext";
import { getContinent } from "../utils/continent";

const plural = (count, word, words = `${word}s`) =>
  `${count} ${count === 1 ? word : words}`;

function CountryList() {
  const { cities, isLoading } = useCities();

  if (isLoading) return <Spinner label="Loading countries…" />;

  if (!cities.length)
    return (
      <EmptyState
        icon="countries"
        title="No countries yet"
        message="Click a city on the map to add your first country."
      />
    );

  const countriesByContinent = cities.reduce((acc, city) => {
    const continent = getContinent(city.countryCode);

    if (!acc[continent]) {
      acc[continent] = {};
    }

    if (!acc[continent][city.country]) {
      acc[continent][city.country] = [];
    }

    acc[continent][city.country].push(city);

    return acc;
  }, {});

  const continentCount = Object.keys(countriesByContinent).length;
  const countryCount = Object.values(countriesByContinent).reduce(
    (total, countries) => total + Object.keys(countries).length,
    0,
  );

  return (
    <div className={styles.countryList}>
      <PageHeader
        title="Your countries"
        summary={`${plural(countryCount, "country", "countries")} · ${plural(
          continentCount,
          "continent",
        )}`}
      />

      {Object.entries(countriesByContinent).map(([continent, countries]) => (
        <section key={continent} className={styles.continent}>
          <h3>{continent}</h3>

          {Object.entries(countries).map(([country, cities]) => (
            <CountryItem key={country} country={country} cities={cities} />
          ))}
        </section>
      ))}
    </div>
  );
}

export default CountryList;
