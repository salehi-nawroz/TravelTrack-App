import { Link } from "react-router-dom";
import { useState } from "react";

import styles from "./CityItem.module.css";
import { useCities } from "../contexts/CitiesContext";
import FlagBox from "./FlagBox";
import ConfirmDialog from "./ConfirmDialog";

const formatDate = (date) =>
  new Intl.DateTimeFormat("en", {
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(new Date(date));

function CityItem({ city }) {
  const { currentCity, deleteCity } = useCities();

  const [showConfirm, setShowConfirm] = useState(false);

  const { cityName, date, id, position } = city;

  function handleDelete(e) {
    e.preventDefault();
    setShowConfirm(true);
  }

  function handleConfirmDelete() {
    deleteCity(id);
    setShowConfirm(false);
  }

  function handleCancelDelete() {
    setShowConfirm(false);
  }

  return (
    <>
      <li>
        <Link
          className={`${styles.cityItem} ${
            id === currentCity.id ? styles["cityItem--active"] : ""
          }`}
          to={`${id}?lat=${position.lat}&lng=${position.lng}`}
        >
          <FlagBox
            countryCode={city.countryCode}
            country={city.countryName}
            position="left"
          />

          <h3 className={styles.name}>{cityName}</h3>

          <time className={styles.date}>({formatDate(date)})</time>

          <button
            className={styles.deleteBtn}
            onClick={handleDelete}
            aria-label={`Move ${cityName} to Trash`}
          >
            &times;
          </button>
        </Link>
      </li>

      {showConfirm && (
        <ConfirmDialog
          title="Move to Trash?"
          message={
            <>
              Move <strong>{cityName}</strong> to the Trash?
            </>
          }
          confirmLabel="Move to Trash"
          warning="You can restore it from the Trash."
          onConfirm={handleConfirmDelete}
          onCancel={handleCancelDelete}
        />
      )}
    </>
  );
}

export default CityItem;
