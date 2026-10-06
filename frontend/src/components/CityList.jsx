import Spinner from "./Spinner";
import styles from "./CityList.module.css";
import CityItem from "./CityItem";
import Message from "./Message";
import Pagination from "./Pagination";
import { useCities } from "../contexts/CitiesContext";
import { usePagination } from "../hooks/usePagination";

const CITY_LIST_PAGE_SIZE = 10;

function CityList() {
  const { cities, isLoading } = useCities();

  const { currentPage, totalPages, startIndex, endIndex, goToPage } =
    usePagination(cities.length, CITY_LIST_PAGE_SIZE);

  if (isLoading) return <Spinner />;

  if (!cities.length) {
    return (
      <Message message="Enter your first city by clicking on a city on the map" />
    );
  }

  const paginatedCities = cities.slice(startIndex, endIndex);

  return (
    <>
      <ul className={styles.cityList}>
        {paginatedCities.map((city) => (
          <CityItem city={city} key={city.id} />
        ))}
      </ul>

      {totalPages > 1 && (
        <div className={styles.paginationWrapper}>
          <p className={styles.pageInfo}>
            Page {currentPage} of {totalPages}
          </p>
          <Pagination
            currentPage={currentPage}
            totalPages={totalPages}
            totalItems={cities.length}
            onPageChange={goToPage}
          />
        </div>
      )}
    </>
  );
}

export default CityList;
