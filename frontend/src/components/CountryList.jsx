import Spinner from "./Spinner";
import styles from "./CountryList.module.css";
import CountryItem from "./CountryItem";
import EmptyState from "./EmptyState";
import { useCities } from "../contexts/CitiesContext";
import { getContinent } from "../utils/continent";

function CountryList() {
  const { cities, isLoading } = useCities();

  if (isLoading) return <Spinner />;

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

  console.log(countriesByContinent);

  return (
    <div className={styles.countryList}>
      {Object.entries(countriesByContinent).map(([continent, countries]) => (
        <section key={continent} className={styles.continent}>
          <h2>{continent}</h2>

          {Object.entries(countries).map(([country, cities]) => (
            <CountryItem key={country} country={country} cities={cities} />
          ))}
        </section>
      ))}
    </div>
  );
}

export default CountryList;
