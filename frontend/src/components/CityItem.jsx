import { Link } from "react-router-dom";
import { useState } from "react";

import styles from "./CityItem.module.css";
import { useCities } from "../contexts/CitiesContext";
import FlagBox from "./FlagBox";
import Button from "./Button";
import ConfirmDialog from "./ConfirmDialog";

const formatDate = (date) =>
  new Intl.DateTimeFormat("en", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(new Date(date));

// Machine-readable date for <time dateTime>, from local date parts (city
// dates are local calendar dates, see cityService), so it can't shift a day.
const toIsoDate = (date) => {
  const d = new Date(date);
  return [
    d.getFullYear(),
    String(d.getMonth() + 1).padStart(2, "0"),
    String(d.getDate()).padStart(2, "0"),
  ].join("-");
};

function CityItem({ city }) {
  const { currentCity, deleteCity } = useCities();

  const [showConfirm, setShowConfirm] = useState(false);

  const { cityName, date, id, position } = city;

  function handleConfirmDelete() {
    deleteCity(id);
    setShowConfirm(false);
  }

  function handleCancelDelete() {
    setShowConfirm(false);
  }

  return (
    <>
      {/* The delete button is a sibling of the link, not inside it, and is
          positioned over the row's right edge (CityItem.module.css). */}
      <li className={styles.row}>
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

          {date && (
            <time className={styles.date} dateTime={toIsoDate(date)}>
              {formatDate(date)}
            </time>
          )}
        </Link>

        <Button
          variant="ghost"
          size="sm"
          iconOnly
          htmlType="button"
          className={styles.deleteBtn}
          onClick={() => setShowConfirm(true)}
          aria-label={`Move ${cityName} to Trash`}
          title="Move to Trash"
        >
          &times;
        </Button>
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
